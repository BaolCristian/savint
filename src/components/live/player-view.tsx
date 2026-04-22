"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSocket } from "@/lib/socket/client";
import { fetchCustomEmoticons, buildCategories, randomEmoji, isCustomAvatar } from "@/lib/emoji-avatars";
import { useSearchParams } from "next/navigation";
import { withBasePath } from "@/lib/base-path";
import { playCorrect, playWrong, playTick, playTimeUp, setMuted } from "@/lib/sounds";
import { UserX } from "lucide-react";
import type {
  AnswerValue,
  MatchingOptions,
  MultipleChoiceOptions,
  OpenAnswerOptions,
  OrderingOptions,
  QuestionOptions,
  SpotErrorOptions,
  NumericEstimationOptions,
  ImageHotspotOptions,
  CodeCompletionOptions,
} from "@/types";
import type { QuestionType } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Phase = "join" | "waiting" | "countdown" | "question" | "feedback" | "podium" | "kicked";

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

interface FeedbackData {
  isCorrect: boolean;
  score: number;
  totalScore: number;
  classCorrectPercent: number;
}

interface PlayerStatsData {
  position: number;
  totalPlayers: number;
  responseTimeMs: number;
  correctCount: number;
  totalAnswered: number;
  streak: number;
}

interface PodiumData {
  podium: { playerName: string; score: number; position: number; playerAvatar?: string }[];
  fullResults: { playerName: string; score: number; playerAvatar?: string }[];
}

/* ------------------------------------------------------------------ */
/*  Confetti                                                           */
/* ------------------------------------------------------------------ */

