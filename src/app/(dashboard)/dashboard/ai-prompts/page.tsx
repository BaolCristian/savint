"use client";

import { useState, useMemo } from "react";
import { Copy, Check, Download, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import { useTranslations } from "next-intl";

const TARGET_KEYS = [
  "primarySchool",
  "middleSchool",
  "highSchoolFirst",
  "highSchoolLast",
  "university",
  "adultEducation",
] as const;

export default function AiPromptsPage() {
  const t = useTranslations("ai");
  const tc = useTranslations("common");
  const promptTemplate = t("prompt");

  const [topic, setTopic] = useState("");
  const [target, setTarget] = useState("");
  const [language, setLanguage] = useState("");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isFormFilled = topic.trim() && target && language.trim();

  const finalPrompt = useMemo(() => {
    if (!isFormFilled) return promptTemplate;
    return promptTemplate
      .replace(/\[(?:ARGOMENTO|TOPIC)\]/, topic.trim())
      .replace(
        /\[TARGET[^\]]*\]/,
        target,
      )
      .replace(/\[(?:LINGUA|LANGUAGE)[^\]]*\]/, language.trim());
  }, [promptTemplate, topic, target, language, isFormFilled]);

  async function handleCopy() {
    await navigator.clipboard.writeText(finalPrompt);
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
          {t("importHint")}
        </p>
      </div>

      {/* ---- Form fields ---- */}
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500" />
          {t("formTitle")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-3">
          {/* Topic */}
          <div className="space-y-1.5">
            <label
              htmlFor="ai-topic"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t("topicLabel")}
            </label>
            <input
              id="ai-topic"
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("topicPlaceholder")}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Target */}
          <div className="space-y-1.5">
            <label
              htmlFor="ai-target"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t("targetLabel")}
            </label>
            <select
              id="ai-target"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t("targetPlaceholder")}</option>
              {TARGET_KEYS.map((key) => (
                <option key={key} value={t(`targets.${key}`)}>
                  {t(`targets.${key}`)}
                </option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div className="space-y-1.5">
            <label
              htmlFor="ai-language"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t("languageLabel")}
            </label>
            <input
              id="ai-language"
              type="text"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder={t("languagePlaceholder")}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {/* ---- Prompt preview ---- */}
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
                {isFormFilled ? t("copyReady") : tc("copy")}
              </>
            )}
          </Button>
        </div>
        <pre className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 pr-28 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[60vh] overflow-y-auto">
          {finalPrompt}
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
