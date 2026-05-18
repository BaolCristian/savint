"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

type Props = {
  quizId: string;
  qlzAvailable?: boolean;
};

export function HubQuizDetailActions({ quizId, qlzAvailable = true }: Props) {
  const t = useTranslations("hub");

  return (
    <div className="flex flex-wrap gap-3 mt-4">
      <Button asChild>
        <Link href={`/practice/${quizId}?from=hub`}>{t("tryNow")}</Link>
      </Button>

      {qlzAvailable && (
        <Button variant="outline" asChild>
          <a href={`/api/hub/quizzes/${quizId}/download`} download>
            {t("downloadQlz")}
          </a>
        </Button>
      )}

      <Button variant="ghost" size="sm" asChild>
        <Link href={`/report?quizId=${quizId}`}>{t("report")}</Link>
      </Button>
    </div>
  );
}
