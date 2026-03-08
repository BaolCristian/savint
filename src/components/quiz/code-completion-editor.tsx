"use client";

import { Trash2, Plus } from "lucide-react";

interface Props {
  options: {
    codeLines: string[];
    blankLineIndex: number;
    correctAnswer: string;
    mode: "choice" | "text";
    choices?: string[];
  };
  onChange: (opts: Props["options"]) => void;
}

export function CodeCompletionEditor({ options, onChange }: Props) {
  const { codeLines, blankLineIndex, correctAnswer, mode, choices } = options;

  const update = (partial: Partial<Props["options"]>) => {
    onChange({ ...options, ...partial });
  };

  const updateLine = (i: number, value: string) => {
    update({ codeLines: codeLines.map((l, idx) => (idx === i ? value : l)) });
  };

  const addLine = () => {
    update({ codeLines: [...codeLines, ""] });
  };

  const removeLine = (i: number) => {
    const nextLines = codeLines.filter((_, idx) => idx !== i);
    let nextBlank = blankLineIndex;
    if (i === blankLineIndex) nextBlank = Math.max(0, i - 1);
    else if (i < blankLineIndex) nextBlank = blankLineIndex - 1;
    update({ codeLines: nextLines, blankLineIndex: nextBlank });
  };

  const setMode = (newMode: "choice" | "text") => {
    if (newMode === "choice") {
      update({ mode: "choice", choices: [correctAnswer, "", ""] });
    } else {
      update({ mode: "text", choices: undefined });
    }
  };

  const updateChoice = (i: number, value: string) => {
    if (!choices) return;
    update({ choices: choices.map((c, idx) => (idx === i ? value : c)) });
  };

  const addChoice = () => {
    if (!choices || choices.length >= 6) return;
    update({ choices: [...choices, ""] });
  };

  const removeChoice = (i: number) => {
    if (!choices || choices.length <= 2) return;
    update({ choices: choices.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      {/* Code block */}
      <div className="bg-slate-900 rounded-xl p-4 space-y-1">
        {codeLines.map((line, i) => {
          const isBlank = i === blankLineIndex;
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => update({ blankLineIndex: i })}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
                  isBlank
                    ? "bg-amber-500 text-white"
                    : "bg-slate-700 text-slate-400 hover:bg-amber-700 hover:text-amber-200"
                }`}
              >
                {i + 1}
              </button>
              <input
                value={line}
                onChange={(e) => updateLine(i, e.target.value)}
                placeholder={isBlank ? "← riga da completare" : `Riga ${i + 1}`}
                className={`flex-1 font-mono rounded-lg border px-3 py-2 text-base placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  isBlank
                    ? "bg-amber-950 border-amber-700 text-amber-200"
                    : "bg-slate-800 border-slate-700 text-slate-200"
                }`}
              />
              {codeLines.length > 2 && (
                <button
                  onClick={() => removeLine(i)}
                  className="text-slate-500 hover:text-red-400 p-1 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={addLine}
        className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
      >
        <Plus className="size-5" /> Aggiungi riga
      </button>

      {/* Correct answer */}
      <div>
        <label className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 block">
          Risposta corretta
        </label>
        <input
          value={correctAnswer}
          onChange={(e) => update({ correctAnswer: e.target.value })}
          placeholder="Codice corretto per la riga vuota..."
          className="w-full font-mono rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode("choice")}
          className={`px-4 py-2 rounded-xl text-base font-semibold transition-all border ${
            mode === "choice"
              ? "bg-indigo-100 dark:bg-indigo-900 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300"
              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-indigo-300"
          }`}
        >
          Scelta multipla
        </button>
        <button
          type="button"
          onClick={() => setMode("text")}
          className={`px-4 py-2 rounded-xl text-base font-semibold transition-all border ${
            mode === "text"
              ? "bg-indigo-100 dark:bg-indigo-900 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300"
              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-indigo-300"
          }`}
        >
          Testo libero
        </button>
      </div>

      {/* Choices (only in choice mode) */}
      {mode === "choice" && choices && (
        <div className="space-y-2">
          {choices.map((choice, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full shrink-0 ${
                  choice === correctAnswer && choice !== ""
                    ? "bg-emerald-500"
                    : "bg-slate-300 dark:bg-slate-600"
                }`}
              />
              <input
                value={choice}
                onChange={(e) => updateChoice(i, e.target.value)}
                placeholder={`Scelta ${i + 1}`}
                className="flex-1 font-mono rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
              {choices.length > 2 && (
                <button
                  onClick={() => removeChoice(i)}
                  className="text-slate-400 hover:text-red-500 p-1 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
          {choices.length < 6 && (
            <button
              onClick={addChoice}
              className="flex items-center gap-2 text-lg font-semibold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 px-3 py-2 rounded-lg transition-colors"
            >
              <Plus className="size-5" /> Aggiungi scelta
            </button>
          )}
        </div>
      )}
    </div>
  );
}
