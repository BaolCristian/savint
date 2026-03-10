"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuizInput, QuestionInput } from "@/lib/validators/quiz";
import { QuestionEditor } from "@/components/quiz/question-editor";
import { ShareDialog } from "@/components/quiz/share-dialog";
import { ExcelImportButton } from "@/components/quiz/excel-import-button";
import {
  Save,
  Loader2,
  Plus,
  ArrowLeft,
  GripVertical,
  PanelRightOpen,
  PanelRightClose,
  Copy,
  Trash2,
  Check,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileText,
  Tag,
  Shuffle,
} from "lucide-react";

interface Props {
  initialData?: QuizInput & { id?: string };
}

function createDefaultQuestion(order: number): QuestionInput {
  return {
    type: "MULTIPLE_CHOICE",
    text: "",
    timeLimit: 20,
    points: 1000,
    confidenceEnabled: false,
    mediaUrl: null,
    order,
    options: {
      choices: [
        { text: "", isCorrect: true },
        { text: "", isCorrect: false },
      ],
    },
  };
}

export function QuizEditor({ initialData }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(
    initialData?.description ?? "",
  );
  const [tagsText, setTagsText] = useState(
    initialData?.tags?.join(", ") ?? "",
  );
  const [questions, setQuestions] = useState<QuestionInput[]>(
    initialData?.questions?.length
      ? initialData.questions
      : [createDefaultQuestion(0)],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ---------- autosave ---------- */
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isEdit = !!initialData?.id;

  const doSave = useCallback(async () => {
    if (saving) return;
    setError(null);
    setSaving(true);
    setSaveStatus("saving");

    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const payload: QuizInput = {
      title,
      description: description || undefined,
      isPublic: initialData?.isPublic ?? false,
      tags,
      questions: questions.map((q, i) => ({ ...q, order: i })),
    };

    try {
      const url = isEdit ? `/api/quiz/${initialData!.id}` : "/api/quiz";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let body: any = null;
        try {
          body = await res.json();
        } catch {
          // not JSON
        }
        throw new Error(
          body?.error?.formErrors?.[0] ??
            body?.error?.fieldErrors
              ? "Verifica i campi e riprova."
              : `Errore durante il salvataggio (${res.status}).`,
        );
      }

      if (isEdit) {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
        router.refresh();
      } else {
        const created = await res.json();
        router.push(`/dashboard/quiz/${created.id}/edit`);
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto.";
      setError(msg);
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }, [
    saving,
    title,
    description,
    tagsText,
    questions,
    initialData,
    isEdit,
    router,
  ]);

  // Trigger autosave on changes (only for existing quizzes)
  const scheduleAutosave = useCallback(() => {
    if (!isEdit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      doSave();
    }, 2000);
  }, [isEdit, doSave]);

  // Track changes for autosave
  const prevDataRef = useRef<string>("");
  useEffect(() => {
    const snapshot = JSON.stringify({ title, description, tagsText, questions });
    if (prevDataRef.current && prevDataRef.current !== snapshot) {
      scheduleAutosave();
    }
    prevDataRef.current = snapshot;
  }, [title, description, tagsText, questions, scheduleAutosave]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  /* ---------- question handlers ---------- */

  const handleQuestionChange = (index: number, question: QuestionInput) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? question : q)));
  };

  const handleQuestionRemove = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i })),
    );
    if (activeQuestion >= index && activeQuestion > 0) {
      setActiveQuestion((a) => a - 1);
    }
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createDefaultQuestion(prev.length)]);
    setActiveQuestion(questions.length);
  };

  const handleShuffleQuestions = () => {
    setQuestions((prev) => {
      const shuffled = [...prev];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled.map((q, i) => ({ ...q, order: i }));
    });
    setActiveQuestion(0);
  };

  const handleDuplicateQuestion = (index: number) => {
    const source = questions[index];
    const copy: QuestionInput = {
      ...JSON.parse(JSON.stringify(source)),
      order: questions.length,
    };
    setQuestions((prev) => {
      const next = [...prev];
      next.splice(index + 1, 0, copy);
      return next.map((q, i) => ({ ...q, order: i }));
    });
    setActiveQuestion(index + 1);
  };

  /* ---------- drag & drop ---------- */

  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const handleDragStart = (index: number) => {
    dragItem.current = index;
    setDragIdx(index);
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
    setDragOverIdx(index);
  };

  const handleDragEnd = () => {
    if (
      dragItem.current !== null &&
      dragOverItem.current !== null &&
      dragItem.current !== dragOverItem.current
    ) {
      setQuestions((prev) => {
        const next = [...prev];
        const [removed] = next.splice(dragItem.current!, 1);
        next.splice(dragOverItem.current!, 0, removed);
        return next.map((q, i) => ({ ...q, order: i }));
      });
      setActiveQuestion(dragOverItem.current);
    }
    dragItem.current = null;
    dragOverItem.current = null;
    setDragIdx(null);
    setDragOverIdx(null);
  };

  /* ---------- save status indicator ---------- */

  const SaveStatusBadge = () => {
    if (saveStatus === "saving")
      return (
        <span className="flex items-center gap-1.5 text-xs text-slate-400">
          <Loader2 className="size-3 animate-spin" /> Salvataggio...
        </span>
      );
    if (saveStatus === "saved")
      return (
        <span className="flex items-center gap-1.5 text-xs text-emerald-600">
          <Check className="size-3" /> Salvato
        </span>
      );
    if (saveStatus === "error")
      return (
        <span className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="size-3" /> Errore
        </span>
      );
    return null;
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* ── Top bar ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 md:px-6 py-3 flex items-center gap-4 shrink-0 shadow-sm z-10">
        <Link
          href="/dashboard/quiz"
          className="flex items-center gap-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition-colors text-base font-medium"
        >
          <ArrowLeft className="size-5" />
          <span className="hidden sm:inline">Quiz</span>
        </Link>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titolo del quiz..."
          className="flex-1 text-xl font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none placeholder:text-slate-400"
        />

        <div className="flex items-center gap-2">
          <SaveStatusBadge />

          <ExcelImportButton
            quizId={initialData?.id}
            onImported={() => router.refresh()}
          />

          {initialData?.id && <ShareDialog quizId={initialData.id} />}

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={sidebarOpen ? "Nascondi pannello" : "Mostra pannello"}
          >
            {sidebarOpen ? (
              <PanelRightClose className="size-5" />
            ) : (
              <PanelRightOpen className="size-5" />
            )}
          </button>

          <button
            onClick={doSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold px-5 py-2 rounded-full transition-all shadow-sm hover:shadow-md active:scale-[0.97]"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            <span className="hidden sm:inline">
              {saving ? "Salvataggio..." : "Salva"}
            </span>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: active question editor ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Quiz settings — collapsible with clear separation */}
          <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setSettingsOpen(!settingsOpen)}
              className="w-full px-6 lg:px-10 py-3 flex items-center gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-2 flex-1">
                <FileText className="size-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                  Impostazioni quiz
                </span>
                {(description || tagsText) && (
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                )}
              </div>
              {settingsOpen ? (
                <ChevronUp className="size-4 text-slate-400" />
              ) : (
                <ChevronDown className="size-4 text-slate-400" />
              )}
            </button>

            {settingsOpen && (
              <div className="px-6 lg:px-10 pb-5 space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    <FileText className="size-3.5" />
                    Descrizione
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Descrizione opzionale del quiz..."
                    rows={2}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                    <Tag className="size-3.5" />
                    Tag (separati da virgola)
                  </label>
                  <input
                    value={tagsText}
                    onChange={(e) => setTagsText(e.target.value)}
                    placeholder="matematica, geometria, ..."
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Question editor */}
          {questions[activeQuestion] && (
            <QuestionEditor
              key={activeQuestion}
              question={questions[activeQuestion]}
              index={activeQuestion}
              total={questions.length}
              onChange={handleQuestionChange}
              onRemove={handleQuestionRemove}
            />
          )}

          {/* Error */}
          {error && (
            <div className="mx-6 lg:mx-10 mb-6 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950 dark:border-red-800 px-5 py-3 text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
              <AlertCircle className="size-4 shrink-0" />
              {error}
            </div>
          )}
        </main>

        {/* ── Right: question list (drag & drop) — collapsible ── */}
        <aside
          className={`hidden lg:flex bg-slate-800 dark:bg-slate-900 border-l border-slate-700 flex-col shrink-0 overflow-hidden transition-all duration-300 ${
            sidebarOpen ? "w-80 xl:w-96" : "w-0 border-l-0"
          }`}
        >
          <div className="px-4 py-3 border-b border-slate-700 min-w-[19rem]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-slate-300 uppercase tracking-wider">
                Domande
              </p>
              <span className="text-xs font-semibold text-slate-400 bg-slate-700 px-2 py-0.5 rounded-full">
                {questions.length}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-w-[19rem]">
            {questions.map((q, i) => {
              const typeInfo = THUMB_TYPES[q.type] ?? {
                icon: "?",
                label: "?",
                color: "bg-slate-100 border-slate-300",
              };
              const isActive = activeQuestion === i;
              const isDragging = dragIdx === i;
              const isDragOver = dragOverIdx === i && dragIdx !== i;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragEnter={() => handleDragEnter(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  onClick={() => setActiveQuestion(i)}
                  className={`group relative rounded-xl p-3 text-left transition-all cursor-grab active:cursor-grabbing select-none ${
                    isDragging
                      ? "opacity-40 scale-95 ring-2 ring-indigo-400"
                      : isDragOver
                        ? "bg-indigo-600/20 ring-2 ring-indigo-400"
                        : isActive
                          ? "bg-white dark:bg-slate-700 shadow-md ring-2 ring-indigo-500"
                          : "bg-slate-700/60 dark:bg-slate-800 hover:bg-slate-700 dark:hover:bg-slate-750 hover:shadow-sm"
                  }`}
                >
                  {/* Top row: number + type + actions */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <GripVertical className="size-3.5 text-slate-500 group-hover:text-slate-300 transition-colors shrink-0" />
                    <div
                      className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                        isActive
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-600 text-slate-300"
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div
                      className={`rounded-md ${typeInfo.color} px-1.5 py-0.5 flex items-center gap-1`}
                    >
                      <span className="text-xs">{typeInfo.icon}</span>
                      <span className="text-[10px] font-bold text-slate-600 uppercase">
                        {typeInfo.label}
                      </span>
                    </div>

                    {/* Quick actions (visible on hover) */}
                    <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDuplicateQuestion(i);
                        }}
                        className="p-1 rounded text-slate-400 hover:text-indigo-300 hover:bg-slate-600 transition-colors"
                        title="Duplica"
                      >
                        <Copy className="size-3.5" />
                      </button>
                      {questions.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuestionRemove(i);
                          }}
                          className="p-1 rounded text-slate-400 hover:text-red-400 hover:bg-slate-600 transition-colors"
                          title="Elimina"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preview text */}
                  <p className={`text-sm line-clamp-2 leading-snug font-medium min-h-[2.5rem] pl-6 ${
                    isActive ? "text-slate-800 dark:text-slate-200" : "text-slate-300"
                  }`}>
                    {q.text || (
                      <span className="text-slate-500 italic">
                        Domanda vuota...
                      </span>
                    )}
                  </p>

                  {/* Meta */}
                  <div className={`flex items-center gap-2 mt-1 text-[11px] pl-6 ${
                    isActive ? "text-slate-500 dark:text-slate-400" : "text-slate-500"
                  }`}>
                    <span>{q.timeLimit}s</span>
                    <span>·</span>
                    <span>{q.points}pt</span>
                  </div>

                  {/* Drop indicator line */}
                  {isDragOver && (
                    <div className="absolute -top-1 left-3 right-3 h-0.5 bg-indigo-400 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Add question + Shuffle */}
          <div className="p-3 border-t border-slate-700 min-w-[19rem] space-y-2">
            <button
              onClick={handleAddQuestion}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-slate-600 text-slate-400 hover:border-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-all text-sm font-semibold"
            >
              <Plus className="size-4" />
              Aggiungi domanda
            </button>
            {questions.length > 1 && (
              <button
                onClick={handleShuffleQuestions}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 transition-all text-sm font-semibold"
              >
                <Shuffle className="size-4" />
                Mescola domande
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* Mobile: bottom nav for questions */}
      <div className="lg:hidden flex items-center gap-2 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2 overflow-x-auto">
        {questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveQuestion(i)}
            className={`shrink-0 w-10 h-10 rounded-xl text-sm font-bold transition-all ${
              activeQuestion === i
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            {i + 1}
          </button>
        ))}
        <button
          onClick={handleAddQuestion}
          className="shrink-0 w-10 h-10 rounded-xl text-lg font-bold bg-slate-100 dark:bg-slate-800 text-indigo-600 hover:bg-indigo-50 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}

const THUMB_TYPES: Record<
  string,
  { icon: string; label: string; color: string }
> = {
  MULTIPLE_CHOICE: {
    icon: "🔘",
    label: "Scelta",
    color: "bg-blue-50 border border-blue-200",
  },
  TRUE_FALSE: {
    icon: "✅",
    label: "V/F",
    color: "bg-emerald-50 border border-emerald-200",
  },
  OPEN_ANSWER: {
    icon: "✏️",
    label: "Aperta",
    color: "bg-amber-50 border border-amber-200",
  },
  ORDERING: {
    icon: "🔢",
    label: "Ordina",
    color: "bg-purple-50 border border-purple-200",
  },
  MATCHING: {
    icon: "🔗",
    label: "Abbina",
    color: "bg-rose-50 border border-rose-200",
  },
  SPOT_ERROR: {
    icon: "🔍",
    label: "Errore",
    color: "bg-red-50 border border-red-200",
  },
  NUMERIC_ESTIMATION: {
    icon: "🔢",
    label: "Stima",
    color: "bg-cyan-50 border border-cyan-200",
  },
  IMAGE_HOTSPOT: {
    icon: "🎯",
    label: "Hotspot",
    color: "bg-orange-50 border border-orange-200",
  },
  CODE_COMPLETION: {
    icon: "💻",
    label: "Codice",
    color: "bg-indigo-50 border border-indigo-200",
  },
};
