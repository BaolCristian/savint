"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Menu, Home, BookOpen, Play, BarChart3, Share2, Sparkles, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/dashboard/theme-provider";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/dashboard/quiz", label: "I miei Quiz", icon: BookOpen },
  { href: "/dashboard/sessions", label: "Sessioni", icon: Play },
  { href: "/dashboard/stats", label: "Statistiche", icon: BarChart3 },
  { href: "/dashboard/share", label: "Condivisioni", icon: Share2 },
  { href: "/dashboard/ai-prompts", label: "Crea con AI", icon: Sparkles },
];

function SidebarContent({ user, onNavigate }: { user: any; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { theme, toggle } = useTheme();

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <img src="/logo_savint.png" alt="SAVINT" className="w-10 h-10 object-contain" />
        <span className="text-xl font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
          SAVINT
        </span>
      </div>

      {/* Nav */}
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => {
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

      {/* Theme toggle + User */}
      <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-4">
        <button
          onClick={toggle}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mb-2"
        >
          {theme === "dark" ? <Sun className="h-4 w-4 text-amber-500" /> : <Moon className="h-4 w-4 text-slate-400" />}
          {theme === "dark" ? "Modalita chiara" : "Modalita scura"}
        </button>
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
          onClick={() => signOut({ callbackUrl: "/" })}
          className="flex items-center gap-2 px-3 py-2 w-full rounded-lg text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Esci
        </button>
      </div>
    </>
  );
}

export function DashboardSidebar({ user }: { user: any }) {
  const [open, setOpen] = useState(false);

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
            aria-label="Apri menu"
          >
            <Menu className="h-5 w-5 text-slate-600" />
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4 flex flex-col">
            <SheetTitle className="sr-only">Menu di navigazione</SheetTitle>
            <SidebarContent user={user} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <img src="/logo_savint.png" alt="SAVINT" className="w-8 h-8 object-contain" />
          <span className="text-lg font-extrabold">SAVINT</span>
        </div>
      </div>
    </>
  );
}
