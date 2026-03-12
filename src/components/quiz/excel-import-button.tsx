"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

interface Props {
  quizId?: string;
  onImported?: () => void;
}

export function ExcelImportButton({ quizId, onImported }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("quiz");

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (quizId) form.append("quizId", quizId);

      const res = await fetch(withBasePath("/api/quiz/excel-import"), {
        method: "POST",
        body: form,
      });

      const body = await res.json();

      if (res.status === 422) {
        const errMsgs = body.errors
          .map((e: { sheet: string; row: number; message: string }) => `${e.sheet}, ${t("excelRow")} ${e.row}: ${e.message}`)
          .join("\n");
        alert(`${t("excelErrorHeader")}\n\n${errMsgs}`);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(body.error || t("importError"));
      }

      if (quizId) {
        alert(`${body.added} ${t("excelQuestionsAdded")}`);
        onImported?.();
      } else {
        router.push(`/dashboard/quiz/${body.id}/edit`);
        router.refresh();
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : t("importError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleImport(file);
          e.target.value = "";
        }}
      />
      <Button
        variant="outline"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="size-4 mr-2 animate-spin" />
        ) : (
          <FileSpreadsheet className="size-4 mr-2" />
        )}
        {t("importExcel")}
      </Button>
    </>
  );
}