function Confetti() {
  const colors = [
    "#FF6B6B", "#FFD93D", "#6BCB77", "#4D96FF",
    "#FF8C00", "#E040FB", "#00E5FF", "#FF4081",
    "#FFEB3B", "#76FF03", "#536DFE", "#FF1744",
  ];
  const shapes = ["circle", "rect", "star"] as const;
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 1}s`,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 10,
    shape: shapes[i % shapes.length],
    duration: `${2 + Math.random() * 1.5}s`,
  }));
  return (
    <div className="confetti-container">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti-piece-v2"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            backgroundColor: p.shape !== "star" ? p.color : "transparent",
            width: p.size,
            height: p.shape === "rect" ? p.size * 0.4 : p.size,
            borderRadius: p.shape === "circle" ? "50%" : p.shape === "rect" ? "2px" : "0",
            ...(p.shape === "star" ? {
              borderLeft: `${p.size / 2}px solid transparent`,
              borderRight: `${p.size / 2}px solid transparent`,
              borderBottom: `${p.size}px solid ${p.color}`,
              backgroundColor: "transparent",
              width: 0,
              height: 0,
            } : {}),
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Countdown "Pronti, Partenza, Via!"                                 */
/* ------------------------------------------------------------------ */

function PlayerCountdownScreen({ onComplete }: { onComplete: () => void }) {
  const t = useTranslations("live");
  const [step, setStep] = useState(0);

  const words = [t("ready"), t("set"), t("go")];
  const colors = [
    "from-amber-500 to-orange-600",
    "from-orange-500 to-red-600",
    "from-green-500 to-emerald-600",
  ];

  useEffect(() => {
    if (step < 2) {
      const timer = setTimeout(() => setStep((s) => s + 1), 1000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(onComplete, 800);
      return () => clearTimeout(timer);
    }
  }, [step, onComplete]);

  useEffect(() => {
    playTick();
  }, [step]);

  return (
    <div className={`min-h-dvh bg-gradient-to-br ${colors[step]} flex items-center justify-center transition-all duration-300`}>
      <div key={step} className="text-5xl sm:text-7xl lg:text-9xl font-black text-white animate-zoom-in-bounce drop-shadow-2xl">
        {words[step]}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Avatar renderer                                                    */
/* ------------------------------------------------------------------ */

function AvatarDisplay({ avatar, className }: { avatar: string; className?: string }) {
  if (isCustomAvatar(avatar)) {
    return <img src={withBasePath(avatar)} alt="avatar" className={`object-contain inline-block ${className ?? ""}`} />;
  }
  return <span className={className}>{avatar}</span>;
}

/* ------------------------------------------------------------------ */
/*  PlayerView                                                         */
/* ------------------------------------------------------------------ */

interface PlayerViewProps {
  testMode?: boolean;
  testPin?: string;
  testPlayerName?: string;
}

export function PlayerView({ testMode, testPin, testPlayerName }: PlayerViewProps = {}) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const { socket, connected, reconnecting } = useSocket();
  const searchParams = useSearchParams();

  const [phase, setPhase] = useState<Phase>(testMode ? "waiting" : "join");
  const [pin, setPin] = useState(() => (testMode ? testPin ?? "" : searchParams.get("pin") ?? ""));
  const [name, setName] = useState(testMode ? testPlayerName ?? "" : "");
  const [error, setError] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [playerStats, setPlayerStats] = useState<PlayerStatsData | null>(null);
  const [podium, setPodium] = useState<PodiumData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [awaitingConfidence, setAwaitingConfidence] = useState(false);
  const [confidenceRevealing, setConfidenceRevealing] = useState(false);

  const [avatar, setAvatar] = useState("");
  const [avatarCategory, setAvatarCategory] = useState(0);
  const [emojiCategories, setEmojiCategories] = useState(buildCategories([]));

  // Load custom emoticons and pick a random avatar on mount
  useEffect(() => {
    fetchCustomEmoticons().then((custom) => {
      const cats = buildCategories(custom);
      setEmojiCategories(cats);
      const allEmojis = cats.flatMap((c) => c.emojis);
      setAvatar((prev) => prev || randomEmoji(allEmojis));
    });
  }, []);

  const questionStartTime = useRef<number>(0);

  /* ---------- auto-rejoin on reconnect ---------- */

  useEffect(() => {
    if (!socket || !connected) return;
    if (testMode) return; // skip auto-rejoin in test mode
    // On (re)connect, try to rejoin if we have saved session info
    const saved = sessionStorage.getItem("savint-session");
    if (!saved) return;

    try {
      const { sessionId, playerName } = JSON.parse(saved);
      if (sessionId && playerName) {
        setName(playerName);
        socket.emit("rejoinSession", { sessionId, playerName });
      }
    } catch {
      sessionStorage.removeItem("savint-session");
    }
  }, [socket, connected]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- auto-join in test mode ---------- */

  const testJoinedRef = useRef(false);
  useEffect(() => {
    if (!testMode || !socket || !connected) return;
    if (testJoinedRef.current) return;
    if (!testPin || !testPlayerName) return;
    testJoinedRef.current = true;
    socket.emit("joinSession", { pin: testPin, playerName: testPlayerName });
  }, [testMode, socket, connected, testPin, testPlayerName]);

  /* ---------- socket listeners ---------- */

  useEffect(() => {
    if (!socket) return;

    const onSessionError = (data: { message: string }) => {
      // If rejoin failed, clear saved session and stay on join screen
      sessionStorage.removeItem("savint-session");
      if (data.message === "nicknameKicked") {
        setError(t("nicknameKicked"));
      } else {
        setError(data.message);
      }
    };

    const onKicked = () => {
      sessionStorage.removeItem("savint-session");
      setPhase("kicked");
    };

    const onPlayerJoined = (data: { playerName: string }) => {
      if (data.playerName === name) {
        setPhase("waiting");
        setError(null);
      }
    };

    const onGameState = (data: { sessionId: string }) => {
      // Save session info for reconnection
      if (data.sessionId && name) {
        sessionStorage.setItem("savint-session", JSON.stringify({
          sessionId: data.sessionId,
          playerName: name,
        }));
      }
    };

    const onRejoinSuccess = (data: {
      totalScore: number;
      currentQuestion?: number;
      totalQuestions: number;
      phase: "waiting" | "question" | "feedback";
    }) => {
      setError(null);
      if (data.phase === "question" || data.phase === "feedback") {
        // Player is back mid-game — show waiting for next question
        setPhase("waiting");
      } else {
        setPhase("waiting");
      }
    };

    const onQuestionStart = (data: QuestionData) => {
      setQuestionData(data);
      setTimeLeft(data.question.timeLimit);
      setSubmitted(false);
      setPlayerStats(null);
      questionStartTime.current = Date.now();
      setPhase("question");
    };

    const onAnswerFeedback = (data: FeedbackData & { confidenceEnabled?: boolean }) => {
      setFeedback(data);
      if (data.confidenceEnabled) {
        setAwaitingConfidence(true);
      }
      setPhase("feedback");
    };

    const onGameOver = (data: PodiumData) => {
      setPodium(data);
      setPhase("podium");
      sessionStorage.removeItem("savint-session");
    };

    const onPlayerStats = (data: PlayerStatsData) => {
      setPlayerStats(data);
    };

    const onMuteChanged = ({ muted }: { muted: boolean }) => {
      setMuted(muted);
    };

    socket.on("sessionError", onSessionError);
    socket.on("kicked", onKicked);
    socket.on("playerJoined", onPlayerJoined);
    socket.on("gameState", onGameState);
    socket.on("rejoinSuccess", onRejoinSuccess);
    socket.on("questionStart", onQuestionStart);
    socket.on("answerFeedback", onAnswerFeedback);
    socket.on("playerStats", onPlayerStats);
    socket.on("gameOver", onGameOver);
    socket.on("muteChanged", onMuteChanged);

    return () => {
      socket.off("sessionError", onSessionError);
      socket.off("kicked", onKicked);
      socket.off("playerJoined", onPlayerJoined);
      socket.off("gameState", onGameState);
      socket.off("rejoinSuccess", onRejoinSuccess);
      socket.off("questionStart", onQuestionStart);
      socket.off("answerFeedback", onAnswerFeedback);
      socket.off("playerStats", onPlayerStats);
      socket.off("gameOver", onGameOver);
      socket.off("muteChanged", onMuteChanged);
    };
  }, [socket, name]);

  /* ---------- countdown timer ---------- */

  useEffect(() => {
    if (phase !== "question" || !questionData) return;
    if (timeLeft <= 0) return;

    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          playTimeUp();
          return 0;
        }
        if (t <= 6) playTick(); // tick for last 5 seconds (t-1 will be <=5)
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase, questionData, timeLeft]);

  /* ---------- sound + vibrate on feedback ---------- */

  const soundPlayedRef = useRef(false);

  useEffect(() => {
    // Reset sound flag when new feedback arrives
    if (phase === "feedback" && feedback) {
      soundPlayedRef.current = false;
    }
  }, [phase, feedback]);

  // Play sound on confidence reveal or direct feedback (no confidence)
  useEffect(() => {
    if (!feedback || soundPlayedRef.current) return;

    const shouldPlay = confidenceRevealing || (phase === "feedback" && !awaitingConfidence && !confidenceRevealing);
    if (shouldPlay) {
      soundPlayedRef.current = true;
      if (feedback.isCorrect) {
        playCorrect();
      } else {
        playWrong();
        navigator.vibrate?.(200);
      }
    }
  }, [phase, feedback, awaitingConfidence, confidenceRevealing]);

  /* ---------- submit handler ---------- */

  const handleSubmit = useCallback(
    (value: AnswerValue) => {
      if (!socket || submitted || timeLeft <= 0) return;
      socket.emit("submitAnswer", { value });
      setSubmitted(true);
    },
    [socket, submitted, timeLeft],
  );

  /* ---------- join handler ---------- */

  const handleJoin = () => {
    if (!socket || !connected) return;
    if (!pin || !/^\d{5,8}$/.test(pin)) {
      setError(t("enterPin"));
      return;
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError(t("invalidName"));
      return;
    }
    setError(null);
    socket.emit("joinSession", { pin, playerName: trimmedName, playerAvatar: avatar });
  };

  /* ---------- leave handler ---------- */
  const handleLeave = useCallback(() => {
    if (!confirm(t("leaveConfirm"))) return;
    socket?.emit("leaveSession");
    sessionStorage.removeItem("savint-session");
    setPhase("join");
    setPin("");
    setName("");
    setQuestionData(null);
    setFeedback(null);
    setPlayerStats(null);
    setPodium(null);
  }, [socket, t]);

  /* ---------- render phases ---------- */

  if (phase === "join") {
    const currentEmojis = emojiCategories[avatarCategory]?.emojis ?? [];
    const isFormValid = pin.length >= 5 && name.trim().length >= 2;

    return (
      <div className="flex min-h-dvh flex-col bg-gradient-to-br from-emerald-50 via-white to-teal-50 px-5 sm:px-8 py-3 sm:py-10 overflow-y-auto">
        <div className="w-full max-w-md mx-auto flex flex-col gap-3 sm:gap-8 flex-1">
          {/* Header */}
          <div className="flex items-center gap-3 sm:flex-col sm:text-center">
            <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-12 h-12 sm:w-32 sm:h-32 object-contain shrink-0" />
            <p className="text-xs sm:text-base text-slate-500 leading-snug">
              {t("joinInstruction")}
            </p>
          </div>

          {/* Game PIN */}
          <div>
            <label htmlFor="pin-input" className="block text-sm font-semibold text-slate-700 mb-1.5">
              {t("pinLabel")}
            </label>
            <input
              id="pin-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoFocus
              placeholder={t("pinPlaceholder")}
              value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 8)); setError(null); }}
              className="h-11 sm:h-16 w-full bg-white border-2 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl text-center text-xl sm:text-3xl font-bold tracking-[0.25em] px-4 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all"
            />
          </div>

          {/* Nickname */}
          <div>
            <label htmlFor="name-input" className="block text-sm font-semibold text-slate-700 mb-1.5">
              {t("yourName")}
            </label>
            <input
              id="name-input"
              type="text"
              maxLength={24}
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              className="h-10 sm:h-14 w-full bg-white border-2 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl text-center text-base sm:text-xl font-semibold px-4 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100 transition-all"
            />
          </div>

          {/* Avatar selector */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-slate-700">
                {t("chooseAvatar")}
              </p>
              <button
                type="button"
                onClick={() => setAvatar(randomEmoji(emojiCategories.flatMap((c) => c.emojis)))}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                title="Avatar casuale"
              >
                <span className="text-sm">🎲</span> {t("random")}
              </button>
            </div>

            {/* Selected avatar preview */}
            <div className="flex justify-center mb-2 sm:mb-3">
              <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center text-3xl sm:text-5xl overflow-hidden">
                <AvatarDisplay avatar={avatar} className={isCustomAvatar(avatar) ? "w-10 h-10 sm:w-18 sm:h-18" : ""} />
              </div>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1.5 mb-2.5">
              {emojiCategories.map((cat, i) => (
                <button
                  key={cat.name}
                  onClick={() => setAvatarCategory(i)}
                  className={`flex-1 px-1 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                    avatarCategory === i
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Emoji grid */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2 max-h-28 sm:max-h-48 overflow-y-auto p-1.5 sm:p-2 bg-white rounded-xl border border-slate-200">
              {currentEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setAvatar(emoji)}
                  aria-label={`Avatar ${emoji}`}
                  className={`p-2 rounded-xl cursor-pointer transition-all flex items-center justify-center ${
                    isCustomAvatar(emoji) ? "w-full aspect-square" : "text-2xl sm:text-3xl"
                  } ${
                    avatar === emoji
                      ? "bg-emerald-100 ring-2 ring-emerald-500 scale-110 shadow-sm"
                      : "hover:bg-slate-50 hover:shadow-sm"
                  }`}
                >
                  {isCustomAvatar(emoji) ? (
                    <img src={withBasePath(emoji)} alt="avatar" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                  ) : (
                    emoji
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Spacer to push button down */}
          <div className="flex-1" />

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <span className="text-red-500 text-lg shrink-0">!</span>
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

          {/* Join button */}
          <button
            onClick={handleJoin}
            disabled={!connected || !isFormValid}
            className={`w-full font-bold text-base sm:text-xl rounded-xl py-3 sm:py-5 transition-all ${
              !connected || !isFormValid
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:shadow-xl active:scale-[0.98]"
            }`}
          >
            Entra nel quiz
          </button>

          {/* Connection status */}
          {!connected && (
            <p className="text-center text-sm text-slate-400 animate-pulse pb-2">Connessione in corso...</p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "kicked") {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-slate-800/60 border border-slate-700 rounded-2xl p-8">
          <div className="flex justify-center mb-5">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
              <UserX className="w-9 h-9 text-amber-400" />
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">{t("kickedTitle")}</h1>
          <p className="text-slate-300 mb-6">{t("kickedSubtitle")}</p>
          <button
            type="button"
            onClick={() => {
              sessionStorage.removeItem("savint-session");
              window.location.href = withBasePath("/");
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {t("kickedBackHome")}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- leave button ---------- */
  const leaveButton = (dark = true) => (
    <button
      onClick={handleLeave}
      className={`absolute top-3 right-3 z-10 rounded-full backdrop-blur-sm px-3 py-1.5 text-xs font-bold transition-colors ${
        dark
          ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
          : "bg-black/5 text-emerald-700/60 hover:bg-black/10 hover:text-emerald-800"
      }`}
    >
      {t("leave")}
    </button>
  );

  /* ---------- Reconnection banner ---------- */
  const reconnectionBanner = reconnecting ? (
    <div className="fixed top-0 inset-x-0 z-50 bg-amber-500 text-amber-950 text-center text-sm font-semibold py-2 px-4 animate-pulse">
      {t("reconnecting")}
    </div>
  ) : null;

  /* ---------- PIN badge (shown on all in-game screens) ---------- */
  const pinBadge = (dark = true) => pin ? (
    <div className={`absolute top-3 left-3 z-10 rounded-full backdrop-blur-sm px-3 py-1 text-xs font-bold select-none ${
      dark ? "bg-black/20 text-white/80" : "bg-black/10 text-emerald-800/70"
    }`}>
      PIN: {pin}
    </div>
  ) : null;

  if (phase === "countdown") {
    return <PlayerCountdownScreen onComplete={() => setPhase("question")} />;
  }

  if (phase === "waiting") {
    return (
      <div className="relative flex min-h-dvh flex-col items-center justify-center bg-emerald-100 p-6 text-center" style={{ backgroundImage: "url('/pattern-school.svg')", backgroundSize: "200px 200px" }}>
        {reconnectionBanner}
        {pinBadge(false)}
        {leaveButton(false)}
        <div className="mb-4 sm:mb-6 animate-float-bounce">
          <AvatarDisplay avatar={avatar} className={isCustomAvatar(avatar) ? "w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40" : "text-6xl sm:text-8xl lg:text-9xl"} />
        </div>
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-800 mb-2">{name}</h2>
        <p className="text-base sm:text-lg lg:text-xl text-emerald-600">
          {t("waitingForStart")}
        </p>
      </div>
    );
  }

  if (phase === "question" && questionData) {
    return (
      <div className="relative flex min-h-dvh flex-col bg-gray-950 p-3 sm:p-4 lg:p-6 text-white">
        {reconnectionBanner}
        {pinBadge()}
        {leaveButton()}
        {/* Header */}
        <div className="mb-1 sm:mb-2 flex items-center justify-between">
          <span className="text-xs sm:text-sm lg:text-base font-medium text-gray-400">
            {t("questionCounter", { index: questionData.questionIndex + 1, total: questionData.totalQuestions })}
          </span>
          <span
            className={`rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-base sm:text-lg lg:text-xl font-bold tabular-nums ${
              timeLeft <= 5 && timeLeft > 0
                ? "bg-red-500 text-white animate-countdown-pulse"
                : "bg-gray-800 text-white"
            }`}
          >
            {timeLeft}s
          </span>
        </div>

        {/* Progress bar timer */}
        {questionData.question.timeLimit > 0 && (
          <div className="mb-3 sm:mb-4 h-2 sm:h-2.5 rounded-full bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-linear ${
                timeLeft <= 5 && timeLeft > 0
                  ? "bg-red-500"
                  : timeLeft <= 10 && timeLeft > 0
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
              style={{ width: `${(timeLeft / questionData.question.timeLimit) * 100}%` }}
            />
          </div>
        )}

        {/* Question text */}
        <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl lg:text-3xl font-bold text-white text-center animate-slide-up-fade">
          {questionData.question.text}
        </h2>

        {/* Answer area */}
        {submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="mb-3 sm:mb-4">
              <AvatarDisplay avatar={avatar} className={isCustomAvatar(avatar) ? "w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24" : "text-4xl sm:text-5xl lg:text-6xl"} />
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-400">
              {t("answerSubmitted")}
            </p>
            <p className="mt-2 text-sm sm:text-base lg:text-lg text-gray-400">{t("waitingResults")}</p>
          </div>
        ) : timeLeft <= 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <span className="text-5xl sm:text-6xl mb-4">&#9203;</span>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-red-400">
              {t("timeUp")}
            </p>
            <p className="mt-2 text-sm sm:text-base lg:text-lg text-gray-400">{t("waitingResults")}</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <AnswerInput
              type={questionData.question.type}
              options={questionData.question.options}
              onSubmit={handleSubmit}
            />
          </div>
        )}
      </div>
    );
  }

  if (phase === "feedback" && feedback) {
    if (awaitingConfidence) {
      return (
        <div className="relative flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-indigo-500 to-purple-700 p-6 text-center">
          {reconnectionBanner}
          {pinBadge()}
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-6">
            {t("confidenceQuestion")}
          </h2>
          <div className="space-y-3 w-full max-w-xs">
            {[
              { level: 1, label: t("notSure"), color: "from-slate-500 to-slate-600" },
              { level: 2, label: t("somewhatSure"), color: "from-amber-500 to-yellow-600" },
              { level: 3, label: t("verySure"), color: "from-green-500 to-emerald-600" },
            ].map(({ level, label, color }) => (
              <button
                key={level}
                onClick={() => {
                  socket?.emit("submitConfidence", { confidenceLevel: level });
                  setConfidenceRevealing(true);
                  setTimeout(() => {
                    setConfidenceRevealing(false);
                    setAwaitingConfidence(false);
                  }, 1500);
                }}
                className={`w-full py-4 rounded-2xl bg-gradient-to-r ${color} text-white font-bold text-lg shadow-lg hover:scale-105 active:scale-95 transition-all`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (confidenceRevealing) {
      const isCorrect = feedback.isCorrect;
      return (
        <div className={`relative flex min-h-dvh flex-col items-center justify-center p-6 text-center transition-all duration-500 ${
          isCorrect
            ? "bg-gradient-to-b from-emerald-400 to-green-600"
            : "bg-gradient-to-b from-red-400 to-rose-600"
        }`}>
          {isCorrect && <Confetti />}
          <div className={`text-8xl sm:text-9xl lg:text-[12rem] animate-zoom-in-bounce ${isCorrect ? "" : "animate-shake"}`}>
            {isCorrect ? "🎉" : "😬"}
          </div>
          <h2 className="mt-4 text-3xl sm:text-4xl lg:text-5xl font-black text-white animate-slide-up-fade">
            {isCorrect ? t("correct") : t("wrong")}
          </h2>
        </div>
      );
    }

    const isCorrect = feedback.isCorrect;

    return (
      <div
        className={`relative flex min-h-dvh flex-col p-4 sm:p-6 ${
          isCorrect
            ? "bg-gradient-to-b from-emerald-400 to-green-600"
            : "bg-gradient-to-b from-red-400 to-rose-600"
        }`}
      >
        {reconnectionBanner}
        {pinBadge()}
        {isCorrect && <Confetti />}

        <div className={`flex flex-1 flex-col items-center justify-center gap-4 sm:gap-5 text-center ${isCorrect ? "" : "animate-shake"}`}>
          {/* Question text reminder */}
          {questionData && (
            <div className="w-full max-w-lg bg-black/20 backdrop-blur-sm rounded-2xl px-4 py-3 sm:px-6 sm:py-4 animate-slide-up-fade">
              <p className="text-xs sm:text-sm text-white/60 mb-1">{t("questionWas")}</p>
              <p className="text-base sm:text-lg lg:text-xl font-semibold text-white leading-snug">
                {questionData.question.text}
              </p>
            </div>
          )}

          {/* Result icon + label */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`text-5xl sm:text-7xl lg:text-8xl animate-zoom-in-bounce ${isCorrect ? "animate-pulse-glow rounded-full" : ""}`}>
              {isCorrect ? "\u2713" : "\u2717"}
            </div>
            <div className="text-left">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">
                {isCorrect ? t("correct") : t("wrong")}
              </h2>
              <p className="text-lg sm:text-xl lg:text-2xl font-semibold text-white/90 animate-count-up-pop" style={{ animationDelay: "200ms" }}>
                +{feedback.score} {t("pointsLabel")}
              </p>
            </div>
          </div>

          {/* Total score */}
          <div className="w-full max-w-sm animate-slide-up-fade" style={{ animationDelay: "300ms" }}>
            <div className="bg-white/15 backdrop-blur-sm rounded-xl px-4 py-3 text-center">
              <p className="text-2xl sm:text-3xl font-black text-white">{feedback.totalScore.toLocaleString()}</p>
              <p className="text-xs sm:text-sm text-white/70">{t("totalScoreLabel")}</p>
            </div>
          </div>

          {/* Class correct % */}
          <p className="text-sm sm:text-base text-white/60 animate-slide-up-fade" style={{ animationDelay: "400ms" }}>
            {t("classCorrect", { percent: feedback.classCorrectPercent })}
          </p>

          {/* Player stats (shown when host reveals results) */}
          {playerStats && (
            <div className="w-full max-w-sm animate-slide-up-fade" style={{ animationDelay: "100ms" }}>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2 text-center">
                  <p className="text-xl sm:text-2xl font-black text-white">{playerStats.position}&deg;</p>
                  <p className="text-xs text-white/70">{t("positionLabel")}</p>
                </div>
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2 text-center">
                  <p className="text-xl sm:text-2xl font-black text-white">{(playerStats.responseTimeMs / 1000).toFixed(1)}s</p>
                  <p className="text-xs text-white/70">{t("responseTimeLabel")}</p>
                </div>
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2 text-center">
                  <p className="text-xl sm:text-2xl font-black text-white">{playerStats.correctCount}/{playerStats.totalAnswered}</p>
                  <p className="text-xs text-white/70">{t("correctCountLabel")}</p>
                </div>
                <div className="bg-white/15 backdrop-blur-sm rounded-xl px-3 py-2 text-center">
                  <p className="text-xl sm:text-2xl font-black text-white">{playerStats.streak}</p>
                  <p className="text-xs text-white/70">{t("streakLabel")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Avatar small */}
          <div className="animate-slide-up-fade" style={{ animationDelay: playerStats ? "200ms" : "500ms" }}>
            <AvatarDisplay avatar={avatar} className={isCustomAvatar(avatar) ? "w-10 h-10 sm:w-12 sm:h-12" : "text-2xl sm:text-3xl"} />
          </div>
        </div>
      </div>
    );
  }

  if (phase === "podium" && podium) {
    const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    // Check if the current player is on the podium
    const myPodiumEntry = podium.podium.find((p) => p.playerName === name);
    const myPosition = myPodiumEntry
      ? myPodiumEntry.position
      : podium.fullResults.findIndex((p) => p.playerName === name) + 1;

    const handlePlayAgain = () => {
      setPhase("join");
      setPin("");
      setQuestionData(null);
      setFeedback(null);
      setPodium(null);
      setSubmitted(false);
      setAwaitingConfidence(false);
      setConfidenceRevealing(false);
      sessionStorage.removeItem("savint-session");
    };

    return (
      <div className="flex min-h-dvh flex-col items-center bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 p-4 sm:p-6 lg:p-8 pt-8 sm:pt-12">
        {myPodiumEntry && <Confetti />}
        <h2 className="mb-4 sm:mb-6 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">{t("podium")}</h2>

        {/* Personal result banner */}
        {myPodiumEntry ? (
          <div className="mb-6 sm:mb-8 text-center animate-zoom-in-bounce">
            <span className="text-6xl sm:text-7xl lg:text-8xl block mb-2">{medals[myPodiumEntry.position - 1]}</span>
            <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white">
              {t("youFinished", { position: myPodiumEntry.position })}
            </p>
          </div>
        ) : myPosition > 0 ? (
          <div className="mb-6 sm:mb-8 text-center animate-slide-up-fade">
            <p className="text-lg sm:text-xl lg:text-2xl font-bold text-white/90">
              {t("youFinished", { position: myPosition })}
            </p>
          </div>
        ) : null}

        {/* Top 3 */}
        <div className="mb-6 sm:mb-8 w-full max-w-sm md:max-w-lg space-y-2 sm:space-y-3 lg:space-y-4">
          {podium.podium.map((p, i) => {
            const isMe = p.playerName === name;
            return (
              <div
                key={p.position}
                className={`flex items-center gap-2 sm:gap-3 lg:gap-4 backdrop-blur-md rounded-2xl p-3 sm:p-4 lg:p-5 animate-podium-rise ${
                  isMe ? "bg-white/30 ring-2 ring-white" : "bg-white/15"
                }`}
                style={{ animationDelay: `${i * 300}ms` }}
              >
                <span className="text-2xl sm:text-3xl lg:text-4xl">{medals[p.position - 1]}</span>
                <AvatarDisplay avatar={p.playerAvatar ?? avatar} className={isCustomAvatar(p.playerAvatar ?? avatar) ? "w-10 h-10 sm:w-14 sm:h-14 lg:w-16 lg:h-16" : "text-3xl sm:text-5xl lg:text-6xl"} />
                <div className="flex-1 min-w-0">
                  <span className={`text-base sm:text-lg lg:text-xl font-bold text-white block truncate ${isMe ? "underline" : ""}`}>
                    {p.playerName}
                  </span>
                </div>
                <span className="text-base sm:text-lg lg:text-xl font-semibold text-white/90">
                  {p.score} pt
                </span>
              </div>
            );
          })}
        </div>

        {/* Full list (4+) */}
        {podium.fullResults.length > 3 && (
          <div className="w-full max-w-sm space-y-2 mb-6">
            {podium.fullResults.slice(3).map((p, i) => {
              const isMe = p.playerName === name;
              return (
                <div
                  key={p.playerName}
                  className={`flex items-center gap-2 sm:gap-3 lg:gap-4 rounded-xl p-2.5 sm:p-3 lg:p-4 ${
                    isMe ? "bg-white/25 ring-2 ring-white" : "bg-white/10"
                  }`}
                >
                  <span className="w-7 sm:w-8 text-center text-sm sm:text-base lg:text-lg font-bold text-white/70">
                    {i + 4}
                  </span>
                  <AvatarDisplay avatar={p.playerAvatar ?? avatar} className={isCustomAvatar(p.playerAvatar ?? avatar) ? "w-7 h-7 sm:w-8 sm:h-8 lg:w-10 lg:h-10" : "text-xl sm:text-2xl lg:text-3xl"} />
                  <span className={`flex-1 text-sm sm:text-base lg:text-lg font-medium text-white/90 truncate ${isMe ? "underline font-bold" : ""}`}>
                    {p.playerName}
                  </span>
                  <span className="text-xs sm:text-sm lg:text-base text-white/70">{p.score} pt</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Play again button */}
        <button
          onClick={handlePlayAgain}
          className="w-full max-w-sm mt-auto mb-4 py-4 rounded-2xl bg-white text-gray-900 font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
        >
          {t("playAgain")}
        </button>
      </div>
    );
  }

  return null;
}

/* ================================================================== */
/*  Answer Input components                                            */
/* ================================================================== */

function AnswerInput({
  type,
  options,
  onSubmit,
}: {
  type: QuestionType;
  options: QuestionOptions;
  onSubmit: (value: AnswerValue) => void;
}) {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return (
        <MultipleChoiceInput
          options={options as MultipleChoiceOptions}
          onSubmit={onSubmit}
        />
      );
    case "TRUE_FALSE":
      return <TrueFalseInput onSubmit={onSubmit} />;
    case "OPEN_ANSWER":
      return <OpenAnswerInput onSubmit={onSubmit} />;
    case "ORDERING":
      return (
        <OrderingInput
          options={options as OrderingOptions}
          onSubmit={onSubmit}
        />
      );
    case "MATCHING":
      return (
        <MatchingInput
          options={options as MatchingOptions}
          onSubmit={onSubmit}
        />
      );
    case "SPOT_ERROR":
      return <SpotErrorInput options={options as any} onSubmit={onSubmit} />;
    case "NUMERIC_ESTIMATION":
      return <NumericEstimationInput options={options as any} onSubmit={onSubmit} />;
    case "IMAGE_HOTSPOT":
      return <ImageHotspotInput options={options as any} onSubmit={onSubmit} />;
    case "CODE_COMPLETION":
      return <CodeCompletionInput options={options as any} onSubmit={onSubmit} />;
    default:
      return null;
  }
}

/* ---------- MULTIPLE_CHOICE ---------- */

const MC_GRADIENTS = [
  "bg-gradient-to-br from-red-500 to-red-600",
  "bg-gradient-to-br from-blue-500 to-blue-600",
  "bg-gradient-to-br from-yellow-500 to-yellow-600",
  "bg-gradient-to-br from-green-500 to-green-600",
];

function MultipleChoiceInput({
  options,
  onSubmit,
}: {
  options: MultipleChoiceOptions;
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const [selected, setSelected] = useState<number[]>([]);
  const correctCount = (options as any).correctCount ?? options.choices.filter((c) => c.isCorrect).length;
  const isMulti = correctCount > 1;

  const toggle = (i: number) => {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      {isMulti && (
        <p className="text-center text-sm text-gray-400">{t("selectMultiple")}</p>
      )}
      <div className="grid flex-1 grid-cols-2 gap-3">
        {options.choices.map((c, i) => {
          const isSelected = selected.includes(i);
          return (
            <button
              key={i}
              onClick={() => isMulti ? toggle(i) : onSubmit({ selected: [i] })}
              className={`flex items-center justify-center rounded-2xl min-h-16 sm:min-h-20 lg:min-h-24 p-2 sm:p-3 lg:p-4 text-white font-bold text-base sm:text-lg lg:text-xl shadow-lg transition-all ${
                MC_GRADIENTS[i % MC_GRADIENTS.length]
              } ${isMulti && isSelected ? "ring-4 ring-white scale-105" : ""} ${isMulti && !isSelected ? "opacity-80 hover:opacity-100" : "hover:scale-105 active:scale-95"}`}
            >
              {isMulti && isSelected && <span className="mr-2">✓</span>}
              {c.text}
            </button>
          );
        })}
      </div>
      {isMulti && selected.length > 0 && (
        <button
          onClick={() => onSubmit({ selected })}
          className="w-full py-4 rounded-2xl bg-white text-gray-900 font-bold text-lg shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
        >
          {t("confirmAnswer")}
        </button>
      )}
    </div>
  );
}

/* ---------- TRUE_FALSE ---------- */

function TrueFalseInput({
  onSubmit,
}: {
  onSubmit: (value: AnswerValue) => void;
}) {
  const tc = useTranslations("common");
  return (
    <div className="flex flex-1 gap-4">
      <button
        onClick={() => onSubmit({ selected: true })}
        className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 py-6 sm:py-8 lg:py-10 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
      >
        {tc("true")}
      </button>
      <button
        onClick={() => onSubmit({ selected: false })}
        className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 py-6 sm:py-8 lg:py-10 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
      >
        {tc("false")}
      </button>
    </div>
  );
}

/* ---------- OPEN_ANSWER ---------- */

function OpenAnswerInput({
  onSubmit,
}: {
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const [text, setText] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && text.trim()) {
      e.preventDefault();
      onSubmit({ text });
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-end gap-4">
      <input
        type="text"
        enterKeyHint="send"
        placeholder={t("openAnswerPlaceholder")}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-14 w-full bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl px-4 text-lg placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
      />
      <button
        onClick={() => onSubmit({ text })}
        disabled={!text.trim()}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
      >
        {tc("submit")}
      </button>
    </div>
  );
}

/* ---------- ORDERING ---------- */

function OrderingInput({
  options,
  onSubmit,
}: {
  options: OrderingOptions;
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const [order, setOrder] = useState<number[]>(() =>
    options.items.map((_, i) => i),
  );
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const moveItem = (from: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  };

  const handleTap = (pos: number) => {
    if (activeIdx === null) {
      // First tap: select the item to move
      setActiveIdx(pos);
    } else if (activeIdx === pos) {
      // Tap same item: deselect
      setActiveIdx(null);
    } else {
      // Second tap: move the selected item to this position
      moveItem(activeIdx, pos);
      setActiveIdx(null);
    }
  };

  return (
    <>
      <p className="text-center text-sm text-white/60 mb-2">
        {activeIdx !== null ? t("orderingTapTarget") : t("orderingInstruction")}
      </p>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {order.map((itemIdx, pos) => {
          const isActive = activeIdx === pos;
          return (
            <div
              key={itemIdx}
              onClick={() => handleTap(pos)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3.5 transition-all select-none cursor-pointer ${
                isActive
                  ? "bg-indigo-500/40 ring-2 ring-indigo-400 scale-[1.03] shadow-lg shadow-indigo-500/20"
                  : activeIdx !== null
                    ? "bg-white/10 hover:bg-white/20 ring-1 ring-dashed ring-white/20"
                    : "bg-white/10 hover:bg-white/15 active:scale-[0.98]"
              }`}
            >
              {/* Position number */}
              <span className={`w-8 h-8 rounded-full text-sm font-bold flex items-center justify-center shrink-0 transition-colors ${
                isActive
                  ? "bg-indigo-500 text-white"
                  : "bg-white/20 text-white/80"
              }`}>
                {pos + 1}
              </span>
              {/* Item text */}
              <span className="flex-1 text-base sm:text-lg font-medium">
                {options.items[itemIdx]}
              </span>
              {/* Arrow buttons */}
              <div className="flex flex-col gap-0.5 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); moveItem(pos, pos - 1); setActiveIdx(null); }}
                  disabled={pos === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold disabled:opacity-20 active:bg-white/30 transition-colors"
                  aria-label={t("moveUp")}
                >
                  ▲
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); moveItem(pos, pos + 1); setActiveIdx(null); }}
                  disabled={pos === order.length - 1}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-sm font-bold disabled:opacity-20 active:bg-white/30 transition-colors"
                  aria-label={t("moveDown")}
                >
                  ▼
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => onSubmit({ order, orderedTexts: order.map((i) => options.items[i]) })}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95"
      >
        {tc("confirm")}
      </button>
    </>
  );
}

/* ---------- MATCHING ---------- */

function MatchingInput({
  options,
  onSubmit,
}: {
  options: MatchingOptions;
  onSubmit: (value: AnswerValue) => void;
}) {
  const tc = useTranslations("common");
  const [matches, setMatches] = useState<[number, number][]>([]);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

  const leftItems = options.pairs.map((p) => p.left);
  // Right items are already shuffled by the server in sanitizeOptions
  const rightItems = options.pairs.map((p) => p.right);

  const usedLeft = new Set(matches.map(([l]) => l));
  const usedRight = new Set(matches.map(([, r]) => r));

  const handleLeftTap = (i: number) => {
    if (usedLeft.has(i)) {
      // remove the match that uses this left item
      setMatches((prev) => prev.filter(([l]) => l !== i));
      return;
    }
    setSelectedLeft(i);
  };

  const handleRightTap = (i: number) => {
    if (selectedLeft === null) return;
    if (usedRight.has(i)) {
      // remove old match on this right item
      setMatches((prev) => prev.filter(([, r]) => r !== i));
    }
    setMatches((prev) => [...prev.filter(([l]) => l !== selectedLeft), [selectedLeft, i]]);
    setSelectedLeft(null);
  };

  return (
    <>
      <div className="flex flex-1 gap-3 overflow-y-auto">
        {/* Left column */}
        <div className="flex flex-1 flex-col gap-2">
          {leftItems.map((item, i) => (
            <button
              key={i}
              onClick={() => handleLeftTap(i)}
              className={`rounded-xl px-3 py-3 text-left text-base font-medium transition backdrop-blur-md ${
                selectedLeft === i
                  ? "bg-blue-600 text-white ring-2 ring-white"
                  : usedLeft.has(i)
                    ? "bg-green-700 text-white"
                    : "bg-white/10 text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {/* Right column */}
        <div className="flex flex-1 flex-col gap-2">
          {rightItems.map((item, i) => (
            <button
              key={i}
              onClick={() => handleRightTap(i)}
              className={`rounded-xl px-3 py-3 text-left text-base font-medium transition backdrop-blur-md ${
                usedRight.has(i)
                  ? "bg-green-700 text-white"
                  : "bg-white/10 text-white"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Connection indicators */}
      {matches.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {matches.map(([l, r]) => (
            <span
              key={`${l}-${r}`}
              className="rounded bg-green-800/60 px-2 py-1 text-xs text-green-200"
            >
              {leftItems[l]} &rarr; {rightItems[r]}
            </span>
          ))}
        </div>
      )}

      <button
        onClick={() => onSubmit({
          matches,
          matchedPairs: matches.map(([l, r]) => ({
            left: leftItems[l],
            right: rightItems[r],
          })),
        })}
        disabled={matches.length === 0}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        {tc("confirm")}
      </button>
    </>
  );
}

/* ---------- SPOT_ERROR ---------- */

function SpotErrorInput({
  options,
  onSubmit,
}: {
  options: { lines: string[] };
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <>
      <div className="flex-1 space-y-1.5 overflow-y-auto">
        {options.lines.map((line, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
              selected.has(i)
                ? "bg-red-600 text-white ring-2 ring-red-400"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <span className="text-sm font-bold text-white/60 w-6 text-center shrink-0">{i + 1}</span>
            <span className="font-mono text-base">{line}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => onSubmit({ selected: [...selected] })}
        disabled={selected.size === 0}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        {t("confirmCount", { count: selected.size, suffix: selected.size === 1 ? "a" : "e" })}
      </button>
    </>
  );
}

/* ---------- NUMERIC_ESTIMATION ---------- */

function NumericEstimationInput({
  options,
  onSubmit,
}: {
  options: { unit?: string };
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const [val, setVal] = useState("");

  const canSubmit = val !== "" && !isNaN(Number(val));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && canSubmit) {
      e.preventDefault();
      onSubmit({ value: Number(val) });
    }
  };

  return (
    <div className="flex flex-1 flex-col justify-end gap-4">
      <div className="flex items-center gap-3">
        <input
          type="number"
          inputMode="decimal"
          enterKeyHint="send"
          placeholder={t("estimatePlaceholder")}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={handleKeyDown}
          className="h-16 flex-1 bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl px-4 text-2xl font-bold text-center placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
        />
        {options.unit && (
          <span className="text-xl font-semibold text-white/70">{options.unit}</span>
        )}
      </div>
      <button
        onClick={() => onSubmit({ value: Number(val) })}
        disabled={!canSubmit}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
      >
        {tc("submit")}
      </button>
    </div>
  );
}

/* ---------- IMAGE_HOTSPOT ---------- */

function ImageHotspotInput({
  options,
  onSubmit,
}: {
  options: { imageUrl: string };
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const [tap, setTap] = useState<{ x: number; y: number } | null>(null);

  const handleTap = (e: React.MouseEvent<HTMLImageElement> | React.TouchEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    setTap({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 });
  };

  return (
    <>
      <div className="flex-1 flex flex-col items-center justify-center">
        <p className="text-sm text-gray-400 mb-3">{t("tapCorrectPoint")}</p>
        <div className="relative inline-block max-w-full">
          <img
            src={options.imageUrl.startsWith("/") ? withBasePath(options.imageUrl) : options.imageUrl}
            alt="Domanda"
            className="max-h-64 sm:max-h-80 max-w-full rounded-xl"
            onClick={handleTap}
            onTouchStart={handleTap}
          />
          {tap && (
            <div
              className="absolute w-6 h-6 -ml-3 -mt-3 bg-red-500 rounded-full border-2 border-white shadow-lg pointer-events-none animate-score-pop"
              style={{ left: `${tap.x * 100}%`, top: `${tap.y * 100}%` }}
            />
          )}
        </div>
      </div>
      <button
        onClick={() => tap && onSubmit({ x: tap.x, y: tap.y })}
        disabled={!tap}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        {tc("confirm")}
      </button>
    </>
  );
}

/* ---------- CODE_COMPLETION ---------- */

function CodeCompletionInput({
  options,
  onSubmit,
}: {
  options: { codeLines: string[]; blankLineIndex: number; mode: "choice" | "text"; choices?: string[] };
  onSubmit: (value: AnswerValue) => void;
}) {
  const t = useTranslations("live");
  const tc = useTranslations("common");
  const [text, setText] = useState("");

  return (
    <div className="flex flex-1 flex-col">
      {/* Code block */}
      <div className="bg-slate-800 rounded-xl p-3 mb-4 font-mono text-sm overflow-x-auto">
        {options.codeLines.map((line, i) => (
          <div key={i} className="flex gap-2">
            <span className="text-slate-500 w-6 text-right shrink-0">{i + 1}</span>
            {i === options.blankLineIndex ? (
              <span className="text-amber-400 font-bold">{"??? ←"}</span>
            ) : (
              <span className="text-green-300">{line}</span>
            )}
          </div>
        ))}
      </div>

      {options.mode === "choice" && options.choices ? (
        <div className="flex-1 space-y-2">
          {options.choices.map((choice, i) => (
            <button
              key={i}
              onClick={() => onSubmit({ selected: i })}
              className="w-full text-left bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-xl px-4 py-3 text-base font-mono text-white transition-all active:scale-95"
            >
              {choice}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col justify-end gap-3 flex-1">
          <input
            type="text"
            enterKeyHint="send"
            placeholder={t("writeCode")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { e.preventDefault(); onSubmit({ text }); } }}
            className="h-14 w-full bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl px-4 text-lg font-mono placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
          />
          <button
            onClick={() => onSubmit({ text })}
            disabled={!text.trim()}
            className="h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
          >
            {tc("submit")}
          </button>
        </div>
      )}
    </div>
  );
}
