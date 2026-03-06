"use client";

import { type QuestionInput } from "@/lib/validators/quiz";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus, GripVertical } from "lucide-react";

interface Props {
  question: QuestionInput;
  index: number;
  onChange: (index: number, question: QuestionInput) => void;
  onRemove: (index: number) => void;
}

const QUESTION_TYPES = [
  { value: "MULTIPLE_CHOICE", label: "Scelta multipla" },
  { value: "TRUE_FALSE", label: "Vero / Falso" },
  { value: "OPEN_ANSWER", label: "Risposta aperta" },
  { value: "ORDERING", label: "Ordinamento" },
  { value: "MATCHING", label: "Abbinamento" },
] as const;

type QuestionType = QuestionInput["type"];

function defaultOptionsForType(type: QuestionType): QuestionInput["options"] {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return {
        choices: [
          { text: "", isCorrect: true },
          { text: "", isCorrect: false },
        ],
      };
    case "TRUE_FALSE":
      return { correct: true };
    case "OPEN_ANSWER":
      return { acceptedAnswers: [""] };
    case "ORDERING":
      return { items: ["", ""], correctOrder: [0, 1] };
    case "MATCHING":
      return { pairs: [{ left: "", right: "" }, { left: "", right: "" }] };
  }
}

function update(question: QuestionInput, partial: Partial<QuestionInput>): QuestionInput {
  return { ...question, ...partial };
}

