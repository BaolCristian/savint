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
      return {
        choices: mc.choices.map((c) => ({ text: c.text, isCorrect: false })),
      } as MultipleChoiceOptions;
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
  answers: { value: any; isCorrect: boolean }[]
): Record<string, number> {
  const dist: Record<string, number> = {};

  switch (type) {
    case "MULTIPLE_CHOICE":
      for (const a of answers) {
        const key = JSON.stringify((a.value as any).selected ?? []);
        dist[key] = (dist[key] || 0) + 1;
      }
      break;
    case "TRUE_FALSE":
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

        // Send current game state to the newly joined player
        socket.emit("gameState", {
          status: session.status,
          currentQuestion:
            game.currentQuestionIndex >= 0
              ? game.currentQuestionIndex
              : undefined,
        });
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

      const isCorrect = checkAnswer(question.type, question.options, value);

      // Calculate score: use partial scoring for types that support it
      let score: number;
      const partialTypes = ["SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT"];
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
          dbAnswers.map((a) => ({ value: a.value, isCorrect: a.isCorrect }))
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
    // disconnect
    // ------------------------------------------------------------------
    socket.on("disconnect", () => {
      if (!currentSessionId || !currentPlayerName) return;

      const game = games.get(currentSessionId);
      if (!game) return;

      game.players.delete(currentPlayerName);

      io.to(room(currentSessionId)).emit("playerLeft", {
        playerName: currentPlayerName,
        playerCount: realPlayerCount(game),
      });

      // If no players left, clean up
      if (game.players.size === 0) {
        games.delete(currentSessionId);
      }
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
    },
  });
}
