"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

const TABS = [
  { href: "/admin/hub/affiliations", key: "affiliations" },
  { href: "/admin/hub/reports", key: "reports" },
  { href: "/admin/hub/admins", key: "admins" },
] as const;

export function AdminTabs() {
  const pathname = usePathname();
  const t = useTranslations("hub.adminNav");
  return (
    <nav className="mb-6 flex gap-2">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active
                ? "bg-brand-blue-50 text-brand-blue"
                : "text-slate-700 hover:bg-brand-blue-50 hover:text-brand-blue"
            }`}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
