"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useSocket } from "@/lib/socket/client";
import Link from "next/link";
import type { QuestionOptions, MultipleChoiceOptions } from "@/types";
import type { QuestionType } from "@prisma/client";
import { isCustomAvatar } from "@/lib/emoji-avatars";
import { withBasePath } from "@/lib/base-path";

function HostAvatar({ avatar, className }: { avatar?: string; className?: string }) {
  const av = avatar || "👤";
  if (isCustomAvatar(av)) {
    return <img src={withBasePath(av)} alt="avatar" className={`object-contain inline-block ${className ?? ""}`} />;
  }
  return <span className={className}>{av}</span>;
}

function CorrectAnswerDisplay({ type, options }: { type?: QuestionType; options: QuestionOptions }) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const cls = "text-base lg:text-lg text-white/90";
  if (!type) return null;

  switch (type) {
    case "MULTIPLE_CHOICE": {
      const mc = options as MultipleChoiceOptions;
      const correct = mc.choices.filter((c) => c.isCorrect).map((c) => c.text);
      return <p className={cls}>{correct.join(", ")}</p>;
    }
    case "TRUE_FALSE": {
      const tf = options as { correct: boolean };
      return <p className={cls}>{tf.correct ? tc("true") : tc("false")}</p>;
    }
    case "OPEN_ANSWER": {
      const oa = options as { acceptedAnswers: string[] };
      return <p className={cls}>{oa.acceptedAnswers.join(", ")}</p>;
    }
    case "ORDERING": {
      const ord = options as { items: string[]; correctOrder: number[] };
      const ordered = ord.correctOrder.map((i) => ord.items[i]);
      return (
        <ol className={`${cls} list-decimal list-inside space-y-0.5`}>
          {ordered.map((item, i) => <li key={i}>{item}</li>)}
        </ol>
      );
    }
    case "MATCHING": {
      const m = options as { pairs: { left: string; right: string }[] };
      return (
        <div className={`${cls} space-y-0.5`}>
          {m.pairs.map((p, i) => <p key={i}>{p.left} → {p.right}</p>)}
        </div>
      );
    }
    case "SPOT_ERROR": {
      const se = options as { lines: string[]; errorIndices: number[]; explanation?: string };
      return (
        <div className={cls}>
          <p>{t("errorRows", { indices: se.errorIndices.map((i) => i + 1).join(", ") })}</p>
          {se.explanation && <p className="text-sm text-emerald-300/70 mt-1">{se.explanation}</p>}
        </div>
      );
    }
    case "NUMERIC_ESTIMATION": {
      const ne = options as { correctValue: number; unit?: string };
      return <p className={cls}>{ne.correctValue}{ne.unit ? ` ${ne.unit}` : ""}</p>;
    }
    case "IMAGE_HOTSPOT": {
      return <p className={cls}>{t("hotspotCorrect")}</p>;
    }
    case "CODE_COMPLETION": {
      const cc = options as { correctAnswer: string };
      return <pre className={`${cls} bg-slate-900/50 rounded-lg px-3 py-2 font-mono text-sm`}>{cc.correctAnswer}</pre>;
    }
    default:
      return null;
  }
}

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
  leaderboard: { playerName: string; playerAvatar?: string; score: number; delta: number }[];
}

interface GameOverData {
  podium: { playerName: string; playerAvatar?: string; score: number; position: number }[];
  fullResults: { playerName: string; playerAvatar?: string; score: number }[];
}

const MC_COLORS = [
  "from-red-500 to-red-600",
  "from-blue-500 to-blue-600",
  "from-amber-500 to-yellow-500",
  "from-emerald-500 to-green-600",
];

const MC_ICONS = ["\u25B2", "\u25C6", "\u25CF", "\u25A0"];

