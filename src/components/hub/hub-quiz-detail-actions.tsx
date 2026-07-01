"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { ReportQuizButton } from "./report-quiz-button";

type Props = {
  quizId: string;
  qlzAvailable?: boolean;
};

export function HubQuizDetailActions({ quizId, qlzAvailable = true }: Props) {
  const t = useTranslations("hub");
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  // Hub practice runs on HubQuiz content: start a practice run, then open the
  // runner. The /practice/[quizId] route is for local installation quizzes and
  // would 404 for a hub quiz id.
  async function startPractice() {
    if (starting) return;
    setStarting(true);
    try {
      const res = await fetch("/api/hub/practice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId }),
      });
      if (!res.ok) {
        setStarting(false);
        return;
      }
      const { runId } = (await res.json()) as { runId: string };
      router.push(`/q/${quizId}/play/${runId}`);
    } catch {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3 mt-4">
      <button
        type="button"
        onClick={startPractice}
        disabled={starting}
        className={buttonVariants()}
      >
        {starting ? "…" : t("tryNow")}
      </button>

      {qlzAvailable && (
        <a
          href={`/api/hub/quizzes/${quizId}/download`}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          {t("downloadQlz")}
        </a>
      )}

      <ReportQuizButton hubQuizId={quizId} />
    </div>
  );
}
