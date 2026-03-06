"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "@/lib/socket/client";
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
  podium: { playerName: string; score: number; position: number }[];
  fullResults: { playerName: string; score: number }[];
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
    socket.emit("joinSession", { pin, playerName: name.trim() });
  };

  /* ---------- render phases ---------- */

  if (phase === "join") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-6">
        <h1 className="mb-8 text-4xl font-extrabold text-white">Kahoot!</h1>

        <div className="w-full max-w-sm space-y-4">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="PIN del gioco"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-14 w-full rounded-lg bg-white px-4 text-center text-2xl font-bold tracking-widest text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-white/40"
          />
          <input
            type="text"
            maxLength={30}
            placeholder="Il tuo nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-14 w-full rounded-lg bg-white px-4 text-center text-xl font-semibold text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-4 focus:ring-white/40"
          />

          {error && (
            <p className="rounded-lg bg-red-500/90 px-4 py-2 text-center text-sm font-medium text-white">
              {error}
            </p>
          )}

          <button
            onClick={handleJoin}
            disabled={!connected}
            className="h-14 w-full rounded-lg bg-white text-xl font-bold text-blue-700 transition active:scale-95 disabled:opacity-50"
          >
            Entra
          </button>
        </div>

        {!connected && (
          <p className="mt-4 text-sm text-white/70">Connessione in corso...</p>
        )}
      </div>
    );
  }

  if (phase === "waiting") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-6 text-center">
        <div className="mb-6 text-6xl">&#10004;</div>
        <h2 className="mb-2 text-3xl font-extrabold text-white">Sei dentro!</h2>
        <p className="mb-4 text-xl font-semibold text-white/90">{name}</p>
        <p className="text-lg text-white/70">
          In attesa che il prof avvii il quiz...
        </p>
      </div>
    );
  }

  if (phase === "question" && questionData) {
    return (
      <div className="flex min-h-dvh flex-col bg-gray-900 p-4 text-white">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-400">
            Domanda {questionData.questionIndex + 1}/{questionData.totalQuestions}
          </span>
          <span
            className={`rounded-full px-4 py-1 text-lg font-bold ${
              timeLeft <= 5 ? "bg-red-600 animate-pulse" : "bg-gray-700"
            }`}
          >
            {timeLeft}s
          </span>
        </div>

        {/* Question text */}
        <h2 className="mb-6 text-center text-xl font-bold leading-snug">
          {questionData.question.text}
        </h2>

        {/* Answer area */}
        {submitted ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <p className="text-2xl font-bold text-green-400">
              Risposta inviata!
            </p>
            <p className="mt-2 text-gray-400">In attesa dei risultati...</p>
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
    return (
      <div
        className={`flex min-h-dvh flex-col items-center justify-center p-6 text-center ${
          feedback.isCorrect
            ? "bg-gradient-to-b from-green-500 to-green-700"
            : "bg-gradient-to-b from-red-500 to-red-700"
        }`}
      >
        <div className="mb-4 text-7xl">
          {feedback.isCorrect ? "\u2713" : "\u2717"}
        </div>
        <h2 className="mb-2 text-3xl font-extrabold text-white">
          {feedback.isCorrect ? "Corretto!" : "Sbagliato!"}
        </h2>
        <p className="mb-1 text-xl font-semibold text-white/90">
          +{feedback.score} punti
        </p>
        <p className="text-lg text-white/80">
          Posizione: {feedback.position}
        </p>
        <p className="mt-1 text-lg text-white/80">
          Punteggio totale: {feedback.totalScore}
        </p>
      </div>
    );
  }

  if (phase === "podium" && podium) {
    const medals = ["\uD83E\uDD47", "\uD83E\uDD48", "\uD83E\uDD49"];
    return (
      <div className="flex min-h-dvh flex-col items-center bg-gradient-to-b from-yellow-500 to-orange-600 p-6 pt-12">
        <h2 className="mb-8 text-3xl font-extrabold text-white">Classifica</h2>

        {/* Top 3 */}
        <div className="mb-8 w-full max-w-sm space-y-3">
          {podium.podium.map((p) => (
            <div
              key={p.position}
              className="flex items-center gap-3 rounded-xl bg-white/20 px-4 py-3 backdrop-blur"
            >
              <span className="text-3xl">{medals[p.position - 1]}</span>
              <span className="flex-1 text-lg font-bold text-white">
                {p.playerName}
              </span>
              <span className="text-lg font-semibold text-white/90">
                {p.score} pt
              </span>
            </div>
          ))}
        </div>

        {/* Full list */}
        {podium.fullResults.length > 3 && (
          <div className="w-full max-w-sm space-y-2">
            {podium.fullResults.slice(3).map((p, i) => (
              <div
                key={p.playerName}
                className="flex items-center gap-3 rounded-lg bg-white/10 px-4 py-2"
              >
                <span className="w-8 text-center font-bold text-white/70">
                  {i + 4}
                </span>
                <span className="flex-1 font-medium text-white/90">
                  {p.playerName}
                </span>
                <span className="text-sm text-white/70">{p.score} pt</span>
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

const MC_COLORS = [
  "bg-red-600 active:bg-red-700",
  "bg-blue-600 active:bg-blue-700",
  "bg-yellow-500 active:bg-yellow-600",
  "bg-green-600 active:bg-green-700",
];

function MultipleChoiceInput({
  options,
  onSubmit,
}: {
  options: MultipleChoiceOptions;
  onSubmit: (value: AnswerValue) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (i: number) => {
    setSelected((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
    );
  };

  return (
    <>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {options.choices.map((c, i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`flex min-h-[5rem] items-center justify-center rounded-xl p-3 text-lg font-bold text-white transition ${
              MC_COLORS[i % MC_COLORS.length]
            } ${selected.includes(i) ? "ring-4 ring-white" : "opacity-80"}`}
          >
            {c.text}
          </button>
        ))}
      </div>
      <button
        onClick={() => onSubmit({ selected })}
        disabled={selected.length === 0}
        className="mt-4 h-14 w-full rounded-lg bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        Conferma
      </button>
    </>
  );
}

/* ---------- TRUE_FALSE ---------- */

function TrueFalseInput({
  onSubmit,
}: {
  onSubmit: (value: AnswerValue) => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      <button
        onClick={() => onSubmit({ selected: true })}
        className="flex flex-1 items-center justify-center rounded-xl bg-green-600 text-3xl font-extrabold text-white transition active:scale-95 active:bg-green-700"
      >
        Vero
      </button>
      <button
        onClick={() => onSubmit({ selected: false })}
        className="flex flex-1 items-center justify-center rounded-xl bg-red-600 text-3xl font-extrabold text-white transition active:scale-95 active:bg-red-700"
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
        className="h-14 w-full rounded-lg bg-gray-800 px-4 text-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-blue-500/50"
      />
      <button
        onClick={() => onSubmit({ text })}
        disabled={!text.trim()}
        className="h-14 w-full rounded-lg bg-blue-600 text-xl font-bold text-white transition active:scale-95 disabled:opacity-40"
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
            className="flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-3"
          >
            <span className="flex-1 text-lg font-medium">
              {options.items[itemIdx]}
            </span>
            <button
              onClick={() => swap(pos, pos - 1)}
              disabled={pos === 0}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-700 text-xl font-bold disabled:opacity-30"
              aria-label="Sposta su"
            >
              &#9650;
            </button>
            <button
              onClick={() => swap(pos, pos + 1)}
              disabled={pos === order.length - 1}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-700 text-xl font-bold disabled:opacity-30"
              aria-label="Sposta giu"
            >
              &#9660;
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => onSubmit({ order })}
        className="mt-4 h-14 w-full rounded-lg bg-white text-xl font-bold text-gray-900 transition active:scale-95"
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
              className={`rounded-lg px-3 py-3 text-left text-base font-medium transition ${
                selectedLeft === i
                  ? "bg-blue-600 text-white ring-2 ring-white"
                  : usedLeft.has(i)
                    ? "bg-green-700 text-white"
                    : "bg-gray-800 text-white"
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
              className={`rounded-lg px-3 py-3 text-left text-base font-medium transition ${
                usedRight.has(origIdx)
                  ? "bg-green-700 text-white"
                  : "bg-gray-800 text-white"
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
        className="mt-4 h-14 w-full rounded-lg bg-white text-xl font-bold text-gray-900 transition active:scale-95 disabled:opacity-40"
      >
        Conferma
      </button>
    </>
  );
}
