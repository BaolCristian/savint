"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { QuizInput, QuestionInput } from "@/lib/validators/quiz";
import { QuestionEditor } from "@/components/quiz/question-editor";
import { ShareDialog } from "@/components/quiz/share-dialog";
import { Save, Loader2, Plus, ArrowLeft, GripVertical, PanelRightOpen, PanelRightClose } from "lucide-react";

interface Props {
  initialData?: QuizInput & { id?: string };
}

function createDefaultQuestion(order: number): QuestionInput {
  return {
    type: "MULTIPLE_CHOICE",
    text: "",
    timeLimit: 20,
    points: 1000,
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
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [tagsText, setTagsText] = useState(initialData?.tags?.join(", ") ?? "");
  const [questions, setQuestions] = useState<QuestionInput[]>(
    initialData?.questions?.length
      ? initialData.questions
      : [createDefaultQuestion(0)],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeQuestion, setActiveQuestion] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

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

  // Drag & drop state
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
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
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

  const handleSave = async () => {
    setError(null);
    setSaving(true);

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
      const isEdit = !!initialData?.id;
      const url = isEdit ? `/api/quiz/${initialData!.id}` : "/api/quiz";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(
          body.error?.formErrors?.[0] ??
            body.error?.fieldErrors
              ? "Verifica i campi e riprova."
              : "Errore durante il salvataggio.",
        );
      }

      router.push("/dashboard/quiz");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* ── Top bar ── */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 md:px-6 py-3 flex items-center gap-4 shrink-0 shadow-sm z-10">
        <Link
          href="/dashboard/quiz"
          className="flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors text-base font-medium"
        >
          <ArrowLeft className="size-5" />
          <span className="hidden sm:inline">Quiz</span>
        </Link>

        <div className="h-6 w-px bg-slate-200" />

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titolo del quiz..."
          className="flex-1 text-xl font-bold text-slate-900 dark:text-white bg-transparent border-none outline-none placeholder:text-slate-400"
        />

        <div className="flex items-center gap-2">
          {initialData?.id && <ShareDialog quizId={initialData.id} />}

          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title={sidebarOpen ? "Nascondi pannello" : "Mostra pannello"}
          >
            {sidebarOpen ? <PanelRightClose className="size-5" /> : <PanelRightOpen className="size-5" />}
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-semibold px-5 py-2 rounded-full transition-all shadow-sm hover:shadow-md active:scale-[0.97]"
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            <span className="hidden sm:inline">{saving ? "Salvataggio..." : "Salva"}</span>
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: active question editor ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Quiz metadata (collapsed section at top) */}
          <details className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
            <summary className="px-6 lg:px-10 py-3 cursor-pointer text-base font-semibold text-slate-500 hover:text-slate-700 select-none">
              Impostazioni quiz (descrizione, tag)
            </summary>
            <div className="px-6 lg:px-10 pb-5 grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Descrizione</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descrizione opzionale..."
                  rows={2}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                />
              </div>
              <div>
                <label className="text-base font-semibold text-slate-700 dark:text-slate-300 mb-1.5 block">Tag (separati da virgola)</label>
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="matematica, geometria, ..."
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-3 text-lg text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
          </details>

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
            <div className="mx-6 lg:mx-10 mb-6 rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-base text-red-700 font-medium">
              {error}
            </div>
          )}
        </main>

        {/* ── Right: question thumbnails (drag & drop) — collapsible ── */}
        <aside className={`hidden lg:flex bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 flex-col shrink-0 overflow-hidden transition-all duration-300 ${
          sidebarOpen ? "w-56 xl:w-64" : "w-0 border-l-0"
        }`}>
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 min-w-[14rem]">
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Domande</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-w-[14rem]">
            {questions.map((q, i) => {
              const typeInfo = THUMB_TYPES[q.type] ?? { icon: "?", label: "?", color: "bg-slate-100 border-slate-300" };
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
                  className={`group relative rounded-xl border-2 p-2.5 text-left transition-all cursor-grab active:cursor-grabbing select-none ${
                    isDragging
                      ? "opacity-40 scale-95 border-indigo-400"
                      : isDragOver
                        ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200"
                        : isActive
                          ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-100"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-sm"
                  }`}
                >
                  {/* Drag handle + number */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <GripVertical className="size-3.5 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                    <div className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      isActive ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600"
                    }`}>
                      {i + 1}
                    </div>
                    <div className={`rounded-md ${typeInfo.color} px-1.5 py-0.5 flex items-center gap-1 ml-auto`}>
                      <span className="text-xs">{typeInfo.icon}</span>
                      <span className="text-[9px] font-bold text-slate-600 uppercase">{typeInfo.label}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 leading-snug font-medium min-h-[2rem] pl-5">
                    {q.text || "Domanda vuota..."}
                  </p>

                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 pl-5">
                    <span>{q.timeLimit}s</span>
                    <span>·</span>
                    <span>{q.points}pt</span>
                  </div>

                  {/* Drop indicator line */}
                  {isDragOver && (
                    <div className="absolute -top-1.5 left-2 right-2 h-0.5 bg-indigo-500 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Add question */}
          <div className="p-3 border-t border-slate-100 dark:border-slate-700 min-w-[14rem]">
            <button
              onClick={handleAddQuestion}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 transition-all text-sm font-semibold"
            >
              <Plus className="size-4" />
              Aggiungi
            </button>
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

const THUMB_TYPES: Record<string, { icon: string; label: string; color: string }> = {
  MULTIPLE_CHOICE: { icon: "🔘", label: "Scelta", color: "bg-blue-50 border border-blue-200" },
  TRUE_FALSE: { icon: "✅", label: "V/F", color: "bg-emerald-50 border border-emerald-200" },
  OPEN_ANSWER: { icon: "✏️", label: "Aperta", color: "bg-amber-50 border border-amber-200" },
  ORDERING: { icon: "🔢", label: "Ordina", color: "bg-purple-50 border border-purple-200" },
  MATCHING: { icon: "🔗", label: "Abbina", color: "bg-rose-50 border border-rose-200" },
};
