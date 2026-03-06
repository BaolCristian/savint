"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/quiz", label: "I miei Quiz" },
  { href: "/dashboard/sessions", label: "Sessioni" },
  { href: "/dashboard/stats", label: "Statistiche" },
  { href: "/dashboard/share", label: "Condivisioni" },
];

export function DashboardSidebar({ user }: { user: any }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col">
      <div className="text-xl font-bold mb-8">Quiz Live</div>
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t pt-4 mt-4">
        <div className="text-sm font-medium">{user?.name}</div>
        <div className="text-xs text-muted-foreground">{user?.email}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-red-500 mt-2 hover:underline"
        >
          Esci
        </button>
      </div>
    </aside>
  );
}
