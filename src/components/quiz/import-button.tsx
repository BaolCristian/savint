"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

export function ImportQuizButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleImport(file: File) {
    setLoading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/quiz/import", {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Errore nell'importazione");
      }
      const { id } = await res.json();
      router.push(`/dashboard/quiz/${id}/edit`);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore nell'importazione");
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
        Importa .qlz
      </Button>
    </>
  );
}
