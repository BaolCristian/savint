import { Server as SocketIOServer, Socket } from "socket.io";
import { prisma } from "@/lib/db/client";
import { checkAnswer, calculateScore, calculatePartialScore, applyConfidence } from "@/lib/scoring";
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  QuestionOptions,
  MultipleChoiceOptions,
  OrderingOptions,
  MatchingOptions,
  SpotErrorOptions,
  NumericEstimationOptions,
  ImageHotspotOptions,
  CodeCompletionOptions,
} from "@/types";
import type { QuestionType } from "@prisma/client";

// ---------------------------------------------------------------------------
// In-memory game state
// ---------------------------------------------------------------------------

interface PlayerInfo {
  socketId: string;
  name: string;
  email?: string;
  avatar?: string;
  totalScore: number;
  /** Score delta earned on the current question (reset each round) */
  lastDelta: number;
}

interface GameState {
  sessionId: string;
  currentQuestionIndex: number;
  players: Map<string, PlayerInfo>; // keyed by playerName
  questionStartTime?: number;
  answerCount: number;
  confidenceCount: number;
  /** Cache of questions for the session (loaded once on startGame) */
  questions: {
    id: string;
    text: string;
    type: QuestionType;
    options: QuestionOptions;
    timeLimit: number;
    points: number;
    mediaUrl: string | null;
    order: number;
    confidenceEnabled: boolean;
  }[];
  hostSocketId?: string;
}

const games = new Map<string, GameState>(); // keyed by sessionId

// Track disconnected players for reconnection (sessionId:playerName → timeout)
const disconnectedPlayers = new Map<string, {
  player: PlayerInfo;
  sessionId: string;
  timeout: ReturnType<typeof setTimeout>;
}>();

const RECONNECT_GRACE_PERIOD_MS =
  (Number(process.env.RECONNECT_GRACE_MINUTES) || 10) * 60 * 1000;
const SESSION_TIMEOUT_MS =
  (Number(process.env.SESSION_TIMEOUT_HOURS) || 2) * 60 * 60 * 1000;
const SESSION_RETENTION_DAYS =
  Number(process.env.SESSION_RETENTION_DAYS) || 365;

