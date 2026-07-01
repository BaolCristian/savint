"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";

// Pages that manage their own full-screen layout — no shared header there.
const HIDE_PREFIXES = [
  "/hub-login",
  "/hub-register",
  "/hub-forgot-password",
  "/hub-reset-password",
  "/hub-verify-email",
  "/oauth/authorize",
];

export function HubHeader() {
  const pathname = usePathname();
  const t = useTranslations("hub");

  const hidden =
    pathname === "/" || // home has its own hero + branding
    HIDE_PREFIXES.some((p) => pathname.startsWith(p)) ||
    /\/q\/[^/]+\/play\//.test(pathname); // immersive practice runner

  if (hidden) return null;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur-sm">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-2.5">
        <Link href={withBasePath("/")} className="flex items-center gap-2">
          <img
            src={withBasePath("/logo_savint.png")}
            alt="SAVINT"
            className="h-7 w-7 object-contain"
          />
          <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-lg font-extrabold text-transparent">
            SAVINT
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link
            href={withBasePath("/explore")}
            className="text-slate-600 transition-colors hover:text-indigo-700"
          >
            {t("exploreNav")}
          </Link>
        </nav>
      </div>
    </header>
  );
}
