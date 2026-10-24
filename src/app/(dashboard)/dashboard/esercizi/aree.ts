import { BookOpen, ClipboardList, FolderOpen, LayoutGrid, Layers, Users, type LucideIcon } from "lucide-react";

// Ogni zona della sezione esercizi ha un colore e un'icona, gli stessi
// nella barra, nell'intestazione della pagina e nella Panoramica: il
// docente riconosce dove si trova dal colore prima ancora di leggere.
// Le classi Tailwind sono scritte per intero (non composte a runtime),
// altrimenti Tailwind non le genera.
export type Area = "panoramica" | "esercizi" | "raccolte" | "modelli" | "compiti" | "classi";

export type StileArea = {
  href: string;
  icona: LucideIcon;
  /** Riquadro pieno dell'icona (icona bianca sopra). */
  pieno: string;
  /** Icona colorata su fondo neutro. */
  testo: string;
  /** Fondo tenue, per la scheda attiva e le carte. */
  tenue: string;
  /** Bordo colorato (carte al passaggio del mouse, barra attiva). */
  bordo: string;
};

export const AREE: Record<Area, StileArea> = {
  panoramica: {
    href: "/dashboard/esercizi",
    icona: LayoutGrid,
    pieno: "bg-brand-ink text-white dark:bg-white dark:text-brand-ink",
    testo: "text-foreground",
    tenue: "bg-muted",
    bordo: "border-foreground",
  },
  esercizi: {
    href: "/dashboard/esercizi/redazione",
    icona: BookOpen,
    pieno: "bg-brand-blue text-white",
    testo: "text-brand-blue",
    tenue: "bg-brand-blue/10",
    bordo: "border-brand-blue",
  },
  raccolte: {
    href: "/dashboard/esercizi/contenitori",
    icona: FolderOpen,
    pieno: "bg-brand-green text-white",
    testo: "text-brand-green",
    tenue: "bg-brand-green/10",
    bordo: "border-brand-green",
  },
  modelli: {
    href: "/dashboard/esercizi/modelli",
    icona: Layers,
    pieno: "bg-brand-violet text-white",
    testo: "text-brand-violet",
    tenue: "bg-brand-violet/10",
    bordo: "border-brand-violet",
  },
  compiti: {
    href: "/dashboard/esercizi/compiti",
    icona: ClipboardList,
    pieno: "bg-brand-orange text-white",
    testo: "text-brand-orange",
    tenue: "bg-brand-orange/10",
    bordo: "border-brand-orange",
  },
  classi: {
    href: "/dashboard/esercizi/classi",
    icona: Users,
    pieno: "bg-brand-teal text-white",
    testo: "text-brand-teal",
    tenue: "bg-brand-teal/10",
    bordo: "border-brand-teal",
  },
};

/** Le etichette della barra, dal namespace `teacherExercisesUi`: una sola
 * funzione invece della stessa lista ricopiata su ogni pagina. */
export function etichetteNav(tUi: (chiave: string) => string) {
  return {
    label: tUi("nav.label"),
    overview: tUi("nav.overview"),
    catalog: tUi("nav.catalog"),
    collections: tUi("nav.collections"),
    assignments: tUi("nav.assignments"),
    classes: tUi("nav.classes"),
    models: tUi("nav.models"),
    prepare: tUi("nav.prepare"),
    assign: tUi("nav.assign"),
  };
}