function disconnectKey(sessionId: string, playerName: string) {
  return `${sessionId}:${playerName}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the room name for a session */
function room(sessionId: string) {
  return `session:${sessionId}`;
}

/** Sanitize question options so players don't see correct answers */
function sanitizeOptions(
  type: QuestionType,
  options: QuestionOptions
): QuestionOptions {
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const mc = options as MultipleChoiceOptions;
      const correctCount = mc.choices.filter((c) => c.isCorrect).length;
      return {
        choices: mc.choices.map((c) => ({ text: c.text, isCorrect: false })),
        correctCount,
      } as any;
    }
    case "TRUE_FALSE":
      // Player just sees true/false buttons; no need to reveal correct value
      return { correct: false } as any;
    case "OPEN_ANSWER":
      // Player just sees a text input
      return { acceptedAnswers: [] } as any;
    case "ORDERING": {
      const ord = options as OrderingOptions;
      // Send items in a shuffled order; correctOrder is hidden
      const shuffled = [...ord.items].sort(() => Math.random() - 0.5);
      return { items: shuffled, correctOrder: [] } as any;
    }
    case "MATCHING": {
      const mat = options as MatchingOptions;
      const lefts = mat.pairs.map((p) => p.left);
      const rights = mat.pairs.map((p) => p.right).sort(() => Math.random() - 0.5);
      return { pairs: lefts.map((l, i) => ({ left: l, right: rights[i] })) } as MatchingOptions;
    }
    case "SPOT_ERROR": {
      const se = options as SpotErrorOptions;
      return { lines: se.lines, errorIndices: [], explanation: undefined } as any;
    }
    case "NUMERIC_ESTIMATION": {
      const ne = options as NumericEstimationOptions;
      return { correctValue: 0, tolerance: 0, maxRange: 0, unit: ne.unit } as any;
    }
    case "IMAGE_HOTSPOT": {
      const ih = options as ImageHotspotOptions;
      return { imageUrl: ih.imageUrl, hotspot: { x: 0, y: 0, radius: 0 }, tolerance: 0 } as any;
    }
    case "CODE_COMPLETION": {
      const cc = options as CodeCompletionOptions;
      if (cc.mode === "choice" && cc.choices) {
        const shuffled = [...cc.choices].sort(() => Math.random() - 0.5);
        return {
          codeLines: cc.codeLines,
          blankLineIndex: cc.blankLineIndex,
          correctAnswer: "",
          mode: cc.mode,
          choices: shuffled,
        } as any;
      }
      return {
        codeLines: cc.codeLines,
        blankLineIndex: cc.blankLineIndex,
        correctAnswer: "",
        mode: cc.mode,
      } as any;
    }
    default:
      return options;
  }
}

/** Count real players (excluding __host__) */
function realPlayerCount(game: GameState) {
  return game.players.has("__host__")
    ? game.players.size - 1
    : game.players.size;
}

/** Build sorted leaderboard from a game state */
function buildLeaderboard(game: GameState) {
  return [...game.players.values()]
    .filter((p) => p.name !== "__host__")
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((p) => ({
      playerName: p.name,
      score: p.totalScore,
      delta: p.lastDelta,
      playerAvatar: p.avatar,
    }));
}

/** Build answer distribution string map for the current question */
function buildDistribution(
  type: QuestionType,
  answers: { value: any; isCorrect: boolean }[],
  questionOptions?: any
): Record<string, number> {
  const dist: Record<string, number> = {};

  switch (type) {
    case "MULTIPLE_CHOICE": {
      const choices: { text: string; isCorrect: boolean }[] =
        questionOptions?.choices ?? [];
      // Initialize all choices with 0 so every option appears in the chart
      for (const c of choices) {
        dist[c.text] = 0;
      }
      for (const a of answers) {
        const selected: number[] = (a.value as any).selected ?? [];
        // Map each selected index to the choice text
        for (const idx of selected) {
          const text = choices[idx]?.text;
          if (text) {
            dist[text] = (dist[text] || 0) + 1;
          }
        }
      }
      break;
    }
    case "TRUE_FALSE":
      // Initialize both options so the correct answer always appears
      dist["true"] = 0;
      dist["false"] = 0;
      for (const a of answers) {
        const key = String((a.value as any).selected);
        dist[key] = (dist[key] || 0) + 1;
      }
      break;
    case "OPEN_ANSWER":
      for (const a of answers) {
        const key = String((a.value as any).text ?? "").toLowerCase().trim();
        dist[key] = (dist[key] || 0) + 1;
      }
      break;
    default:
      dist["correct"] = answers.filter((a) => a.isCorrect).length;
      dist["incorrect"] = answers.filter((a) => !a.isCorrect).length;
      break;
  }

  return dist;
}

// ---------------------------------------------------------------------------
// Socket handler setup
// ---------------------------------------------------------------------------

type TypedIO = SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;

export function setupSocketHandlers(io: TypedIO) {
  // ----- Periodic session cleanup -----
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
      const expired = await prisma.session.findMany({
        where: {
          status: { in: ["LOBBY", "IN_PROGRESS"] },
          createdAt: { lt: cutoff },
        },
        select: { id: true },
      });

      for (const { id } of expired) {
        await prisma.session.update({
          where: { id },
          data: { status: "FINISHED", endedAt: new Date() },
        });

        // Clean up in-memory state and notify connected clients
        const game = games.get(id);
        if (game) {
          io.to(room(id)).emit("gameOver", { podium: [], fullResults: [] });
          games.delete(id);
        }

        console.log(`[cleanup] Session ${id} auto-terminated (timeout)`);
      }

      // GDPR: delete finished sessions older than retention period
      const retentionCutoff = new Date(
        Date.now() - SESSION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
      );
      const oldSessions = await prisma.session.findMany({
        where: {
          status: "FINISHED",
          createdAt: { lt: retentionCutoff },
        },
        select: { id: true },
      });

      for (const { id } of oldSessions) {
        await prisma.answer.deleteMany({ where: { sessionId: id } });
        await prisma.session.delete({ where: { id } });
        console.log(`[cleanup] Session ${id} deleted (GDPR retention: ${SESSION_RETENTION_DAYS}d)`);
      }
    } catch (err) {
      console.error("[cleanup] Error during session cleanup:", err);
    }
  }, 15 * 60 * 1000); // run every 15 minutes

  io.on("connection", (socket: TypedSocket) => {
    /** Track which session + playerName this socket belongs to */
    let currentSessionId: string | null = null;
    let currentPlayerName: string | null = null;

    // ------------------------------------------------------------------
    // joinSession
    // ------------------------------------------------------------------
    socket.on("joinSession", async ({ pin, playerName, playerEmail, playerAvatar }) => {
      try {
        const session = await prisma.session.findUnique({
          where: { pin },
          include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
        });

        if (!session) {
          socket.emit("sessionError", { message: "Invalid PIN" });
          return;
        }

        if (session.status === "FINISHED") {
          socket.emit("sessionError", { message: "This session has already ended" });
          return;
        }

        const sessionId = session.id;
        currentSessionId = sessionId;
        currentPlayerName = playerName;

        // Initialise game state if first join
        if (!games.has(sessionId)) {
          games.set(sessionId, {
            sessionId,
            currentQuestionIndex: -1,
            players: new Map(),
            answerCount: 0,
            confidenceCount: 0,
            questions: session.quiz.questions.map((q) => ({
              id: q.id,
              text: q.text,
              type: q.type,
              options: q.options as unknown as QuestionOptions,
              timeLimit: q.timeLimit,
              points: q.points,
              mediaUrl: q.mediaUrl,
              order: q.order,
              confidenceEnabled: (q as any).confidenceEnabled ?? false,
            })),
          });
        }

        const game = games.get(sessionId)!;

        // Add / update player
        game.players.set(playerName, {
          socketId: socket.id,
          name: playerName,
          email: playerEmail,
          avatar: playerAvatar,
          totalScore: game.players.get(playerName)?.totalScore ?? 0,
          lastDelta: 0,
        });

        socket.join(room(sessionId));

        // Notify everyone in the room
        io.to(room(sessionId)).emit("playerJoined", {
          playerName,
          playerCount: realPlayerCount(game),
          playerAvatar: playerAvatar,
        });

        // If host is rejoining an in-progress game, update hostSocketId
        // and re-emit the current question so the host view recovers
        if (playerName === "__host__" && game.currentQuestionIndex >= 0) {
          game.hostSocketId = socket.id;
          const q = game.questions[game.currentQuestionIndex];
          if (q) {
            socket.emit("questionStart", {
              questionIndex: game.currentQuestionIndex,
              totalQuestions: game.questions.length,
              question: {
                text: q.text,
                type: q.type,
                options: q.options, // host sees full options (not sanitized)
                timeLimit: q.timeLimit,
                points: q.points,
                mediaUrl: q.mediaUrl,
              },
            });
          }
        }

        // Send current game state to the newly joined player
        socket.emit("gameState", {
          sessionId,
          status: session.status,
          currentQuestion:
            game.currentQuestionIndex >= 0
              ? game.currentQuestionIndex
              : undefined,
        });

        // If session is in progress and there's an active question,
        // send it to the late-joining player so they can answer
        if (
          session.status === "IN_PROGRESS" &&
          playerName !== "__host__" &&
          game.currentQuestionIndex >= 0
        ) {
          const q = game.questions[game.currentQuestionIndex];
          if (q) {
            socket.emit("questionStart", {
              questionIndex: game.currentQuestionIndex,
              totalQuestions: game.questions.length,
              question: {
                text: q.text,
                type: q.type,
                options: sanitizeOptions(q.type, q.options),
                timeLimit: q.timeLimit,
                points: q.points,
                mediaUrl: q.mediaUrl,
              },
            });
          }
        }
      } catch (err) {
        console.error("joinSession error:", err);
        socket.emit("sessionError", { message: "Failed to join session" });
      }
    });

    // ------------------------------------------------------------------
    // startGame (host only)
    // ------------------------------------------------------------------
    socket.on("startGame", async () => {
      const game = findGameForSocket(socket);
      if (!game) return;

      try {
        game.hostSocketId = socket.id;

        await prisma.session.update({
          where: { id: game.sessionId },
          data: { status: "IN_PROGRESS", startedAt: new Date() },
        });

        // Emit the first question
        emitQuestion(io, game, 0);
      } catch (err) {
        console.error("startGame error:", err);
        socket.emit("sessionError", { message: "Failed to start game" });
      }
    });

    // ------------------------------------------------------------------
    // nextQuestion (host only)
    // ------------------------------------------------------------------
    socket.on("nextQuestion", () => {
      const game = findGameForSocket(socket);
      if (!game) return;

      const nextIdx = game.currentQuestionIndex + 1;
      if (nextIdx >= game.questions.length) {
        socket.emit("sessionError", { message: "No more questions" });
        return;
      }

      emitQuestion(io, game, nextIdx);
    });

    // ------------------------------------------------------------------
    // submitAnswer
    // ------------------------------------------------------------------
    socket.on("submitAnswer", async ({ value, responseTimeMs }) => {
      if (!currentSessionId || !currentPlayerName) return;

      const game = games.get(currentSessionId);
      if (!game || game.currentQuestionIndex < 0) return;

      const question = game.questions[game.currentQuestionIndex];
      if (!question) return;

      // Reject answers submitted after the time limit (with 2s grace for network lag)
      if (game.questionStartTime) {
        const elapsed = Date.now() - game.questionStartTime;
        const deadlineMs = (question.timeLimit + 2) * 1000;
        if (elapsed > deadlineMs) return;
      }

      const isCorrect = checkAnswer(question.type, question.options, value);

      // Calculate score: use partial scoring for types that support it
      let score: number;
      const partialTypes = ["MULTIPLE_CHOICE", "SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT"];
      if (partialTypes.includes(question.type)) {
        const rawPartial = calculatePartialScore(question.type, question.options, value, question.points);
        const timeLimitMs = question.timeLimit * 1000;
        const timeRatio = Math.min(responseTimeMs / timeLimitMs, 1);
        const timeMultiplier = 1.0 - timeRatio * 0.5;
        score = Math.round(rawPartial * timeMultiplier);
      } else {
        score = calculateScore({
          isCorrect,
          responseTimeMs,
          timeLimit: question.timeLimit,
          maxPoints: question.points,
        });
      }

      // Update in-memory state
      const player = game.players.get(currentPlayerName);
      if (player) {
        player.totalScore += score;
        player.lastDelta = score;
      }

      game.answerCount += 1;

      // Persist answer to DB
      try {
        await prisma.answer.upsert({
          where: {
            sessionId_questionId_playerName: {
              sessionId: game.sessionId,
              questionId: question.id,
              playerName: currentPlayerName,
            },
          },
          create: {
            sessionId: game.sessionId,
            questionId: question.id,
            playerName: currentPlayerName,
            playerEmail: player?.email ?? null,
            value: value as any,
            isCorrect,
            responseTimeMs,
            score,
          },
          update: {
            value: value as any,
            isCorrect,
            responseTimeMs,
            score,
          },
        });
      } catch (err) {
        console.error("submitAnswer DB error:", err);
      }

      // Compute position and class correct %
      const leaderboard = buildLeaderboard(game);
      const position =
        leaderboard.findIndex((l) => l.playerName === currentPlayerName) + 1;

      // Count how many got it right so far this round
      const correctCount = [...game.players.values()].filter(
        (p) => p.lastDelta > 0
      ).length;
      const total = realPlayerCount(game);
      const classCorrectPercent =
        total > 0
          ? Math.round((correctCount / total) * 100)
          : 0;

      // Feedback to the answering player only
      socket.emit("answerFeedback", {
        isCorrect,
        score,
        totalScore: player?.totalScore ?? 0,
        position,
        classCorrectPercent,
        confidenceEnabled: question.confidenceEnabled,
      });

      // Broadcast answer count to room
      io.to(room(game.sessionId)).emit("answerCount", {
        count: game.answerCount,
        total,
      });
    });

    // ------------------------------------------------------------------
    // submitConfidence
    // ------------------------------------------------------------------
    socket.on("submitConfidence", async ({ confidenceLevel }) => {
      if (!currentSessionId || !currentPlayerName) return;

      const game = games.get(currentSessionId);
      if (!game || game.currentQuestionIndex < 0) return;

      const question = game.questions[game.currentQuestionIndex];
      if (!question || !question.confidenceEnabled) return;

      const player = game.players.get(currentPlayerName);
      if (!player) return;

      const oldDelta = player.lastDelta;
      const isCorrect = oldDelta > 0;
      const newDelta = applyConfidence(oldDelta, isCorrect, confidenceLevel);
      const diff = newDelta - oldDelta;

      player.totalScore += diff;
      player.lastDelta = newDelta;

      try {
        await prisma.answer.update({
          where: {
            sessionId_questionId_playerName: {
              sessionId: game.sessionId,
              questionId: question.id,
              playerName: currentPlayerName,
            },
          },
          data: {
            confidenceLevel,
            score: newDelta,
          },
        });
      } catch (err) {
        console.error("submitConfidence DB error:", err);
      }

      const leaderboard = buildLeaderboard(game);
      const position = leaderboard.findIndex((l) => l.playerName === currentPlayerName) + 1;

      socket.emit("answerFeedback", {
        isCorrect,
        score: newDelta,
        totalScore: player.totalScore,
        position,
        classCorrectPercent: 0,
        confidenceEnabled: false,
      });

      // Broadcast confidence count to host
      game.confidenceCount += 1;
      const total = realPlayerCount(game);
      io.to(room(game.sessionId)).emit("confidenceCount", {
        count: game.confidenceCount,
        total,
      });
    });

    // ------------------------------------------------------------------
    // showResults (host only)
    // ------------------------------------------------------------------
    socket.on("showResults", async () => {
      const game = findGameForSocket(socket);
      if (!game || game.currentQuestionIndex < 0) return;

      const question = game.questions[game.currentQuestionIndex];
      if (!question) return;

      // Fetch answers from DB for distribution
      try {
        const dbAnswers = await prisma.answer.findMany({
          where: {
            sessionId: game.sessionId,
            questionId: question.id,
          },
          select: { value: true, isCorrect: true },
        });

        const distribution = buildDistribution(
          question.type,
          dbAnswers.map((a) => ({ value: a.value, isCorrect: a.isCorrect })),
          question.options
        );

        const leaderboard = buildLeaderboard(game);

        io.to(room(game.sessionId)).emit("questionResult", {
          correctAnswer: question.options,
          distribution,
          leaderboard: leaderboard.slice(0, 10), // top 10
        });
      } catch (err) {
        console.error("showResults error:", err);
        socket.emit("sessionError", { message: "Failed to load results" });
      }
    });

    // ------------------------------------------------------------------
    // endGame (host only)
    // ------------------------------------------------------------------
    socket.on("endGame", async () => {
      const game = findGameForSocket(socket);
      if (!game) return;

      try {
        await prisma.session.update({
          where: { id: game.sessionId },
          data: { status: "FINISHED", endedAt: new Date() },
        });

        const leaderboard = buildLeaderboard(game);
        const podium = leaderboard.slice(0, 3).map((l, i) => ({
          playerName: l.playerName,
          score: l.score,
          position: i + 1,
          playerAvatar: l.playerAvatar,
        }));
        const fullResults = leaderboard.map((l) => ({
          playerName: l.playerName,
          score: l.score,
          playerAvatar: l.playerAvatar,
        }));

        io.to(room(game.sessionId)).emit("gameOver", { podium, fullResults });

        // Clean up in-memory state
        games.delete(game.sessionId);
      } catch (err) {
        console.error("endGame error:", err);
        socket.emit("sessionError", { message: "Failed to end game" });
      }
    });

    // ------------------------------------------------------------------
    // rejoinSession
    // ------------------------------------------------------------------
    socket.on("rejoinSession", async ({ sessionId, playerName }) => {
      const key = disconnectKey(sessionId, playerName);
      const entry = disconnectedPlayers.get(key);
      const game = games.get(sessionId);

      if (!entry || !game) {
        socket.emit("sessionError", { message: "Session not found or expired" });
        return;
      }

      // Cancel the removal timeout
      clearTimeout(entry.timeout);
      disconnectedPlayers.delete(key);

      // Restore player with updated socket ID
      const player = entry.player;
      player.socketId = socket.id;
      game.players.set(playerName, player);

      currentSessionId = sessionId;
      currentPlayerName = playerName;
      socket.join(room(sessionId));

      // Determine current phase — check if player already answered
      let phase: "waiting" | "question" | "feedback" = "waiting";
      let existingAnswer: Awaited<ReturnType<typeof prisma.answer.findUnique>> = null;

      if (game.currentQuestionIndex >= 0) {
        const q = game.questions[game.currentQuestionIndex];
        if (q) {
          existingAnswer = await prisma.answer.findUnique({
            where: {
              sessionId_questionId_playerName: {
                sessionId: game.sessionId,
                questionId: q.id,
                playerName,
              },
            },
          });
        }
        phase = existingAnswer ? "feedback" : "question";
      }

      socket.emit("rejoinSuccess", {
        totalScore: player.totalScore,
        currentQuestion: game.currentQuestionIndex >= 0 ? game.currentQuestionIndex : undefined,
        totalQuestions: game.questions.length,
        phase,
      });

      // Send the current question OR feedback if the player already answered
      if (game.currentQuestionIndex >= 0) {
        const q = game.questions[game.currentQuestionIndex];
        if (q) {
          if (existingAnswer) {
            // Player already answered — show feedback, not the question
            const leaderboard = buildLeaderboard(game);
            const position =
              leaderboard.findIndex((l) => l.playerName === playerName) + 1;
            const correctCount = [...game.players.values()].filter(
              (p) => p.lastDelta > 0
            ).length;
            const total = realPlayerCount(game);
            const classCorrectPercent =
              total > 0 ? Math.round((correctCount / total) * 100) : 0;

            socket.emit("answerFeedback", {
              isCorrect: existingAnswer.isCorrect,
              score: existingAnswer.score,
              totalScore: player.totalScore,
              position,
              classCorrectPercent,
              confidenceEnabled: q.confidenceEnabled,
            });
          } else {
            // Player hasn't answered yet — send the question
            socket.emit("questionStart", {
              questionIndex: game.currentQuestionIndex,
              totalQuestions: game.questions.length,
              question: {
                text: q.text,
                type: q.type,
                options: sanitizeOptions(q.type, q.options),
                timeLimit: q.timeLimit,
                points: q.points,
                mediaUrl: q.mediaUrl,
              },
            });
          }
        }
      }

      // Notify others
      io.to(room(sessionId)).emit("playerReconnected", {
        playerName,
        playerCount: realPlayerCount(game),
      });
    });

    // ------------------------------------------------------------------
    // toggleMute — host mutes/unmutes sounds for all players
    // ------------------------------------------------------------------
    socket.on("toggleMute", ({ muted }) => {
      if (!currentSessionId || currentPlayerName !== "__host__") return;
      io.to(room(currentSessionId)).emit("muteChanged", { muted });
    });

    // ------------------------------------------------------------------
    // leaveSession — player voluntarily leaves the game
    // ------------------------------------------------------------------
    socket.on("leaveSession", () => {
      if (!currentSessionId || !currentPlayerName) return;
      if (currentPlayerName === "__host__") return;

      const game = games.get(currentSessionId);
      if (!game) return;

      game.players.delete(currentPlayerName);
      socket.leave(room(currentSessionId));

      io.to(room(currentSessionId)).emit("playerLeft", {
        playerName: currentPlayerName,
        playerCount: realPlayerCount(game),
      });

      // Clean up any pending disconnect entry
      const key = disconnectKey(currentSessionId, currentPlayerName);
      const entry = disconnectedPlayers.get(key);
      if (entry) {
        clearTimeout(entry.timeout);
        disconnectedPlayers.delete(key);
      }

      currentSessionId = null;
      currentPlayerName = null;
    });

    // ------------------------------------------------------------------
    // disconnect — grace period before removal
    // ------------------------------------------------------------------
    socket.on("disconnect", () => {
      if (!currentSessionId || !currentPlayerName) return;

      const game = games.get(currentSessionId);
      if (!game) return;

      // Host disconnection: don't remove (host can refresh)
      if (currentPlayerName === "__host__") return;

      const player = game.players.get(currentPlayerName);
      if (!player) return;

      // Move player to disconnected list instead of removing immediately
      const key = disconnectKey(currentSessionId, currentPlayerName);
      const sessionId = currentSessionId;
      const playerName = currentPlayerName;

      const timeout = setTimeout(() => {
        // Grace period expired — remove for real
        disconnectedPlayers.delete(key);
        const g = games.get(sessionId);
        if (!g) return;

        g.players.delete(playerName);
        io.to(room(sessionId)).emit("playerLeft", {
          playerName,
          playerCount: realPlayerCount(g),
        });

        if (g.players.size === 0) {
          games.delete(sessionId);
        }
      }, RECONNECT_GRACE_PERIOD_MS);

      disconnectedPlayers.set(key, { player, sessionId, timeout });

      // Don't remove from game.players yet — keep score intact
      // but clear the socketId so we know they're disconnected
      player.socketId = "";
    });
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Find the game state for a socket based on its tracked session */
function findGameForSocket(socket: TypedSocket): GameState | null {
  // Look through all rooms this socket is in
  for (const [sessionId, game] of games) {
    if (socket.rooms.has(room(sessionId))) {
      return game;
    }
  }
  socket.emit("sessionError", { message: "Not in a session" });
  return null;
}

/** Emit a question to all players in the room */
function emitQuestion(io: TypedIO, game: GameState, index: number) {
  game.currentQuestionIndex = index;
  game.answerCount = 0;
  game.confidenceCount = 0;
  game.questionStartTime = Date.now();

  // Reset per-round deltas
  for (const player of game.players.values()) {
    player.lastDelta = 0;
  }

  const question = game.questions[index];

  io.to(room(game.sessionId)).emit("questionStart", {
    questionIndex: index,
    totalQuestions: game.questions.length,
    question: {
      text: question.text,
      type: question.type,
      options: sanitizeOptions(question.type, question.options),
      timeLimit: question.timeLimit,
      points: question.points,
      mediaUrl: question.mediaUrl,
      confidenceEnabled: question.confidenceEnabled,
    },
  });
}
