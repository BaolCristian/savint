"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
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

export function HubHeader({ isAdmin = false, isLoggedIn = false }: { isAdmin?: boolean; isLoggedIn?: boolean }) {
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
          <span className="bg-gradient-to-r from-brand-blue to-brand-magenta bg-clip-text text-lg font-extrabold text-transparent">
            SAVINT
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm font-medium">
          <Link
            href={withBasePath("/explore")}
            className="text-slate-600 transition-colors hover:text-brand-blue"
          >
            {t("exploreNav")}
          </Link>
          {isAdmin && (
            <Link href={withBasePath("/admin/hub/affiliations")} className="text-slate-600 transition-colors hover:text-brand-blue">
              {t("headerAdmin")}
            </Link>
          )}
          {isLoggedIn ? (
            <>
              <Link href={withBasePath("/hub-account")} className="text-slate-600 transition-colors hover:text-brand-blue">
                {t("accountNav")}
              </Link>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: withBasePath("/") })}
                className="text-slate-600 transition-colors hover:text-brand-blue"
              >
                {t("logoutNav")}
              </button>
            </>
          ) : (
            <Link
              href={withBasePath("/hub-login")}
              className="rounded-lg bg-brand-blue px-3 py-1.5 font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {t("loginNav")}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
