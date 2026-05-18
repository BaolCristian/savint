"use client";

import { useTranslations } from "next-intl";

export function SuspendedBanner({ reason }: { reason: string | null }) {
  const t = useTranslations("hub.suspended");
  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{t("banner")}</p>
      {reason && (
        <p className="text-sm mt-1">
          <strong>{t("reasonLabel")}:</strong> {reason}
        </p>
      )}
    </div>
  );
}