export function HostView({ session }: Props) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<{ name: string; avatar?: string }[]>([]);
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

    const handlePlayerJoined = (data: { playerName: string; playerAvatar?: string; playerCount: number }) => {
      if (data.playerName === "__host__") return;
      setPlayers((prev) => [
        ...prev.filter((p) => p.name !== data.playerName),
        { name: data.playerName, avatar: data.playerAvatar },
      ]);
      setPlayerCount(data.playerCount);
    };

    const handleGameState = (data: { status: string; currentQuestion?: number }) => {
      if (data.status === "IN_PROGRESS" && data.currentQuestion !== undefined) {
        // Host is rejoining a game in progress — set phase to question
        // The actual question data will arrive via questionStart if host emits nextQuestion
        // For now, show a "rejoin" state so host can advance
        setPhase("question");
      }
    };

    const handlePlayerLeft = (data: { playerName: string; playerCount: number }) => {
      setPlayers((prev) => prev.filter((p) => p.name !== data.playerName));
      setPlayerCount(data.playerCount);
    };

    const handlePlayerReconnected = (data: { playerName: string; playerCount: number }) => {
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
    socket.on("gameState", handleGameState);
    socket.on("playerLeft", handlePlayerLeft);
    socket.on("playerReconnected", handlePlayerReconnected);
    socket.on("questionStart", handleQuestionStart);
    socket.on("answerCount", handleAnswerCount);
    socket.on("questionResult", handleQuestionResult);
    socket.on("gameOver", handleGameOver);

    return () => {
      socket.off("playerJoined", handlePlayerJoined);
      socket.off("gameState", handleGameState);
      socket.off("playerLeft", handlePlayerLeft);
      socket.off("playerReconnected", handlePlayerReconnected);
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

  // Auto-transition to result phase when timer expires
  useEffect(() => {
    if (phase === "question" && timeLeft === 0) {
      setPhase("result");
    }
  }, [phase, timeLeft]);

  // Auto-transition when all answered
  useEffect(() => {
    if (phase === "question" && answerCount.total > 0 && answerCount.count >= answerCount.total) {
      setPhase("result");
    }
  }, [phase, answerCount]);

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

  /* ================================================================== */
  /*  LOBBY                                                              */
  /* ================================================================== */
  if (phase === "lobby") {
    // Format PIN with spacing for readability (e.g. "982 025")
    const formattedPin = session.pin.length === 6
      ? `${session.pin.slice(0, 3)} ${session.pin.slice(3)}`
      : session.pin;

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        {/* Top bar */}
        <header className="bg-slate-800/80 backdrop-blur border-b border-slate-700 px-6 lg:px-10 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm shadow shrink-0">
              Q
            </div>
            <h1 className="text-lg lg:text-xl font-bold truncate text-slate-200">{session.quiz.title}</h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <span className="text-sm text-slate-400 hidden sm:inline">
              {tc("questions", { count: session.quiz.questions.length })}
            </span>
            <div className="flex items-center gap-2">
              <span className={`inline-block w-2.5 h-2.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400 animate-pulse"}`} />
              <span className="text-sm text-slate-500">{connected ? "Online" : "..."}</span>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* ── Left: JOIN instructions + PIN ── */}
          <section className="lg:w-5/12 flex flex-col items-center justify-center p-8 lg:p-12 xl:p-16 bg-gradient-to-br from-indigo-600 via-indigo-700 to-purple-800 relative overflow-hidden">
            {/* Subtle decorative circles */}
            <div className="absolute -top-20 -left-20 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
            <div className="absolute -bottom-32 -right-16 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl" />

            {/* Step instructions */}
            <div className="relative z-10 text-center mb-8">
              <div className="inline-flex flex-col gap-3 text-left">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">1</span>
                  <span className="text-lg lg:text-xl text-indigo-100 font-medium">
                    {t("goTo")} <span className="font-bold text-white underline underline-offset-4 decoration-2">savint.it</span>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">2</span>
                  <span className="text-lg lg:text-xl text-indigo-100 font-medium">{t("enterThisPin")}</span>
                </div>
              </div>
            </div>

            {/* PIN card */}
            <div className="relative z-10 bg-white rounded-3xl px-10 lg:px-14 xl:px-20 py-6 lg:py-8 shadow-2xl shadow-black/30">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400 text-center mb-2 font-semibold">
                {t("gamePin")}
              </p>
              <p className="text-7xl lg:text-8xl xl:text-9xl font-black text-slate-900 tracking-[0.2em] text-center tabular-nums leading-none">
                {formattedPin}
              </p>
            </div>

            {/* Quiz info */}
            <div className="relative z-10 mt-8 flex items-center gap-4 text-indigo-200 text-sm lg:text-base">
              <span>{tc("questions", { count: session.quiz.questions.length })}</span>
            </div>
          </section>

          {/* ── Right: Players + Start ── */}
          <section className="lg:w-7/12 flex flex-col p-5 lg:p-8 xl:p-10 bg-slate-900">
            {/* Players header */}
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl lg:text-2xl font-bold text-slate-200">
                  {t("players")}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-lg lg:text-xl font-bold px-4 py-1.5 rounded-full tabular-nums">
                  {playerCount}
                </span>
              </div>
            </div>

            {/* Players grid */}
            <div className="flex-1 bg-slate-800/50 rounded-2xl border border-slate-700/50 p-4 lg:p-6 overflow-y-auto mb-5">
              {players.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500">
                  <span className="text-5xl lg:text-6xl mb-4 animate-float-bounce">⏳</span>
                  <p className="text-lg lg:text-xl font-medium">{t("waitingForPlayers")}</p>
                  <p className="text-sm text-slate-600 mt-1 flex items-center gap-1">
                    <span className="inline-flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: "300ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" style={{ animationDelay: "600ms" }} />
                    </span>
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 lg:gap-3 content-start">
                  {players.map((player, i) => (
                    <div
                      key={player.name}
                      className="bg-slate-700/70 hover:bg-slate-700 border border-slate-600/50 rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all animate-score-pop"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <HostAvatar avatar={player.avatar} className={isCustomAvatar(player.avatar || "") ? "w-10 h-10 lg:w-12 lg:h-12" : "text-3xl lg:text-4xl"} />
                      <span className="text-sm lg:text-base font-semibold text-slate-200 truncate max-w-full text-center">
                        {player.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Start button */}
            <button
              onClick={handleStartGame}
              disabled={playerCount === 0}
              className={`w-full font-extrabold px-10 py-5 lg:py-6 rounded-2xl text-xl lg:text-2xl transition-all shrink-0 ${
                playerCount === 0
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg shadow-green-900/30 hover:shadow-green-500/30 hover:scale-[1.01] active:scale-[0.98]"
              }`}
            >
              {playerCount === 0
                ? t("waitingForPlayersBtn")
                : t("startQuiz", { count: playerCount, suffix: playerCount === 1 ? "e" : "i" })}
            </button>
          </section>
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  QUESTION                                                           */
  /* ================================================================== */
  if (phase === "question") {
    const q = currentQuestion;
    if (!q) return null;

    const progressPercent =
      answerCount.total > 0
        ? Math.round((answerCount.count / answerCount.total) * 100)
        : 0;

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        {/* Top bar */}
        <header className="bg-slate-800 border-b border-slate-700 px-6 lg:px-10 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="text-sm lg:text-base font-semibold text-slate-400">
              {t("questionHeader", { index: q.questionIndex + 1, total: q.totalQuestions })}
            </span>
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-32 lg:w-48 bg-slate-700 rounded-full h-2.5">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${((q.questionIndex + 1) / q.totalQuestions) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 lg:gap-6">
            {/* Answer counter */}
            <div className="flex items-center gap-2 bg-slate-700 rounded-xl px-4 py-2">
              <span className="text-lg">✋</span>
              <span className="text-base lg:text-lg font-bold">
                {answerCount.count}
                <span className="text-slate-400 font-normal">/{answerCount.total}</span>
              </span>
            </div>

            {/* Timer */}
            <div
              className={`w-14 h-14 lg:w-16 lg:h-16 rounded-full flex items-center justify-center text-2xl lg:text-3xl font-black transition-colors ${
                timeLeft <= 5 && timeLeft > 0
                  ? "bg-red-500 text-white animate-countdown-pulse ring-4 ring-red-400/50"
                  : timeLeft <= 10 && timeLeft > 0
                    ? "bg-amber-500 text-white"
                    : "bg-slate-700 text-white"
              }`}
            >
              {timeLeft}
            </div>
          </div>
        </header>

        {/* Question body */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 lg:px-16 py-8">
          <h2 className="text-3xl lg:text-5xl xl:text-6xl font-bold text-center mb-8 max-w-5xl animate-slide-up-fade leading-tight">
            {q.question.text}
          </h2>

          {q.question.mediaUrl && (
            <img
              src={q.question.mediaUrl.startsWith("/") ? withBasePath(q.question.mediaUrl) : q.question.mediaUrl}
              alt="Immagine della domanda"
              className="max-h-48 lg:max-h-72 rounded-2xl mb-8 object-contain shadow-lg"
            />
          )}
        </div>

        {/* Answer options (MULTIPLE_CHOICE) */}
        {q.question.type === "MULTIPLE_CHOICE" && (
          <div className="grid grid-cols-2 gap-3 lg:gap-4 px-6 lg:px-10 pb-6">
            {(q.question.options as MultipleChoiceOptions).choices.map(
              (choice, i) => (
                <div
                  key={i}
                  className={`bg-gradient-to-br ${MC_COLORS[i % MC_COLORS.length]} rounded-2xl p-4 lg:p-6 flex items-center gap-3 lg:gap-4 shadow-lg`}
                >
                  <span className="text-2xl lg:text-3xl font-bold opacity-50">
                    {MC_ICONS[i % MC_ICONS.length]}
                  </span>
                  <span className="text-lg lg:text-2xl font-bold">{choice.text}</span>
                </div>
              )
            )}
          </div>
        )}

        {/* True/False display */}
        {q.question.type === "TRUE_FALSE" && (
          <div className="grid grid-cols-2 gap-3 lg:gap-4 px-6 lg:px-10 pb-6">
            <div className="bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl p-6 lg:p-8 flex items-center justify-center shadow-lg">
              <span className="text-2xl lg:text-3xl font-extrabold">{tc("true")}</span>
            </div>
            <div className="bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl p-6 lg:p-8 flex items-center justify-center shadow-lg">
              <span className="text-2xl lg:text-3xl font-extrabold">{tc("false")}</span>
            </div>
          </div>
        )}

        {/* SPOT_ERROR display */}
        {q.question.type === "SPOT_ERROR" && (
          <div className="px-6 lg:px-10 pb-6 max-w-3xl mx-auto w-full">
            <div className="bg-slate-800 rounded-2xl p-4 lg:p-6 font-mono text-sm lg:text-base space-y-1">
              {((q.question.options as any).lines as string[]).map((line, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 rounded-lg hover:bg-slate-700/50">
                  <span className="text-slate-500 w-6 text-right shrink-0">{i + 1}</span>
                  <span className="text-green-300">{line}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* NUMERIC_ESTIMATION display */}
        {q.question.type === "NUMERIC_ESTIMATION" && (
          <div className="px-6 lg:px-10 pb-6 flex justify-center">
            <div className="bg-slate-800 rounded-2xl px-8 py-6 flex items-center gap-3 border border-slate-700">
              <span className="text-4xl lg:text-5xl">🔢</span>
              <span className="text-xl lg:text-2xl font-semibold text-slate-300">
                {t("enterNumericValue")}
                {(q.question.options as any).unit && (
                  <span className="text-slate-400 ml-2">({(q.question.options as any).unit})</span>
                )}
              </span>
            </div>
          </div>
        )}

        {/* IMAGE_HOTSPOT display */}
        {q.question.type === "IMAGE_HOTSPOT" && (
          <div className="px-6 lg:px-10 pb-6 flex justify-center">
            <div className="bg-slate-800 rounded-2xl p-4 border border-slate-700">
              <img
                src={((q.question.options as any).imageUrl || "").startsWith("/") ? withBasePath((q.question.options as any).imageUrl) : (q.question.options as any).imageUrl}
                alt="Hotspot"
                className="max-h-64 lg:max-h-96 rounded-xl"
              />
              <p className="text-center text-sm text-slate-400 mt-2">{t("tapCorrectPoint")}</p>
            </div>
          </div>
        )}

        {/* CODE_COMPLETION display */}
        {q.question.type === "CODE_COMPLETION" && (
          <div className="px-6 lg:px-10 pb-6 max-w-3xl mx-auto w-full">
            <div className="bg-slate-800 rounded-2xl p-4 lg:p-6 font-mono text-sm lg:text-base space-y-1">
              {((q.question.options as any).codeLines as string[]).map((line, i) => (
                <div key={i} className="flex gap-3 px-3 py-1.5 rounded-lg">
                  <span className="text-slate-500 w-6 text-right shrink-0">{i + 1}</span>
                  {i === (q.question.options as any).blankLineIndex ? (
                    <span className="text-amber-400 font-bold animate-pulse">{"??? ←"}</span>
                  ) : (
                    <span className="text-green-300">{line}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div className="px-6 lg:px-10 pb-4">
          <div className="bg-slate-800 rounded-full h-3 lg:h-4 overflow-hidden border border-slate-700">
            <div
              className="bg-gradient-to-r from-green-400 to-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className="text-center text-sm text-slate-500 mt-2">
            {t("answeredPercent", { value: progressPercent })}
          </p>
        </div>
      </div>
    );
  }

  /* ================================================================== */
  /*  RESULT                                                             */
  /* ================================================================== */
  if (phase === "result") {
    const q = currentQuestion;
    const isLastQuestion = q && q.questionIndex + 1 >= q.totalQuestions;

    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col">
        {/* Top bar */}
        <header className="bg-slate-800 border-b border-slate-700 px-6 lg:px-10 py-4 flex items-center justify-between">
          <h2 className="text-xl lg:text-2xl font-bold">
            {t("resultsHeader", { index: q ? q.questionIndex + 1 : "" })}
          </h2>
          <span className="text-sm lg:text-base text-slate-400">
            {q ? `${q.questionIndex + 1} / ${q.totalQuestions}` : ""}
          </span>
        </header>

        {!resultsRevealed ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <span className="text-7xl">📊</span>
            <p className="text-xl lg:text-2xl text-slate-400">{t("readyToShowResults")}</p>
            <button
              onClick={handleShowResults}
              className="bg-gradient-to-r from-amber-400 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-900 font-extrabold px-10 lg:px-14 py-4 lg:py-5 rounded-2xl text-xl lg:text-2xl transition-all shadow-lg shadow-amber-900/30 hover:scale-105 active:scale-95"
            >
              {t("showResults")}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 p-6 lg:p-10 overflow-auto">
            {/* Left: Correct answer + Distribution chart */}
            {resultData && (
              <section className="lg:w-1/2 flex flex-col gap-6">
              {/* Correct answer */}
              <div className="bg-emerald-800/40 border border-emerald-600/50 rounded-2xl p-5 lg:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">✅</span>
                  <h3 className="text-lg lg:text-xl font-bold text-emerald-300">{t("correctAnswer")}</h3>
                </div>
                <CorrectAnswerDisplay type={q?.question.type} options={resultData.correctAnswer} />
              </div>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 lg:p-8 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-2xl">📊</span>
                  <h3 className="text-xl lg:text-2xl font-bold">{t("answerDistribution")}</h3>
                </div>
                <div className="flex-1 flex items-end gap-3 lg:gap-5 min-h-[200px] lg:min-h-[280px]">
                  {Object.entries(resultData.distribution).map(([key, value], i) => {
                    const maxVal = Math.max(...Object.values(resultData.distribution), 1);
                    const heightPercent = (value / maxVal) * 100;
                    return (
                      <div key={key} className="flex-1 flex flex-col items-center gap-2">
                        <span className="text-lg lg:text-xl font-bold">{value}</span>
                        <div
                          className={`bg-gradient-to-t ${MC_COLORS[i % MC_COLORS.length]} w-full rounded-t-xl transition-all duration-700`}
                          style={{ height: `${heightPercent}%`, minHeight: 8 }}
                        />
                        <span className="text-xs lg:text-sm text-slate-400 truncate max-w-full text-center">
                          {key}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              </section>
            )}

            {/* Right: Leaderboard + actions */}
            <section className="lg:w-1/2 flex flex-col gap-6">
              {/* Leaderboard */}
              {resultData && resultData.leaderboard.length > 0 && (
                <div className="bg-slate-800 rounded-2xl border border-slate-700 p-6 lg:p-8 flex-1">
                  <div className="flex items-center gap-2 mb-6">
                    <span className="text-2xl">🏆</span>
                    <h3 className="text-xl lg:text-2xl font-bold">{t("top5")}</h3>
                  </div>
                  <div className="space-y-3">
                    {resultData.leaderboard.slice(0, 5).map((entry, i) => (
                      <div
                        key={entry.playerName}
                        className="flex items-center justify-between bg-slate-700/50 hover:bg-slate-700 border border-slate-600/50 rounded-xl px-4 lg:px-5 py-3 lg:py-4 transition-colors animate-slide-up-fade"
                        style={{ animationDelay: `${i * 100}ms` }}
                      >
                        <div className="flex items-center gap-3 lg:gap-4">
                          <span className="text-xl lg:text-2xl font-black text-slate-500 w-8">
                            {i + 1}
                          </span>
                          <HostAvatar avatar={entry.playerAvatar} className={isCustomAvatar(entry.playerAvatar || "") ? "w-8 h-8 lg:w-10 lg:h-10" : "text-2xl lg:text-3xl"} />
                          <span className="font-bold text-base lg:text-lg">{entry.playerName}</span>
                        </div>
                        <div className="flex items-center gap-3 lg:gap-4">
                          <span className="text-green-400 text-sm lg:text-base font-bold bg-green-400/10 px-2 py-1 rounded-lg">
                            +{entry.delta}
                          </span>
                          <span className="font-extrabold text-lg lg:text-xl">{entry.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action button */}
              <div className="flex">
                {isLastQuestion ? (
                  <button
                    onClick={handleEndGame}
                    className="w-full bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-900 font-extrabold px-8 py-5 lg:py-6 rounded-2xl text-xl lg:text-2xl transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {t("showPodium")}
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white font-extrabold px-8 py-5 lg:py-6 rounded-2xl text-xl lg:text-2xl transition-all shadow-lg shadow-green-900/30 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    {t("nextQuestion")}
                  </button>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    );
  }

  /* ================================================================== */
  /*  PODIUM                                                             */
  /* ================================================================== */
  if (phase === "podium" && gameOverData) {
    const medals = ["🥇", "🥈", "🥉"];
    const podiumBg = [
      "from-amber-400 to-yellow-500",
      "from-slate-300 to-slate-400",
      "from-amber-600 to-orange-700",
    ];
    const podiumHeights = ["h-44 lg:h-56", "h-32 lg:h-40", "h-24 lg:h-32"];
    const podiumOrder = [1, 0, 2]; // Display: 2nd, 1st, 3rd

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col">
        {/* Header */}
        <header className="text-center pt-8 lg:pt-12 pb-4">
          <h2 className="text-4xl lg:text-6xl font-black">{t("podiumTitle")}</h2>
          <p className="text-lg lg:text-xl text-slate-400 mt-2">{session.quiz.title}</p>
        </header>

        {/* Top 3 podium visual */}
        <div className="flex-1 flex items-end justify-center gap-3 lg:gap-6 px-6 lg:px-16 pb-0">
          {podiumOrder.map((position) => {
            const player = gameOverData.podium.find((p) => p.position === position + 1);
            if (!player) return <div key={position} className="flex-1 max-w-[200px]" />;
            return (
              <div
                key={player.playerName}
                className="flex-1 max-w-[200px] flex flex-col items-center animate-podium-rise"
                style={{ animationDelay: `${position * 400}ms` }}
              >
                <HostAvatar avatar={player.playerAvatar} className={isCustomAvatar(player.playerAvatar || "") ? "w-20 h-20 lg:w-28 lg:h-28 mb-2" : "text-5xl lg:text-7xl mb-2"} />
                <span className="text-3xl lg:text-4xl mb-1">{medals[position]}</span>
                <span className="font-extrabold text-lg lg:text-2xl mb-1 text-center truncate max-w-full">
                  {player.playerName}
                </span>
                <span className="text-sm lg:text-lg text-slate-300 mb-3 font-semibold">
                  {player.score} punti
                </span>
                <div
                  className={`${podiumHeights[position]} w-full bg-gradient-to-t ${podiumBg[position]} rounded-t-2xl flex items-start justify-center pt-4`}
                >
                  <span className="text-4xl lg:text-5xl font-black text-white/80">{position + 1}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Full results */}
        <section className="bg-slate-800 border-t border-slate-700 px-6 lg:px-16 py-6 lg:py-8">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xl">📋</span>
              <h3 className="text-lg lg:text-xl font-bold">{t("fullLeaderboard")}</h3>
            </div>
            <div className="space-y-2">
              {gameOverData.fullResults.map((entry, i) => (
                <div
                  key={entry.playerName}
                  className="flex items-center justify-between bg-slate-700/50 border border-slate-600/50 rounded-xl px-4 lg:px-5 py-2.5 lg:py-3 animate-slide-up-fade"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-500 w-8 text-lg">{i + 1}.</span>
                    <HostAvatar avatar={entry.playerAvatar} className={isCustomAvatar(entry.playerAvatar || "") ? "w-8 h-8 lg:w-10 lg:h-10" : "text-xl lg:text-2xl"} />
                    <span className="font-semibold text-base lg:text-lg">{entry.playerName}</span>
                  </div>
                  <span className="font-extrabold text-lg lg:text-xl">{entry.score} pt</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer action */}
        <footer className="bg-slate-900 border-t border-slate-700 px-6 lg:px-16 py-5 flex justify-center">
          <Link
            href="/dashboard"
            className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold px-10 lg:px-14 py-4 lg:py-5 rounded-2xl text-lg lg:text-xl transition-all shadow-lg hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("backToDashboard")}
          </Link>
        </footer>
      </div>
    );
  }

  return null;
}