export function QuestionEditor({ question, index, onChange, onRemove }: Props) {
  const handleFieldChange = (field: keyof QuestionInput, value: unknown) => {
    onChange(index, update(question, { [field]: value }));
  };

  const handleTypeChange = (newType: QuestionType) => {
    onChange(index, {
      ...question,
      type: newType,
      options: defaultOptionsForType(newType),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <GripVertical className="size-4 text-muted-foreground" />
          Domanda {index + 1}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={() => onRemove(index)}>
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Type selector */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Tipo</label>
          <Select value={question.type} onValueChange={(val) => handleTypeChange(val as QuestionType)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUESTION_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Question text */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Testo della domanda</label>
          <Textarea
            value={question.text}
            onChange={(e) => handleFieldChange("text", e.target.value)}
            placeholder="Scrivi la domanda..."
            rows={2}
          />
        </div>

        {/* Time limit & points */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tempo limite (s)</label>
            <Input
              type="number"
              min={5}
              max={120}
              value={question.timeLimit}
              onChange={(e) => handleFieldChange("timeLimit", Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Punti</label>
            <Input
              type="number"
              min={100}
              max={2000}
              step={100}
              value={question.points}
              onChange={(e) => handleFieldChange("points", Number(e.target.value))}
            />
          </div>
        </div>

        {/* Media URL */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">URL media (opzionale)</label>
          <Input
            type="url"
            value={question.mediaUrl ?? ""}
            onChange={(e) =>
              handleFieldChange("mediaUrl", e.target.value || null)
            }
            placeholder="https://..."
          />
        </div>

        {/* Options editor per type */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Opzioni</label>
          {question.type === "MULTIPLE_CHOICE" && (
            <MultipleChoiceEditor
              options={question.options as { choices: { text: string; isCorrect: boolean }[] }}
              onChange={(opts) => handleFieldChange("options", opts)}
            />
          )}
          {question.type === "TRUE_FALSE" && (
            <TrueFalseEditor
              options={question.options as { correct: boolean }}
              onChange={(opts) => handleFieldChange("options", opts)}
            />
          )}
          {question.type === "OPEN_ANSWER" && (
            <OpenAnswerEditor
              options={question.options as { acceptedAnswers: string[] }}
              onChange={(opts) => handleFieldChange("options", opts)}
            />
          )}
          {question.type === "ORDERING" && (
            <OrderingEditor
              options={question.options as { items: string[]; correctOrder: number[] }}
              onChange={(opts) => handleFieldChange("options", opts)}
            />
          )}
          {question.type === "MATCHING" && (
            <MatchingEditor
              options={question.options as { pairs: { left: string; right: string }[] }}
              onChange={(opts) => handleFieldChange("options", opts)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── MULTIPLE CHOICE ── */
function MultipleChoiceEditor({
  options,
  onChange,
}: {
  options: { choices: { text: string; isCorrect: boolean }[] };
  onChange: (opts: { choices: { text: string; isCorrect: boolean }[] }) => void;
}) {
  const { choices } = options;

  const updateChoice = (i: number, partial: Partial<{ text: string; isCorrect: boolean }>) => {
    const next = choices.map((c, idx) => (idx === i ? { ...c, ...partial } : c));
    onChange({ choices: next });
  };

  const addChoice = () => {
    if (choices.length >= 6) return;
    onChange({ choices: [...choices, { text: "", isCorrect: false }] });
  };

  const removeChoice = (i: number) => {
    if (choices.length <= 2) return;
    onChange({ choices: choices.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-2">
      {choices.map((choice, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={choice.isCorrect}
            onChange={(e) => updateChoice(i, { isCorrect: e.target.checked })}
            className="size-4 accent-primary"
            title="Corretta"
          />
          <Input
            value={choice.text}
            onChange={(e) => updateChoice(i, { text: e.target.value })}
            placeholder={`Scelta ${i + 1}`}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeChoice(i)}
            disabled={choices.length <= 2}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      {choices.length < 6 && (
        <Button variant="outline" size="sm" onClick={addChoice}>
          <Plus className="size-3.5 mr-1" /> Aggiungi scelta
        </Button>
      )}
    </div>
  );
}

/* ── TRUE / FALSE ── */
function TrueFalseEditor({
  options,
  onChange,
}: {
  options: { correct: boolean };
  onChange: (opts: { correct: boolean }) => void;
}) {
  return (
    <div className="flex gap-4">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="trueFalse"
          checked={options.correct === true}
          onChange={() => onChange({ correct: true })}
          className="accent-primary"
        />
        <span className="text-sm">Vero</span>
      </label>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="radio"
          name="trueFalse"
          checked={options.correct === false}
          onChange={() => onChange({ correct: false })}
          className="accent-primary"
        />
        <span className="text-sm">Falso</span>
      </label>
    </div>
  );
}

/* ── OPEN ANSWER ── */
function OpenAnswerEditor({
  options,
  onChange,
}: {
  options: { acceptedAnswers: string[] };
  onChange: (opts: { acceptedAnswers: string[] }) => void;
}) {
  const { acceptedAnswers } = options;

  const updateAnswer = (i: number, value: string) => {
    const next = acceptedAnswers.map((a, idx) => (idx === i ? value : a));
    onChange({ acceptedAnswers: next });
  };

  const addAnswer = () => {
    onChange({ acceptedAnswers: [...acceptedAnswers, ""] });
  };

  const removeAnswer = (i: number) => {
    if (acceptedAnswers.length <= 1) return;
    onChange({ acceptedAnswers: acceptedAnswers.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Risposte accettate (non sensibili a maiuscole/minuscole)
      </p>
      {acceptedAnswers.map((answer, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={answer}
            onChange={(e) => updateAnswer(i, e.target.value)}
            placeholder={`Risposta ${i + 1}`}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeAnswer(i)}
            disabled={acceptedAnswers.length <= 1}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addAnswer}>
        <Plus className="size-3.5 mr-1" /> Aggiungi risposta
      </Button>
    </div>
  );
}

/* ── ORDERING ── */
function OrderingEditor({
  options,
  onChange,
}: {
  options: { items: string[]; correctOrder: number[] };
  onChange: (opts: { items: string[]; correctOrder: number[] }) => void;
}) {
  const { items } = options;

  const updateItem = (i: number, value: string) => {
    const next = items.map((item, idx) => (idx === i ? value : item));
    onChange({ items: next, correctOrder: next.map((_, idx) => idx) });
  };

  const addItem = () => {
    const next = [...items, ""];
    onChange({ items: next, correctOrder: next.map((_, idx) => idx) });
  };

  const removeItem = (i: number) => {
    if (items.length <= 2) return;
    const next = items.filter((_, idx) => idx !== i);
    onChange({ items: next, correctOrder: next.map((_, idx) => idx) });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Inserisci gli elementi nell&apos;ordine corretto
      </p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground w-6 text-right">{i + 1}.</span>
          <Input
            value={item}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={`Elemento ${i + 1}`}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeItem(i)}
            disabled={items.length <= 2}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem}>
        <Plus className="size-3.5 mr-1" /> Aggiungi elemento
      </Button>
    </div>
  );
}

/* ── MATCHING ── */
function MatchingEditor({
  options,
  onChange,
}: {
  options: { pairs: { left: string; right: string }[] };
  onChange: (opts: { pairs: { left: string; right: string }[] }) => void;
}) {
  const { pairs } = options;

  const updatePair = (i: number, field: "left" | "right", value: string) => {
    const next = pairs.map((p, idx) => (idx === i ? { ...p, [field]: value } : p));
    onChange({ pairs: next });
  };

  const addPair = () => {
    onChange({ pairs: [...pairs, { left: "", right: "" }] });
  };

  const removePair = (i: number) => {
    if (pairs.length <= 2) return;
    onChange({ pairs: pairs.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Abbina ogni elemento a sinistra con quello a destra
      </p>
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={pair.left}
            onChange={(e) => updatePair(i, "left", e.target.value)}
            placeholder={`Sinistra ${i + 1}`}
            className="flex-1"
          />
          <span className="text-muted-foreground text-sm">&harr;</span>
          <Input
            value={pair.right}
            onChange={(e) => updatePair(i, "right", e.target.value)}
            placeholder={`Destra ${i + 1}`}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removePair(i)}
            disabled={pairs.length <= 2}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addPair}>
        <Plus className="size-3.5 mr-1" /> Aggiungi coppia
      </Button>
    </div>
  );
}
