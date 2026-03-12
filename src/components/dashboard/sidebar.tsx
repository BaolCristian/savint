"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Home, BookOpen, Play, BarChart3, Share2, Sparkles, Library, LogOut, Moon, Sun, ShieldCheck } from "lucide-react";
import { useTheme } from "@/components/dashboard/theme-provider";
import { withBasePath } from "@/lib/base-path";
import { useTranslations } from "next-intl";
import { LocaleSwitcher } from "@/components/locale-switcher";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

function SidebarContent({ user, onNavigate }: { user: any; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();
  const t = useTranslations("sidebar");

  const navItems = [
    { href: "/dashboard", label: "Home", icon: Home },
    { href: "/dashboard/quiz", label: t("myQuizzes"), icon: BookOpen },
    { href: "/dashboard/sessions", label: t("sessions"), icon: Play },
    { href: "/dashboard/stats", label: t("statistics"), icon: BarChart3 },
    { href: "/dashboard/share", label: t("shares"), icon: Share2 },
    { href: "/dashboard/library", label: t("library"), icon: Library },
    { href: "/dashboard/ai-prompts", label: t("createWithAI"), icon: Sparkles },
  ];

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-10 h-10 object-contain" />
        <span className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
          SAVINT
        </span>
      </div>

      {/* Nav */}
      <nav className="space-y-1 flex-1">
        {[...navItems, ...(user?.role === "ADMIN" ? [{ href: "/dashboard/admin", label: "Admin", icon: ShieldCheck }] : [])].map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shadow-sm border border-indigo-100 dark:border-indigo-800"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Theme toggle + Locale + User */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mb-1"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-slate-400" />}
          {theme === "dark" ? t("lightMode") : t("darkMode")}
        </button>
        <div className="px-3 py-2 mb-2">
          <LocaleSwitcher />
        </div>
        <div className="flex items-center gap-3 px-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            {user?.name?.charAt(0)?.toUpperCase() || "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{user?.name}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</div>
          </div>
        </div>
        <button
          onClick={() => { window.location.href = withBasePath("/api/auth/logout"); }}
          className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t("logout")}
        </button>
      </div>
    </>
  );
}

export function DashboardSidebar({ user }: { user: any }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("sidebar");

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex-col shadow-sm">
        <SidebarContent user={user} />
      </aside>

      {/* Mobile header with hamburger */}
      <div className="md:hidden flex items-center gap-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 shadow-sm">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-slate-100 transition-colors"
            aria-label={t("openMenu")}
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4 flex flex-col">
            <SheetTitle className="sr-only">{t("navigationMenu")}</SheetTitle>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-8 h-8 object-contain" />
          <span className="text-lg font-extrabold">SAVINT</span>
        </div>
      </div>
    </>
  );
}
