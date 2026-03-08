"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "@/lib/socket/client";
import { EMOJI_CATEGORIES, randomEmoji } from "@/lib/emoji-avatars";
import type {
  AnswerValue,
  MatchingOptions,
  MultipleChoiceOptions,
  OpenAnswerOptions,
  OrderingOptions,
  QuestionOptions,
} from "@/types";
import type { QuestionType } from "@prisma/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Phase = "join" | "waiting" | "question" | "feedback" | "podium";

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
  position: number;
  classCorrectPercent: number;
}

interface PodiumData {
  podium: { playerName: string; score: number; position: number; playerAvatar?: string }[];
  fullResults: { playerName: string; score: number; playerAvatar?: string }[];
}

/* ------------------------------------------------------------------ */
/*  Confetti                                                           */
/* ------------------------------------------------------------------ */

function Confetti() {
  const colors = ["#E8E8E8", "#D4D4D4", "#C0C0C0", "#F5F5DC", "#D2B48C", "#C4B59D", "#A9A9A9", "#BFBFBF"];
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 0.5}s`,
    color: colors[i % colors.length],
    size: 6 + Math.random() * 8,
  }));
  return (
    <div className="confetti-container">
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti-piece"
          style={{
            left: p.left,
            animationDelay: p.delay,
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  PlayerView                                                         */
/* ------------------------------------------------------------------ */

export function PlayerView() {
  const { socket, connected } = useSocket();

  const [phase, setPhase] = useState<Phase>("join");
  const [pin, setPin] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [questionData, setQuestionData] = useState<QuestionData | null>(null);
  const [feedback, setFeedback] = useState<FeedbackData | null>(null);
  const [podium, setPodium] = useState<PodiumData | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const [avatar, setAvatar] = useState("");

  // Pick a random emoji only on the client to avoid hydration mismatch
  useEffect(() => {
    setAvatar((prev) => prev || randomEmoji());
  }, []);
  const [avatarCategory, setAvatarCategory] = useState(0);

  const questionStartTime = useRef<number>(0);

  /* ---------- socket listeners ---------- */

  useEffect(() => {
    if (!socket) return;

    const onSessionError = (data: { message: string }) => {
      setError(data.message);
    };

    const onPlayerJoined = (data: { playerName: string }) => {
      if (data.playerName === name) {
        setPhase("waiting");
        setError(null);
      }
    };

    const onQuestionStart = (data: QuestionData) => {
      setQuestionData(data);
      setTimeLeft(data.question.timeLimit);
      setSubmitted(false);
      questionStartTime.current = Date.now();
      setPhase("question");
    };

    const onAnswerFeedback = (data: FeedbackData) => {
      setFeedback(data);
      setPhase("feedback");
    };

    const onGameOver = (data: PodiumData) => {
      setPodium(data);
      setPhase("podium");
    };

    socket.on("sessionError", onSessionError);
    socket.on("playerJoined", onPlayerJoined);
    socket.on("questionStart", onQuestionStart);
    socket.on("answerFeedback", onAnswerFeedback);
    socket.on("gameOver", onGameOver);

    return () => {
      socket.off("sessionError", onSessionError);
      socket.off("playerJoined", onPlayerJoined);
      socket.off("questionStart", onQuestionStart);
      socket.off("answerFeedback", onAnswerFeedback);
      socket.off("gameOver", onGameOver);
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
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => clearInterval(id);
  }, [phase, questionData, timeLeft]);

  /* ---------- vibrate on wrong answer ---------- */

  useEffect(() => {
    if (phase === "feedback" && feedback && !feedback.isCorrect) {
      navigator.vibrate?.(200);
    }
  }, [phase, feedback]);

  /* ---------- submit handler ---------- */

  const handleSubmit = useCallback(
    (value: AnswerValue) => {
      if (!socket || submitted) return;
      const responseTimeMs = Date.now() - questionStartTime.current;
      socket.emit("submitAnswer", { value, responseTimeMs });
      setSubmitted(true);
    },
    [socket, submitted],
  );

  /* ---------- join handler ---------- */

  const handleJoin = () => {
    if (!socket || !connected) return;
    if (pin.length !== 6) {
      setError("Il PIN deve essere di 6 cifre");
      return;
    }
    if (!name.trim()) {
      setError("Inserisci il tuo nome");
      return;
    }
    setError(null);
    socket.emit("joinSession", { pin, playerName: name.trim(), playerAvatar: avatar });
  };

  /* ---------- render phases ---------- */

  if (phase === "join") {
    const currentEmojis = EMOJI_CATEGORIES[avatarCategory]?.emojis ?? [];
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-emerald-100 p-4 sm:p-6" style={{ backgroundImage: "url('/pattern-school.svg')", backgroundSize: "200px 200px" }}>
        <h1 className="mb-4 sm:mb-8 text-3xl sm:text-5xl lg:text-6xl font-extrabold text-emerald-800 drop-shadow-sm">Quiz Live</h1>

        <div className="w-full max-w-sm md:max-w-md space-y-3 sm:space-y-4 lg:space-y-5">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="PIN del gioco"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-12 sm:h-14 lg:h-16 w-full bg-white border border-emerald-200 text-emerald-900 placeholder:text-emerald-400 rounded-2xl text-center text-xl sm:text-2xl lg:text-3xl font-bold tracking-widest px-4 focus:outline-none focus:ring-4 focus:ring-emerald-300"
          />
          <input
            type="text"
            maxLength={30}
            placeholder="Il tuo nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-12 sm:h-14 lg:h-16 w-full bg-white border border-emerald-200 text-emerald-900 placeholder:text-emerald-400 rounded-2xl text-center text-lg sm:text-xl lg:text-2xl font-semibold px-4 focus:outline-none focus:ring-4 focus:ring-emerald-300"
          />

          {/* Emoji picker */}
          <div className="flex flex-col items-center">
            <div className="text-4xl sm:text-6xl lg:text-7xl mb-2 sm:mb-3">{avatar}</div>

            {/* Category tabs */}
            <div className="flex gap-1.5 sm:gap-2 lg:gap-3 mb-2 sm:mb-3">
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  onClick={() => setAvatarCategory(i)}
                  className={`px-2 sm:px-3 lg:px-4 py-1 lg:py-1.5 rounded-lg text-xs sm:text-sm lg:text-base font-medium transition ${
                    avatarCategory === i
                      ? "bg-emerald-600 text-white"
                      : "bg-white text-emerald-700"
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Emoji grid */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2 lg:gap-3 max-h-36 sm:max-h-48 lg:max-h-56 overflow-y-auto p-1.5 sm:p-2">
              {currentEmojis.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => setAvatar(emoji)}
                  className={`text-2xl sm:text-3xl lg:text-4xl p-1 lg:p-2 rounded-xl cursor-pointer hover:bg-emerald-200 transition-all ${
                    avatar === emoji ? "ring-2 ring-emerald-500 bg-emerald-200 scale-110" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-500/90 px-4 py-2 text-center text-sm lg:text-base font-medium text-white">
              {error}
            </p>
          )}

          <button
            onClick={handleJoin}
            disabled={!connected}
            className="w-full bg-emerald-600 text-white font-bold text-base sm:text-lg lg:text-xl rounded-2xl py-3 sm:py-4 lg:py-5 shadow-lg shadow-emerald-300 hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
          >
            Entra
          </button>
        </div>

        {!connected && (
          <p className="mt-4 text-sm text-emerald-500">Connessione in corso...</p>
        )}
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-emerald-100 p-6 text-center" style={{ backgroundImage: "url('/pattern-school.svg')", backgroundSize: "200px 200px" }}>
        <div className="text-6xl sm:text-8xl lg:text-9xl mb-4 sm:mb-6 animate-float-bounce">{avatar}</div>
        <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-emerald-800 mb-2">{name}</h2>
        <p className="text-base sm:text-lg lg:text-xl text-emerald-600">
          In attesa che il prof avvii il quiz...
        </p>
      </div>
    );
  }

  if (phase === "question" && questionData) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-950 p-3 sm:p-4 lg:p-6 text-white">
        {/* Header */}
        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <span className="text-xs sm:text-sm lg:text-base font-medium text-gray-400">
            Domanda {questionData.questionIndex + 1}/{questionData.totalQuestions}
          </span>
          <span
            className={`rounded-full px-3 sm:px-4 py-1 sm:py-1.5 text-base sm:text-lg lg:text-xl font-bold ${
              timeLeft <= 5 && timeLeft > 0
                ? "bg-red-500 text-white animate-countdown-pulse"
                : "bg-gray-800 text-white"
            }`}
          >
            {timeLeft}s
          </span>
        </div>

        {/* Question text */}
        <h2 className="mb-4 sm:mb-6 text-lg sm:text-xl lg:text-3xl font-bold text-white text-center animate-slide-up-fade">
          {questionData.question.text}
        </h2>

        {/* Answer area */}
        {submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="text-4xl sm:text-5xl lg:text-6xl mb-3 sm:mb-4">{avatar}</div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-bold text-green-400">
              Risposta inviata!
            </p>
            <p className="mt-2 text-sm sm:text-base lg:text-lg text-gray-400">In attesa dei risultati...</p>
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
    const isCorrect = feedback.isCorrect;
    const content = (
      <div className="flex flex-col items-center">
        {isCorrect && <Confetti />}
        <div className="text-6xl sm:text-8xl lg:text-9xl mb-3 sm:mb-4 animate-score-pop">
          {isCorrect ? "\u2713" : "\u2717"}
        </div>
        <div className="text-4xl sm:text-5xl lg:text-7xl mb-3 sm:mb-4">{avatar}</div>
        <h2 className="mb-2 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">
          {isCorrect ? "Corretto!" : "Sbagliato!"}
        </h2>
        <p className="mb-1 text-lg sm:text-xl lg:text-2xl font-semibold text-white/90 animate-count-up-pop" style={{ animationDelay: "200ms" }}>
          +{feedback.score} punti
        </p>
        <p className="text-base sm:text-lg lg:text-xl text-white/80 animate-slide-up-fade" style={{ animationDelay: "300ms" }}>
          Posizione: {feedback.position}
        </p>
        <p className="mt-1 text-base sm:text-lg lg:text-xl text-white/80 animate-slide-up-fade" style={{ animationDelay: "400ms" }}>
          Punteggio totale: {feedback.totalScore}
        </p>
        <p className="mt-1 text-xs sm:text-sm lg:text-base text-white/60 animate-slide-up-fade" style={{ animationDelay: "500ms" }}>
          Classe: {feedback.classCorrectPercent}% corretto
        </p>
      </div>
    );

    return (
      <div
        className={`flex min-h-dvh flex-col items-center justify-center p-6 text-center ${
          isCorrect
            ? "bg-gradient-to-b from-emerald-400 to-green-600"
            : "bg-gradient-to-b from-red-400 to-rose-600"
        }`}
      >
        {isCorrect ? content : <div className="animate-shake">{content}</div>}
      </div>
    );
  }

  if (phase === "podium" && podium) {
    const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    return (
      <div className="flex min-h-dvh flex-col items-center bg-gradient-to-br from-amber-400 via-orange-500 to-pink-500 p-4 sm:p-6 lg:p-8 pt-8 sm:pt-12">
        <h2 className="mb-6 sm:mb-8 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white">Classifica</h2>

        {/* Top 3 */}
        <div className="mb-6 sm:mb-8 w-full max-w-sm md:max-w-lg space-y-2 sm:space-y-3 lg:space-y-4">
          {podium.podium.map((p, i) => (
            <div
              key={p.position}
              className="flex items-center gap-2 sm:gap-3 lg:gap-4 bg-white/15 backdrop-blur-md rounded-2xl p-3 sm:p-4 lg:p-5 animate-podium-rise"
              style={{ animationDelay: `${i * 300}ms` }}
            >
              <span className="text-2xl sm:text-3xl lg:text-4xl">{medals[p.position - 1]}</span>
              <span className="text-3xl sm:text-5xl lg:text-6xl">{p.playerAvatar ?? avatar}</span>
              <div className="flex-1 min-w-0">
                <span className="text-base sm:text-lg lg:text-xl font-bold text-white block truncate">
                  {p.playerName}
                </span>
              </div>
              <span className="text-base sm:text-lg lg:text-xl font-semibold text-white/90">
                {p.score} pt
              </span>
            </div>
          ))}
        </div>

        {/* Full list (4+) */}
        {podium.fullResults.length > 3 && (
          <div className="w-full max-w-sm space-y-2">
            {podium.fullResults.slice(3).map((p, i) => (
              <div
                key={p.playerName}
                className="flex items-center gap-2 sm:gap-3 lg:gap-4 bg-white/10 rounded-xl p-2.5 sm:p-3 lg:p-4"
              >
                <span className="w-7 sm:w-8 text-center text-sm sm:text-base lg:text-lg font-bold text-white/70">
                  {i + 4}
                </span>
                <span className="text-xl sm:text-2xl lg:text-3xl">{p.playerAvatar ?? avatar}</span>
                <span className="flex-1 text-sm sm:text-base lg:text-lg font-medium text-white/90 truncate">
                  {p.playerName}
                </span>
                <span className="text-xs sm:text-sm lg:text-base text-white/70">{p.score} pt</span>
              </div>
            ))}
          </div>
        )}
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
  return (
    <div className="grid flex-1 grid-cols-2 gap-3">
      {options.choices.map((c, i) => (
        <button
          key={i}
          onClick={() => onSubmit({ selected: [i] })}
          className={`flex items-center justify-center rounded-2xl min-h-16 sm:min-h-20 lg:min-h-24 p-2 sm:p-3 lg:p-4 text-white font-bold text-base sm:text-lg lg:text-xl shadow-lg hover:scale-105 active:scale-95 transition-all ${
            MC_GRADIENTS[i % MC_GRADIENTS.length]
          }`}
        >
          {c.text}
        </button>
      ))}
    </div>
  );
}

/* ---------- TRUE_FALSE ---------- */

function TrueFalseInput({
  onSubmit,
}: {
  onSubmit: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-1 gap-4">
      <button
        onClick={() => onSubmit({ selected: true })}
        className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 py-6 sm:py-8 lg:py-10 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
      >
        Vero
      </button>
      <button
        onClick={() => onSubmit({ selected: false })}
        className="flex flex-1 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 py-6 sm:py-8 lg:py-10 text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white shadow-lg hover:scale-105 active:scale-95 transition-all"
      >
        Falso
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
  const [text, setText] = useState("");

  return (
    <div className="flex flex-1 flex-col justify-end gap-4">
      <input
        type="text"
        placeholder="La tua risposta..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="h-14 w-full bg-white/10 backdrop-blur text-white border border-white/20 rounded-2xl px-4 text-lg placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-purple-500/50"
      />
      <button
        onClick={() => onSubmit({ text })}
        disabled={!text.trim()}
        className="h-14 w-full rounded-2xl bg-gradient-to-r from-purple-600 to-purple-700 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
      >
        Invia
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
  const [order, setOrder] = useState<number[]>(() =>
    options.items.map((_, i) => i),
  );

  const swap = (a: number, b: number) => {
    if (b < 0 || b >= order.length) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  return (
    <>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {order.map((itemIdx, pos) => (
          <div
            key={itemIdx}
            className="flex items-center gap-2 bg-white/10 backdrop-blur-md rounded-xl px-4 py-3"
          >
            <span className="flex-1 text-lg font-medium">
              {options.items[itemIdx]}
            </span>
            <button
              onClick={() => swap(pos, pos - 1)}
              disabled={pos === 0}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xl font-bold disabled:opacity-30"
              aria-label="Sposta su"
            >
              &#9650;
            </button>
            <button
              onClick={() => swap(pos, pos + 1)}
              disabled={pos === order.length - 1}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10 text-xl font-bold disabled:opacity-30"
              aria-label="Sposta giu"
            >
              &#9660;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSubmit({ order })}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95"
      >
        Conferma
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
  const [matches, setMatches] = useState<[number, number][]>([]);
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

  const leftItems = options.pairs.map((p) => p.left);
  const rightItems = options.pairs.map((p) => p.right);

  // Shuffle right side once using a stable ref
  const shuffledRight = useRef<number[]>([]);
  if (shuffledRight.current.length === 0) {
    shuffledRight.current = rightItems
      .map((_, i) => i)
      .sort(() => Math.random() - 0.5);
  }

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
          {shuffledRight.current.map((origIdx) => (
            <button
              key={origIdx}
              onClick={() => handleRightTap(origIdx)}
              className={`rounded-xl px-3 py-3 text-left text-base font-medium transition backdrop-blur-md ${
                usedRight.has(origIdx)
                  ? "bg-green-700 text-white"
                  : "bg-white/10 text-white"
              }`}
            >
              {rightItems[origIdx]}
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
        onClick={() => onSubmit({ matches })}
        disabled={matches.length === 0}
        className="mt-4 h-14 w-full rounded-2xl bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        Conferma
      </button>
    </>
  );
}
