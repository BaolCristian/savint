"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function FromHubBadge({ hubId, author }: { hubId: string; author: string }) {
  const t = useTranslations("hub");
  const hubBase = process.env.NEXT_PUBLIC_SAVINT_HUB_URL ?? "";
  return (
    <Link
      href={`${hubBase}/q/${hubId}`}
      target="_blank"
      rel="noopener"
      className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full hover:bg-indigo-100"
    >
      {t("fromHub", { author })}
    </Link>
  );
}
