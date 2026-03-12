"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withBasePath } from "@/lib/base-path";

export function LocaleSwitcher() {
  const locale = useLocale();
  const t = useTranslations("localeSwitcher");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (newLocale: string) => {
    startTransition(async () => {
      await fetch(withBasePath("/api/locale"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
      router.refresh();
    });
  };

  return (
    <button
      onClick={() => switchLocale(locale === "it" ? "en" : "it")}
      disabled={isPending}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      <span className="text-base">{locale === "it" ? "🇬🇧" : "🇮🇹"}</span>
      {locale === "it" ? t("en") : t("it")}
    </button>
  );
}
