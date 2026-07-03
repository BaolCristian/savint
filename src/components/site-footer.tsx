"use client";

import { useTranslations } from "next-intl";

/** "gg/mm/aaaa" da una data ISO build-time (deterministico, niente locale). */
function formatBuildDate(iso: string | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return iso.split("-").reverse().join("/");
}

/**
 * Footer delle installazioni: versione, data di build, creatore e link a
 * savint.it. Versione/data sono inlined al build da next.config.ts.
 */
export function SiteFooter({ variant = "light" }: { variant?: "light" | "dark" }) {
  const t = useTranslations("live");
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "";
  const date = formatBuildDate(process.env.NEXT_PUBLIC_APP_BUILD_DATE);

  const base = variant === "dark" ? "text-slate-500" : "text-slate-400";
  const link =
    variant === "dark"
      ? "underline hover:text-slate-300"
      : "font-semibold text-brand-blue hover:text-blue-800";

  return (
    <p className={`text-center text-xs ${base}`}>
      SAVINT{version ? ` v${version}` : ""}
      {date ? ` · ${date}` : ""} — {t("madeBy")} Cristian Virgili ·{" "}
      <a href="https://www.savint.it" target="_blank" rel="noopener noreferrer" className={link}>
        savint.it
      </a>
    </p>
  );
}
