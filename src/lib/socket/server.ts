import { randomBytes } from "node:crypto";
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
import { verifyHostToken } from "@/lib/socket/host-token";

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

/** Secret handed to a player on join; needed to rejoin or reclaim the name */
function newPlayerToken() {
  return randomBytes(16).toString("hex");
}

/**
 * Avatar accepted from a client: an emoji (short text) or one of the
 * custom images in /emoticons/. Anything else is dropped.
 */
function sanitizeAvatar(avatar: unknown): string | undefined {
  if (typeof avatar !== "string") return undefined;
  if (avatar.startsWith("/emoticons/")) {
    return /^\/emoticons\/[\w\-. ]{1,100}$/.test(avatar) && !avatar.includes("..")
      ? avatar
      : undefined;
  }
  return avatar.length > 0 && avatar.length <= 32 && !/[<>/\\]/.test(avatar) ? avatar : undefined;
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
  isTest: boolean;
  kickedNames: Set<string>;
  /** playerName → secret token, kept even after the player leaves */
  playerTokens: Map<string, string>;
  phase: "lobby" | "in-question" | "between-questions" | "ended";
  /**
   * Who already answered / chose a confidence for the current question.
   * Checked and filled with no await in between: the database check alone
   * lets two messages sent together both through.
   */
  answeredBy: Set<string>;
  confidenceBy: Set<string>;
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
      // The line to complete is the answer: it never leaves the server
      const codeLines = cc.codeLines.map((l, i) => (i === cc.blankLineIndex ? "" : l));
      if (cc.mode === "choice" && cc.choices) {
        const shuffled = [...cc.choices].sort(() => Math.random() - 0.5);
        return {
          codeLines,
          blankLineIndex: cc.blankLineIndex,
          correctAnswer: "",
          mode: cc.mode,
          choices: shuffled,
        } as any;
      }
      return {
        codeLines,
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
    /** True only after joining as __host__ with a valid host token */
    let isHost = false;

    /** Game for a host-only command, or null (with an error) if not the host */
    const hostGame = (): GameState | null => {
      const game = isHost && currentSessionId ? games.get(currentSessionId) : undefined;
      if (!game) {
        socket.emit("sessionError", { message: "Not in a session" });
        return null;
      }
      return game;
    };

    // ------------------------------------------------------------------
    // joinSession
    // ------------------------------------------------------------------
    socket.on("joinSession", async ({ pin, playerName: rawName, playerEmail, playerAvatar: rawAvatar, playerToken, hostToken }) => {
      try {
        const asHost = rawName === "__host__";
        const playerName = asHost ? rawName : String(rawName ?? "").trim();
        const playerAvatar = sanitizeAvatar(rawAvatar);
        if (!asHost && (playerName.length < 2 || playerName.length > 24)) {
          socket.emit("sessionError", { message: "invalidName" });
          return;
        }

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

        // Only the teacher's page holds a valid host token
        if (asHost && !verifyHostToken(sessionId, hostToken)) {
          socket.emit("sessionError", { message: "hostAuthFailed" });
          return;
        }

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
            isTest: session.isTest,
            kickedNames: new Set<string>(),
            playerTokens: new Map(),
            phase: "lobby",
            answeredBy: new Set(),
            confidenceBy: new Set(),
          });
        }

        const game = games.get(sessionId)!;

        if (playerName !== "__host__" && game.kickedNames.has(playerName)) {
          socket.emit("sessionError", { message: "nicknameKicked" });
          return;
        }

        // A name already used in this game belongs to whoever holds its
        // token. Without it the name can be reclaimed only in the lobby and
        // only if its socket is gone (nothing to steal there yet).
        const existingPlayer = game.players.get(playerName);
        let token: string | undefined;
        if (!asHost) {
          const knownToken = game.playerTokens.get(playerName);
          const sameOwner = !!knownToken && playerToken === knownToken;
          if (knownToken && !sameOwner) {
            const existingSocket = existingPlayer?.socketId
              ? io.sockets.sockets.get(existingPlayer.socketId)
              : undefined;
            const connectedElsewhere =
              !!existingSocket?.connected && existingSocket.id !== socket.id;
            if (connectedElsewhere || game.phase !== "lobby") {
              socket.emit("sessionError", { message: "Name already taken" });
              return;
            }
          }
          token = sameOwner ? knownToken : newPlayerToken();
          game.playerTokens.set(playerName, token);
        }

        currentSessionId = sessionId;
        currentPlayerName = playerName;
        isHost = asHost;

        // Cancel any pending disconnect timeout for this player
        const disconnKey = disconnectKey(sessionId, playerName);
        const disconnEntry = disconnectedPlayers.get(disconnKey);
        if (disconnEntry) {
          clearTimeout(disconnEntry.timeout);
          disconnectedPlayers.delete(disconnKey);
        }

        // Recover score: from in-memory state, or from DB if player was removed
        let recoveredScore = existingPlayer?.totalScore ?? 0;
        if (!existingPlayer && playerName !== "__host__") {
          const dbAnswers = await prisma.answer.findMany({
            where: { sessionId: game.sessionId, playerName },
            select: { score: true },
          });
          recoveredScore = dbAnswers.reduce((sum, a) => sum + a.score, 0);
        }

        // Add / update player
        game.players.set(playerName, {
          socketId: socket.id,
          name: playerName,
          email: playerEmail,
          avatar: playerAvatar,
          totalScore: recoveredScore,
          lastDelta: existingPlayer?.lastDelta ?? 0,
        });

        socket.join(room(sessionId));

        // Notify everyone in the room
        const isReturning = !!existingPlayer || recoveredScore > 0;
        io.to(room(sessionId)).emit(isReturning ? "playerReconnected" : "playerJoined", {
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
                confidenceEnabled: q.confidenceEnabled,
              },
              remainingSeconds: remainingSeconds(game),
            });
          }
        }

        // Send current game state to the newly joined player
        socket.emit("gameState", {
          sessionId,
          ...(token ? { playerToken: token } : {}),
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
          game.currentQuestionIndex >= 0 &&
          game.phase === "in-question"
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
                confidenceEnabled: q.confidenceEnabled,
              },
              remainingSeconds: remainingSeconds(game),
            });
            if (game.answeredBy.has(playerName)) {
              socket.emit("answerReceived", {
                confidenceEnabled: q.confidenceEnabled && !game.confidenceBy.has(playerName),
              });
            }
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
      const game = hostGame();
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
      const game = hostGame();
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
    socket.on("submitAnswer", async ({ value }) => {
      if (!currentSessionId || !currentPlayerName) return;

      const game = games.get(currentSessionId);
      if (!game || game.currentQuestionIndex < 0) return;

      // No answers once the host has revealed the results: the correct
      // answer is on the projector by then.
      if (game.phase !== "in-question") return;

      const question = game.questions[game.currentQuestionIndex];
      if (!question) return;

      // Compute response time server-side (not from client — prevents spoofing)
      const responseTimeMs = game.questionStartTime
        ? Math.max(0, Date.now() - game.questionStartTime)
        : 0;

      // Reject answers submitted after the time limit (with 2s grace for network lag)
      const deadlineMs = (question.timeLimit + 2) * 1000;
      if (responseTimeMs > deadlineMs) return;

      // A malformed answer (hand-crafted from the console) is ignored
      let isCorrect: boolean;
      let score: number;
      try {
        isCorrect = checkAnswer(question.type, question.options, value);

        // Calculate score: use partial scoring for types that support it
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
      } catch {
        return;
      }
      if (!Number.isFinite(score)) return;
      // Never more than the question is worth
      score = Math.max(0, Math.min(score, question.points));

      // One answer per player per question. The mark is set before any
      // await, so a second message sent together with the first stops here.
      if (game.answeredBy.has(currentPlayerName)) return;
      game.answeredBy.add(currentPlayerName);

      // Already in the database (e.g. answered before a server restart)
      const existingAnswer = await prisma.answer.findUnique({
        where: {
          sessionId_questionId_playerName: {
            sessionId: game.sessionId,
            questionId: question.id,
            playerName: currentPlayerName,
          },
        },
        select: { id: true },
      });
      if (existingAnswer) return;


      // Update in-memory state
      const player = game.players.get(currentPlayerName);
      if (player) {
        player.totalScore += score;
        player.lastDelta = score;
      }

      game.answerCount += 1;

      // Persist answer to DB (create only — duplicates rejected above)
      try {
        await prisma.answer.create({
          data: {
            sessionId: game.sessionId,
            questionId: question.id,
            playerName: currentPlayerName,
            playerEmail: player?.email ?? null,
            value: value as any,
            isCorrect,
            responseTimeMs,
            score,
          },
        });
      } catch (err) {
        console.error("submitAnswer DB error:", err);
      }

      // Only confirm receipt: the outcome (right/wrong, points) reaches the
      // player when the host reveals the answer (runShowResults), so nobody
      // can tell classmates whether their answer was right mid-question.
      socket.emit("answerReceived", {
        confidenceEnabled: question.confidenceEnabled,
      });

      // Broadcast answer count to room
      io.to(room(game.sessionId)).emit("answerCount", {
        count: game.answerCount,
        total: realPlayerCount(game),
      });

      // Test mode reveals right away — after the confidence answer, if asked
      if (game.isTest && !question.confidenceEnabled) {
        await runShowResults(io, game);
      }
    });

    // ------------------------------------------------------------------
    // submitConfidence
    // ------------------------------------------------------------------
    socket.on("submitConfidence", async ({ confidenceLevel }) => {
      if (!currentSessionId || !currentPlayerName) return;

      // Validate confidence level (must be 1, 2, or 3)
      if (![1, 2, 3].includes(confidenceLevel)) return;

      const game = games.get(currentSessionId);
      if (!game || game.currentQuestionIndex < 0) return;

      // Confidence only counts while the question is open: once the answer
      // is revealed the player would be betting on a known outcome.
      if (game.phase !== "in-question") return;

      const question = game.questions[game.currentQuestionIndex];
      if (!question || !question.confidenceEnabled) return;

      const player = game.players.get(currentPlayerName);
      if (!player) return;

      // Once per question; marked before any await (see submitAnswer)
      if (game.confidenceBy.has(currentPlayerName)) return;
      game.confidenceBy.add(currentPlayerName);

      const answerKey = {
        sessionId_questionId_playerName: {
          sessionId: game.sessionId,
          questionId: question.id,
          playerName: currentPlayerName,
        },
      };
      // The stored answer is the source of truth for points and outcome:
      // the in-memory delta is lost when the player reconnects.
      const existing = await prisma.answer.findUnique({
        where: answerKey,
        select: { score: true, isCorrect: true, confidenceLevel: true },
      });
      if (!existing) {
        // No answer yet: nothing to bet on, the player may retry later
        game.confidenceBy.delete(currentPlayerName);
        return;
      }
      if (existing.confidenceLevel != null) return;

      const oldDelta = existing.score;
      // A wrong "very sure" answer takes points away from the total, but
      // never below zero: the loss stops at what the player had before.
      const totalBefore = player.totalScore - oldDelta;
      const newDelta = Math.max(
        applyConfidence(oldDelta, existing.isCorrect, confidenceLevel),
        0 - Math.max(0, totalBefore),
      );

      player.totalScore += newDelta - oldDelta;
      player.lastDelta = newDelta;

      try {
        await prisma.answer.update({
          where: answerKey,
          data: {
            confidenceLevel,
            score: newDelta,
          },
        });
      } catch (err) {
        console.error("submitConfidence DB error:", err);
      }

      socket.emit("answerReceived", { confidenceEnabled: false });

      // Broadcast confidence count to host
      game.confidenceCount += 1;
      const total = realPlayerCount(game);
      io.to(room(game.sessionId)).emit("confidenceCount", {
        count: game.confidenceCount,
        total,
      });

      if (game.isTest) {
        await runShowResults(io, game);
      }
    });

    // ------------------------------------------------------------------
    // showResults (host only)
    // ------------------------------------------------------------------
    socket.on("showResults", async () => {
      const game = hostGame();
      if (!game) return;
      await runShowResults(io, game);
    });

    // ------------------------------------------------------------------
    // endGame (host only)
    // ------------------------------------------------------------------
    socket.on("endGame", async () => {
      const game = hostGame();
      if (!game) return;

      try {
        await prisma.session.update({
          where: { id: game.sessionId },
          data: { status: "FINISHED", endedAt: new Date() },
        });

        const leaderboard = await buildFinalLeaderboard(game);
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

        game.phase = "ended";

        // Clean up in-memory state
        games.delete(game.sessionId);
      } catch (err) {
        console.error("endGame error:", err);
        socket.emit("sessionError", { message: "Failed to end game" });
      }
    });

    // ------------------------------------------------------------------
    // cancelGame (host only) — stop now and delete the game: the session
    // and its answers disappear from the statistics
    // ------------------------------------------------------------------
    socket.on("cancelGame", async () => {
      const game = hostGame();
      if (!game) return;
      const sessionId = game.sessionId;

      try {
        await prisma.answer.deleteMany({ where: { sessionId } });
        await prisma.session.delete({ where: { id: sessionId } });
      } catch (err) {
        console.error("cancelGame error:", err);
        socket.emit("sessionError", { message: "Failed to cancel game" });
        return;
      }

      game.phase = "ended";
      io.to(room(sessionId)).emit("gameCancelled");

      for (const [key, entry] of disconnectedPlayers) {
        if (entry.sessionId === sessionId) {
          clearTimeout(entry.timeout);
          disconnectedPlayers.delete(key);
        }
      }
      games.delete(sessionId);
    });

    // ------------------------------------------------------------------
    // rejoinSession
    // ------------------------------------------------------------------
    socket.on("rejoinSession", async ({ sessionId, playerName, playerToken }) => {
      const key = disconnectKey(sessionId, playerName);
      const entry = disconnectedPlayers.get(key);
      const game = games.get(sessionId);

      // Only whoever received this player's token on join can rejoin as them
      const knownToken = game?.playerTokens.get(playerName);
      if (!game || !knownToken || playerToken !== knownToken) {
        socket.emit("sessionError", { message: "Session not found or expired" });
        return;
      }

      let player: PlayerInfo;

      if (entry) {
        // Player is still within grace period — restore from disconnected map
        clearTimeout(entry.timeout);
        disconnectedPlayers.delete(key);
        player = entry.player;
      } else if (game.players.has(playerName)) {
        // Player is still in the game (e.g. quick reconnect without disconnect firing)
        player = game.players.get(playerName)!;
      } else {
        // Grace period expired — rebuild player from DB
        const dbAnswers = await prisma.answer.findMany({
          where: { sessionId: game.sessionId, playerName },
          select: { score: true },
        });
        if (dbAnswers.length === 0) {
          // Player was never in this session
          socket.emit("sessionError", { message: "Session not found or expired" });
          return;
        }
        const totalScore = dbAnswers.reduce((sum, a) => sum + a.score, 0);
        player = {
          socketId: "",
          name: playerName,
          totalScore,
          lastDelta: 0,
        };
      }

      // Restore player with updated socket ID
      player.socketId = socket.id;
      game.players.set(playerName, player);

      currentSessionId = sessionId;
      currentPlayerName = playerName;
      isHost = false;
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
        playerAvatar: player.avatar,
      });

      // Send the current question OR feedback if the player already answered
      if (game.currentQuestionIndex >= 0) {
        const q = game.questions[game.currentQuestionIndex];
        if (q) {
          if (existingAnswer && game.phase !== "in-question") {
            // Answer already revealed — show the player's outcome
            const answers = await prisma.answer.findMany({
              where: { sessionId: game.sessionId, questionId: q.id },
              select: { isCorrect: true },
            });
            socket.emit("answerFeedback", {
              isCorrect: existingAnswer.isCorrect,
              score: existingAnswer.score,
              totalScore: player.totalScore,
              classCorrectPercent: classCorrectPercent(answers, realPlayerCount(game)),
              confidenceEnabled: false,
            });
          } else if (game.phase === "in-question") {
            // Question still open: send it with the time really left; if
            // already answered, back to "answer sent, wait". A question
            // already closed is not reopened: the player waits for the next.
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
                confidenceEnabled: q.confidenceEnabled,
              },
              remainingSeconds: remainingSeconds(game),
            });
            if (existingAnswer) {
              socket.emit("answerReceived", {
                confidenceEnabled:
                  q.confidenceEnabled && existingAnswer.confidenceLevel == null,
              });
            }
          }
        }
      }

      // Notify others
      io.to(room(sessionId)).emit("playerReconnected", {
        playerName,
        playerCount: realPlayerCount(game),
        playerAvatar: player.avatar,
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
    // kickPlayer (host only) — remove a player in lobby or between questions
    // ------------------------------------------------------------------
    socket.on("kickPlayer", ({ playerName }) => {
      if (!currentSessionId || currentPlayerName !== "__host__") return;
      if (playerName === "__host__") return;

      const game = games.get(currentSessionId);
      if (!game) return;

      if (game.phase === "in-question") {
        socket.emit("sessionError", { message: "kickDuringQuestion" });
        return;
      }

      const target = game.players.get(playerName);
      if (!target) return;

      game.kickedNames.add(playerName);
      game.players.delete(playerName);
      // The token dies with the kick: no way back through rejoinSession
      game.playerTokens.delete(playerName);

      const dKey = disconnectKey(currentSessionId, playerName);
      const dEntry = disconnectedPlayers.get(dKey);
      if (dEntry) {
        clearTimeout(dEntry.timeout);
        disconnectedPlayers.delete(dKey);
      }

      if (target.socketId) {
        const targetSocket = io.sockets.sockets.get(target.socketId);
        targetSocket?.emit("kicked", { reason: "host" });
        targetSocket?.leave(room(currentSessionId));
      }

      io.to(room(currentSessionId)).emit("playerLeft", {
        playerName,
        playerCount: realPlayerCount(game),
      });
    });

    // ------------------------------------------------------------------
    // renamePlayer — player changes nickname while in lobby
    // ------------------------------------------------------------------
    socket.on("renamePlayer", ({ newName }) => {
      if (!currentSessionId || !currentPlayerName) return;
      if (currentPlayerName === "__host__") return;

      const game = games.get(currentSessionId);
      if (!game) return;

      if (game.phase !== "lobby") {
        socket.emit("sessionError", { message: "renameAfterStart" });
        return;
      }

      const trimmed = newName.trim();
      if (trimmed.length < 2 || trimmed.length > 24) {
        socket.emit("sessionError", { message: "invalidName" });
        return;
      }

      if (trimmed === currentPlayerName) return;

      if (trimmed === "__host__" || game.kickedNames.has(trimmed)) {
        socket.emit("sessionError", { message: "nicknameKicked" });
        return;
      }

      // Any name already used in this game is taken, even if its owner
      // is momentarily disconnected
      if (game.players.has(trimmed) || game.playerTokens.has(trimmed)) {
        socket.emit("sessionError", { message: "nameAlreadyTaken" });
        return;
      }

      const player = game.players.get(currentPlayerName);
      if (!player) return;

      const oldName = currentPlayerName;
      game.players.delete(oldName);
      player.name = trimmed;
      game.players.set(trimmed, player);
      const ownToken = game.playerTokens.get(oldName);
      game.playerTokens.delete(oldName);
      if (ownToken) game.playerTokens.set(trimmed, ownToken);

      const dKey = disconnectKey(currentSessionId, oldName);
      const dEntry = disconnectedPlayers.get(dKey);
      if (dEntry) {
        clearTimeout(dEntry.timeout);
        disconnectedPlayers.delete(dKey);
      }

      currentPlayerName = trimmed;

      socket.emit("renameSuccess", { newName: trimmed });
      io.to(room(currentSessionId)).emit("playerRenamed", {
        oldName,
        newName: trimmed,
        playerAvatar: player.avatar,
      });
    });

    // ------------------------------------------------------------------
    // changeAvatar — player picks a new picture (any time, it's harmless)
    // ------------------------------------------------------------------
    socket.on("changeAvatar", ({ avatar }) => {
      if (!currentSessionId || !currentPlayerName || isHost) return;
      const game = games.get(currentSessionId);
      const player = game?.players.get(currentPlayerName);
      const clean = sanitizeAvatar(avatar);
      if (!game || !player || !clean || clean === player.avatar) return;

      player.avatar = clean;
      io.to(room(currentSessionId)).emit("playerRenamed", {
        oldName: currentPlayerName,
        newName: currentPlayerName,
        playerAvatar: clean,
      });
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

      // The player already came back on a newer socket (the server notices
      // a dead connection well after the phone has reconnected): this late
      // close must not detach them.
      if (player.socketId !== socket.id) return;

      // Mark player as disconnected (clear socketId so name check works)
      player.socketId = "";

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

/** Percentage of the class (real players) that answered correctly */
function classCorrectPercent(answers: { isCorrect: boolean }[], total: number) {
  if (total <= 0) return 0;
  return Math.round((answers.filter((a) => a.isCorrect).length / total) * 100);
}

/** Whole seconds left to answer the current question (0 once closed) */
function remainingSeconds(game: GameState) {
  const q = game.questions[game.currentQuestionIndex];
  if (!q || game.phase !== "in-question" || !game.questionStartTime) return 0;
  const left = q.timeLimit - (Date.now() - game.questionStartTime) / 1000;
  return Math.max(0, Math.min(q.timeLimit, Math.ceil(left)));
}

/**
 * Final standings: who is in the game, plus who answered and then stayed
 * away past the reconnection grace period (their points are in the database).
 */
async function buildFinalLeaderboard(game: GameState) {
  const leaderboard = buildLeaderboard(game);
  try {
    const dbAnswers = await prisma.answer.findMany({
      where: { sessionId: game.sessionId },
      select: { playerName: true, score: true },
    });
    const absent = new Map<string, number>();
    for (const a of dbAnswers) {
      if (game.players.has(a.playerName) || game.kickedNames.has(a.playerName)) continue;
      absent.set(a.playerName, (absent.get(a.playerName) ?? 0) + a.score);
    }
    for (const [playerName, score] of absent) {
      leaderboard.push({ playerName, score, delta: 0, playerAvatar: undefined });
    }
    leaderboard.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error("buildFinalLeaderboard error:", err);
  }
  return leaderboard;
}

/** Run the showResults logic (extracted so test-mode auto-advance can reuse it) */
async function runShowResults(io: TypedIO, game: GameState) {
  if (game.currentQuestionIndex < 0) return;
  const question = game.questions[game.currentQuestionIndex];
  if (!question) return;

  // Closed before anything is sent or awaited: the reveal carries the
  // correct answer, nobody may answer once it is on its way.
  game.phase = "between-questions";

  try {
    const dbAnswers = await prisma.answer.findMany({
      where: { sessionId: game.sessionId, questionId: question.id },
      select: { value: true, isCorrect: true, playerName: true, score: true },
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
      leaderboard: leaderboard.slice(0, 10),
    });

    const allSessionAnswers = await prisma.answer.findMany({
      where: { sessionId: game.sessionId },
      select: { playerName: true, questionId: true, isCorrect: true, responseTimeMs: true },
      orderBy: { createdAt: "asc" },
    });

    const totalPlayers = realPlayerCount(game);

    const classPercent = classCorrectPercent(dbAnswers, totalPlayers);
    // Last question: no overall position, the final standings are the
    // podium's surprise
    const isLastQuestion = game.currentQuestionIndex === game.questions.length - 1;

    for (const [playerName, player] of game.players) {
      if (playerName === "__host__") continue;
      const playerSocket = io.sockets.sockets.get(player.socketId);
      // The outcome is revealed only now, when the host shows the answer
      const revealed = dbAnswers.find((a) => a.playerName === playerName);
      if (playerSocket && revealed) {
        playerSocket.emit("answerFeedback", {
          isCorrect: revealed.isCorrect,
          score: revealed.score,
          totalScore: player.totalScore,
          classCorrectPercent: classPercent,
          confidenceEnabled: false,
        });
      }
      const playerAnswers = allSessionAnswers.filter((a) => a.playerName === playerName);
      const currentAnswer = playerAnswers.find((a) => a.questionId === question.id);
      const position = leaderboard.findIndex((l) => l.playerName === playerName) + 1;
      const correctCount = playerAnswers.filter((a) => a.isCorrect).length;
      const totalAnswered = playerAnswers.length;
      let streak = 0;
      for (let i = playerAnswers.length - 1; i >= 0; i--) {
        if (playerAnswers[i].isCorrect) streak++;
        else break;
      }
      if (playerSocket) {
        playerSocket.emit("playerStats", {
          position: isLastQuestion ? 0 : position,
          totalPlayers,
          responseTimeMs: currentAnswer?.responseTimeMs ?? 0,
          correctCount,
          totalAnswered,
          streak,
        });
      }
    }
  } catch (err) {
    console.error("runShowResults error:", err);
  }
}

/** Emit a question to all players in the room */
function emitQuestion(io: TypedIO, game: GameState, index: number) {
  game.currentQuestionIndex = index;
  game.answerCount = 0;
  game.confidenceCount = 0;
  game.questionStartTime = Date.now();
  game.phase = "in-question";
  game.answeredBy.clear();
  game.confidenceBy.clear();

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
