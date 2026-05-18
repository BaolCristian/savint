"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PublishModal } from "@/components/hub/publish-modal";

type Props = {
  hubEnabled: boolean;
  quiz: Parameters<typeof PublishModal>[0]["quiz"];
  link: { hubAccountEmail: string } | null;
};

export function PublishButton({ hubEnabled, quiz, link }: Props) {
  const t = useTranslations("hub.publish");
  const [open, setOpen] = useState(false);
  if (!hubEnabled) return null;
  const label = quiz.hubPublishedId ? t("titleUpdate") : t("title");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"
      >
        {label}
      </button>
      <PublishModal open={open} quiz={quiz} link={link} onClose={() => setOpen(false)} />
    </>
  );
}
