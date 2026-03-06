"use client";

import { useEffect, useState, useCallback } from "react";
import { useSocket } from "@/lib/socket/client";
import Link from "next/link";
import type { QuestionOptions, MultipleChoiceOptions } from "@/types";
import type { QuestionType } from "@prisma/client";

type Phase = "lobby" | "question" | "result" | "podium";

interface Props {
  session: {
    id: string;
    pin: string;
    quiz: { title: string; questions: any[] };
  };
}

interface QuestionData {
  questionIndex: number;
  totalQuestions: number;
  question: {
    text: string;
    type: QuestionType;
    options: QuestionOptions;
    timeLimit: number;
    points: number;
    mediaUrl: string | null;
  };
}

interface ResultData {
  correctAnswer: QuestionOptions;
  distribution: Record<string, number>;
  leaderboard: { playerName: string; score: number; delta: number }[];
}

interface GameOverData {
  podium: { playerName: string; score: number; position: number }[];
  fullResults: { playerName: string; score: number }[];
}

const ANSWER_COLORS = [
  "bg-red-500",
  "bg-blue-500",
  "bg-yellow-500",
  "bg-green-500",
];

const ANSWER_SHAPES = ["triangle", "diamond", "circle", "square"];

export function HostView({ session }: Props) {
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answerCount, setAnswerCount] = useState({ count: 0, total: 0 });
  const [resultData, setResultData] = useState<ResultData | null>(null);
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null);
  const [resultsRevealed, setResultsRevealed] = useState(false);

  // Join session as host on mount
  useEffect(() => {
    if (!socket || !connected) return;

    socket.emit("joinSession", {
      pin: session.pin,
      playerName: "__host__",
    });
  }, [socket, connected, session.pin]);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    const handlePlayerJoined = (data: { playerName: string; playerCount: number }) => {
      setPlayers((prev) =>
        prev.includes(data.playerName) ? prev : [...prev, data.playerName]
      );
      setPlayerCount(data.playerCount);
    };

    const handlePlayerLeft = (data: { playerName: string; playerCount: number }) => {
      setPlayers((prev) => prev.filter((p) => p !== data.playerName));
      setPlayerCount(data.playerCount);
    };

    const handleQuestionStart = (data: QuestionData) => {
      setCurrentQuestion(data);
      setTimeLeft(data.question.timeLimit);
      setAnswerCount({ count: 0, total: 0 });
      setResultData(null);
      setResultsRevealed(false);
      setPhase("question");
    };

    const handleAnswerCount = (data: { count: number; total: number }) => {
      setAnswerCount(data);
    };

    const handleQuestionResult = (data: ResultData) => {
      setResultData(data);
      setResultsRevealed(true);
    };

    const handleGameOver = (data: GameOverData) => {
      setGameOverData(data);
      setPhase("podium");
    };

    socket.on("playerJoined", handlePlayerJoined);
    socket.on("playerLeft", handlePlayerLeft);
    socket.on("questionStart", handleQuestionStart);
    socket.on("answerCount", handleAnswerCount);
    socket.on("questionResult", handleQuestionResult);
    socket.on("gameOver", handleGameOver);

    return () => {
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("playerLeft", handlePlayerLeft);
      socket.off("questionStart", handleQuestionStart);
      socket.off("answerCount", handleAnswerCount);
      socket.off("questionResult", handleQuestionResult);
      socket.off("gameOver", handleGameOver);
    };
  }, [socket]);

  // Timer countdown
  useEffect(() => {
    if (phase !== "question" || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(interval);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, timeLeft]);

  const handleStartGame = useCallback(() => {
    socket?.emit("startGame");
  }, [socket]);

  const handleShowResults = useCallback(() => {
    socket?.emit("showResults");
    setPhase("result");
  }, [socket]);

  const handleNextQuestion = useCallback(() => {
    socket?.emit("nextQuestion");
  }, [socket]);

  const handleEndGame = useCallback(() => {
    socket?.emit("endGame");
  }, [socket]);

  // --- LOBBY PHASE ---
  if (phase === "lobby") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 text-white flex flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-2">{session.quiz.title}</h1>
        <p className="text-lg mb-8 opacity-80">Condividi il PIN per partecipare</p>

        <div className="bg-white/10 backdrop-blur rounded-2xl p-8 mb-8 text-center">
          <p className="text-sm uppercase tracking-widest mb-2 opacity-70">PIN di gioco</p>
          <p className="text-7xl font-black tracking-wider">{session.pin}</p>
        </div>

        <div className="bg-white/10 backdrop-blur rounded-xl p-6 mb-8 w-full max-w-md">
          <h2 className="text-lg font-semibold mb-3">
            Giocatori connessi ({playerCount})
          </h2>
          {players.length === 0 ? (
            <p className="text-sm opacity-60">In attesa di giocatori...</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {players.map((name) => (
                <span
                  key={name}
                  className="bg-white/20 px-3 py-1 rounded-full text-sm font-medium"
                >
                  {name}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleStartGame}
          disabled={playerCount === 0}
          className="bg-green-500 hover:bg-green-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-10 py-4 rounded-xl text-xl transition-colors"
        >
          Avvia Quiz
        </button>

        {!connected && (
          <p className="mt-4 text-sm text-red-300">Connessione al server in corso...</p>
        )}
      </div>
    );
  }

  // --- QUESTION PHASE ---
  if (phase === "question") {
    const q = currentQuestion;
    if (!q) return null;

    const progressPercent =
      answerCount.total > 0
        ? Math.round((answerCount.count / answerCount.total) * 100)
        : 0;

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-700 to-purple-900 text-white flex flex-col p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-lg font-semibold opacity-80">
            Domanda {q.questionIndex + 1} / {q.totalQuestions}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm opacity-70">
              {answerCount.count}/{answerCount.total} risposte
            </span>
            <div className="bg-white/20 rounded-full w-10 h-10 flex items-center justify-center text-xl font-bold">
              {timeLeft}
            </div>
          </div>
        </div>

        {/* Question text */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <h2 className="text-4xl font-bold text-center mb-6 max-w-4xl">
            {q.question.text}
          </h2>

          {/* Optional image */}
          {q.question.mediaUrl && (
            <img
              src={q.question.mediaUrl}
              alt="Immagine della domanda"
              className="max-h-64 rounded-xl mb-6 object-contain"
            />
          )}
        </div>

        {/* Answer blocks for MULTIPLE_CHOICE */}
        {q.question.type === "MULTIPLE_CHOICE" && (
          <div className="grid grid-cols-2 gap-4 mt-auto">
            {(q.question.options as MultipleChoiceOptions).choices.map(
              (choice, i) => (
                <div
                  key={i}
                  className={`${ANSWER_COLORS[i % ANSWER_COLORS.length]} rounded-xl p-6 flex items-center gap-3`}
                >
                  <span className="text-2xl font-bold opacity-60">
                    {ANSWER_SHAPES[i % ANSWER_SHAPES.length] === "triangle"
                      ? "\u25B2"
                      : ANSWER_SHAPES[i % ANSWER_SHAPES.length] === "diamond"
                        ? "\u25C6"
                        : ANSWER_SHAPES[i % ANSWER_SHAPES.length] === "circle"
                          ? "\u25CF"
                          : "\u25A0"}
                  </span>
                  <span className="text-xl font-semibold">{choice.text}</span>
                </div>
              )
            )}
          </div>
        )}

        {/* Progress bar */}
        <div className="mt-6 bg-white/20 rounded-full h-3 overflow-hidden">
          <div
            className="bg-green-400 h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  // --- RESULT PHASE ---
  if (phase === "result") {
    const q = currentQuestion;
    const isLastQuestion =
      q && q.questionIndex + 1 >= q.totalQuestions;

    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-700 to-indigo-900 text-white flex flex-col items-center p-8">
        <h2 className="text-3xl font-bold mb-8">
          Risultati - Domanda {q ? q.questionIndex + 1 : ""}
        </h2>

        {!resultsRevealed ? (
          <button
            onClick={handleShowResults}
            className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold px-8 py-4 rounded-xl text-xl transition-colors"
          >
            Mostra risultati
          </button>
        ) : (
          <div className="w-full max-w-4xl">
            {/* Distribution */}
            {resultData && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">Distribuzione risposte</h3>
                <div className="flex items-end gap-4 h-40">
                  {Object.entries(resultData.distribution).map(([key, value], i) => {
                    const maxVal = Math.max(
                      ...Object.values(resultData.distribution),
                      1
                    );
                    const heightPercent = (value / maxVal) * 100;
                    return (
                      <div
                        key={key}
                        className="flex-1 flex flex-col items-center gap-2"
                      >
                        <span className="text-sm font-bold">{value}</span>
                        <div
                          className={`${ANSWER_COLORS[i % ANSWER_COLORS.length]} w-full rounded-t-lg transition-all duration-700`}
                          style={{ height: `${heightPercent}%`, minHeight: 4 }}
                        />
                        <span className="text-xs opacity-70 truncate max-w-full">
                          {key}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Top 5 Leaderboard */}
            {resultData && resultData.leaderboard.length > 0 && (
              <div className="bg-white/10 backdrop-blur rounded-xl p-6 mb-8">
                <h3 className="text-lg font-semibold mb-4">Top 5 Classifica</h3>
                <div className="space-y-3">
                  {resultData.leaderboard.slice(0, 5).map((entry, i) => (
                    <div
                      key={entry.playerName}
                      className="flex items-center justify-between bg-white/10 rounded-lg px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl font-bold opacity-60 w-8">
                          {i + 1}.
                        </span>
                        <span className="font-semibold">{entry.playerName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 text-sm font-medium">
                          +{entry.delta}
                        </span>
                        <span className="font-bold">{entry.score}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next / Podium button */}
            <div className="flex justify-center">
              {isLastQuestion ? (
                <button
                  onClick={handleEndGame}
                  className="bg-amber-500 hover:bg-amber-600 text-black font-bold px-8 py-4 rounded-xl text-xl transition-colors"
                >
                  Mostra podio
                </button>
              ) : (
                <button
                  onClick={handleNextQuestion}
                  className="bg-green-500 hover:bg-green-600 text-white font-bold px-8 py-4 rounded-xl text-xl transition-colors"
                >
                  Prossima domanda
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- PODIUM PHASE ---
  if (phase === "podium" && gameOverData) {
    const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    const podiumHeights = ["h-40", "h-32", "h-24"];
    const podiumOrder = [1, 0, 2]; // Display order: 2nd, 1st, 3rd

    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-500 to-orange-600 text-white flex flex-col items-center p-8">
        <h2 className="text-4xl font-bold mb-12">Podio</h2>

        {/* Top 3 podium */}
        <div className="flex items-end justify-center gap-6 mb-12">
          {podiumOrder.map((position) => {
            const player = gameOverData.podium.find(
              (p) => p.position === position + 1
            );
            if (!player) return null;
            return (
              <div
                key={player.playerName}
                className="flex flex-col items-center"
              >
                <span className="text-5xl mb-2">{medals[position]}</span>
                <span className="font-bold text-lg mb-1">
                  {player.playerName}
                </span>
                <span className="text-sm opacity-80 mb-3">
                  {player.score} punti
                </span>
                <div
                  className={`${podiumHeights[position]} w-28 bg-white/20 backdrop-blur rounded-t-xl flex items-start justify-center pt-3`}
                >
                  <span className="text-3xl font-black">{position + 1}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full results list */}
        <div className="bg-white/10 backdrop-blur rounded-xl p-6 w-full max-w-lg mb-8">
          <h3 className="text-lg font-semibold mb-4">Classifica completa</h3>
          <div className="space-y-2">
            {gameOverData.fullResults.map((entry, i) => (
              <div
                key={entry.playerName}
                className="flex items-center justify-between bg-white/10 rounded-lg px-4 py-2"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold opacity-60 w-8">{i + 1}.</span>
                  <span className="font-medium">{entry.playerName}</span>
                </div>
                <span className="font-bold">{entry.score}</span>
              </div>
            ))}
          </div>
        </div>

        <Link
          href="/dashboard"
          className="bg-white text-orange-600 hover:bg-white/90 font-bold px-8 py-4 rounded-xl text-xl transition-colors"
        >
          Torna alla dashboard
        </Link>
      </div>
    );
  }

  return null;
}
