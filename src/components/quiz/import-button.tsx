"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

export function ImportQuizButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useTranslations("quiz");

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(withBasePath("/api/quiz/import"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || t("importError"));
      }
      const { id } = await res.json();
      router.push(`/dashboard/quiz/${id}/edit`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : t("importError"));
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".qlz"
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
          <Upload className="size-4 mr-2" />
        )}
        {t("importQlz")}
      </Button>
    </>
  );
}
