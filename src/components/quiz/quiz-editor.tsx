"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuizInput, QuestionInput } from "@/lib/validators/quiz";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { QuestionEditor } from "@/components/quiz/question-editor";
import { Plus, Save, Loader2 } from "lucide-react";
import { ShareDialog } from "@/components/quiz/share-dialog";

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

  const handleQuestionChange = (index: number, question: QuestionInput) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? question : q)));
  };

  const handleQuestionRemove = (index: number) => {
    if (questions.length <= 1) return;
    setQuestions((prev) =>
      prev.filter((_, i) => i !== index).map((q, i) => ({ ...q, order: i })),
    );
  };

  const handleAddQuestion = () => {
    setQuestions((prev) => [...prev, createDefaultQuestion(prev.length)]);
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {initialData?.id ? "Modifica Quiz" : "Nuovo Quiz"}
        </h1>
        {initialData?.id && <ShareDialog quizId={initialData.id} />}
      </div>

      {/* Quiz metadata */}
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Titolo</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titolo del quiz"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Descrizione</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descrizione opzionale..."
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tag (separati da virgola)</label>
          <Input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="matematica, geometria, ..."
          />
        </div>
      </div>

      {/* Questions */}
      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            question={q}
            index={i}
            onChange={handleQuestionChange}
            onRemove={handleQuestionRemove}
          />
        ))}
      </div>

      <Button variant="outline" onClick={handleAddQuestion} className="w-full">
        <Plus className="size-4 mr-2" /> Aggiungi domanda
      </Button>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
        {saving ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" /> Salvataggio...
          </>
        ) : (
          <>
            <Save className="size-4 mr-2" /> Salva quiz
          </>
        )}
      </Button>
    </div>
  );
}
