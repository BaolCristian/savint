"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";

type Props = {
  quizId: string;
  qlzAvailable?: boolean;
};

export function HubQuizDetailActions({ quizId, qlzAvailable = true }: Props) {
  const t = useTranslations("hub");

  return (
    <div className="flex flex-wrap gap-3 mt-4">
      <Link
        href={`/practice/${quizId}?from=hub`}
        className={buttonVariants()}
      >
        {t("tryNow")}
      </Link>

      {qlzAvailable && (
        <a
          href={`/api/hub/quizzes/${quizId}/download`}
          download
          className={buttonVariants({ variant: "outline" })}
        >
          {t("downloadQlz")}
        </a>
      )}

      <Link
        href={`/report?quizId=${quizId}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        {t("report")}
      </Link>
    </div>
  );
}
