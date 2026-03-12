"use client";

import { useState } from "react";
import { Copy, Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import { useTranslations } from "next-intl";

export default function AiPromptsPage() {
  const t = useTranslations("ai");
  const tc = useTranslations("common");
  const prompt = t("prompt");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch(withBasePath("/api/quiz/excel-template"));
      if (!res.ok) throw new Error(t("downloadError"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "savint-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(t("downloadTemplateError"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {t("instruction")}{" "}
          {t("highlights")}{" "}
          {t("importHint")}
        </p>
      </div>

      <div className="relative">
        <div className="absolute top-3 right-3 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="bg-white dark:bg-slate-800"
          >
            {copied ? (
              <>
                <Check className="size-4 mr-1.5 text-emerald-600" />
                {tc("copied")}
              </>
            ) : (
              <>
                <Copy className="size-4 mr-1.5" />
                {tc("copy")}
              </>
            )}
          </Button>
        </div>
        <pre className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 pr-28 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[60vh] overflow-y-auto">
          {prompt}
        </pre>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloading}>
          {downloading ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Download className="size-4 mr-2" />
          )}
          {t("downloadTemplate")}
        </Button>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
        {t("tip")}
      </div>
    </div>
  );
}
