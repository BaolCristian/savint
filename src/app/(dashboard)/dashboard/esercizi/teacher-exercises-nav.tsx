"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TeacherExercisesNavLabels = {
  label: string;
  overview: string;
  catalog: string;
  collections: string;
  assignments: string;
  classes: string;
};

/** Local navigation deliberately lives on the ordinary management pages,
 * rather than the editor layout: the editor needs its uninterrupted,
 * full-height workspace. */
export function TeacherExercisesNav({ labels }: { labels: TeacherExercisesNavLabels }) {
  const pathname = usePathname();
  const items = [
    { href: "/dashboard/esercizi", label: labels.overview, exact: true },
    { href: "/dashboard/esercizi/redazione", label: labels.catalog },
    { href: "/dashboard/esercizi/contenitori", label: labels.collections },
    { href: "/dashboard/esercizi/compiti", label: labels.assignments },
    { href: "/dashboard/esercizi/classi", label: labels.classes },
  ];

  return (
    <nav aria-label={labels.label} className="flex flex-wrap gap-1 border-b border-border pb-3">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
