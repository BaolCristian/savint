"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AREE, type Area } from "./aree";

export type TeacherExercisesNavLabels = {
  label: string;
  overview: string;
  catalog: string;
  collections: string;
  assignments: string;
  classes: string;
  models: string;
  prepare: string;
  assign: string;
};

/** Local navigation deliberately lives on the ordinary management pages,
 * rather than the editor layout: the editor needs its uninterrupted,
 * full-height workspace.
 *
 * Le schede sono in due gruppi, nell'ordine in cui si lavora: prima si
 * PREPARA il materiale (esercizi, raccolte, modelli), poi lo si ASSEGNA
 * (compiti, classi). Ogni scheda porta il colore della sua zona. */
export function TeacherExercisesNav({ labels }: { labels: TeacherExercisesNavLabels }) {
  const pathname = usePathname();
  const gruppi: { titolo: string | null; voci: { area: Area; label: string; exact?: boolean }[] }[] = [
    { titolo: null, voci: [{ area: "panoramica", label: labels.overview, exact: true }] },
    {
      titolo: labels.prepare,
      voci: [
        { area: "esercizi", label: labels.catalog },
        { area: "raccolte", label: labels.collections },
        // Nuovo compito, Task 7: i modelli (i compiti salvati) accanto alle
        // raccolte; la vecchia pagina "Prepara un compito" porta qui.
        { area: "modelli", label: labels.models },
      ],
    },
    {
      titolo: labels.assign,
      voci: [
        { area: "compiti", label: labels.assignments },
        { area: "classi", label: labels.classes },
      ],
    },
  ];

  return (
    <nav aria-label={labels.label} className="flex flex-wrap items-end gap-x-5 gap-y-2 border-b border-border">
      {gruppi.map((gruppo, i) => (
        <div key={i} className="flex flex-col gap-0.5">
          {/* Il nome del gruppo e' solo un aiuto visivo: chi usa un lettore
              di schermo sente gia' le schede, una per una. */}
          <span aria-hidden className="h-4 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {gruppo.titolo}
          </span>
          <div className="flex flex-wrap gap-1">
            {gruppo.voci.map((voce) => {
              const stile = AREE[voce.area];
              const Icona = stile.icona;
              const active = voce.exact
                ? pathname === stile.href
                : pathname === stile.href || pathname.startsWith(`${stile.href}/`);
              return (
                <Link
                  key={voce.area}
                  href={stile.href}
                  aria-current={active ? "page" : undefined}
                  className={`-mb-px inline-flex items-center gap-2 rounded-t-lg border-b-[3px] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active
                      ? `${stile.tenue} ${stile.bordo} text-foreground`
                      : "border-transparent text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  }`}
                >
                  <Icona className={`h-4 w-4 ${stile.testo}`} aria-hidden />
                  {voce.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
