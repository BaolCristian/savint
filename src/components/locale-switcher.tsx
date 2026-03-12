"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { withBasePath } from "@/lib/base-path";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const switchLocale = (newLocale: string) => {
    if (newLocale === locale) return;
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
    <div className="flex items-center gap-1">
      <button
        onClick={() => switchLocale("it")}
        disabled={isPending}
        className={`px-2 py-1 rounded text-sm transition-colors ${
          locale === "it"
            ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🇮🇹 IT
      </button>
      <button
        onClick={() => switchLocale("en")}
        disabled={isPending}
        className={`px-2 py-1 rounded text-sm transition-colors ${
          locale === "en"
            ? "bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        🇬🇧 EN
      </button>
    </div>
  );
}
