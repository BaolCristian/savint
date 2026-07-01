import {
  Calculator,
  BookOpen,
  Landmark,
  Globe2,
  FlaskConical,
  Atom,
  TestTube,
  Leaf,
  Code2,
  Languages,
  ScrollText,
  Building2,
  Brain,
  Palette,
  Music,
  Dumbbell,
  Scale,
  Church,
  Wrench,
  TrendingUp,
  Gavel,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";

export type SubjectVisual = {
  icon: LucideIcon;
  /** icon chip + subject pill background/text (static so Tailwind keeps them) */
  chip: string;
  /** thin accent bar at the top of the card */
  accent: string;
};

const DEFAULT: SubjectVisual = {
  icon: HelpCircle,
  chip: "bg-slate-100 text-slate-600",
  accent: "bg-slate-300",
};

// Subject → colour family + icon. Colours echo the classic "one colour per
// school subject" convention so the grid is scannable at a glance.
const MAP: Record<string, SubjectVisual> = {
  matematica: { icon: Calculator, chip: "bg-sky-100 text-sky-700", accent: "bg-sky-400" },
  italiano: { icon: BookOpen, chip: "bg-rose-100 text-rose-700", accent: "bg-rose-400" },
  storia: { icon: Landmark, chip: "bg-amber-100 text-amber-700", accent: "bg-amber-400" },
  geografia: { icon: Globe2, chip: "bg-teal-100 text-teal-700", accent: "bg-teal-400" },
  scienze: { icon: FlaskConical, chip: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-400" },
  fisica: { icon: Atom, chip: "bg-cyan-100 text-cyan-700", accent: "bg-cyan-400" },
  chimica: { icon: TestTube, chip: "bg-lime-100 text-lime-700", accent: "bg-lime-400" },
  biologia: { icon: Leaf, chip: "bg-green-100 text-green-700", accent: "bg-green-400" },
  informatica: { icon: Code2, chip: "bg-indigo-100 text-indigo-700", accent: "bg-indigo-400" },
  inglese: { icon: Languages, chip: "bg-blue-100 text-blue-700", accent: "bg-blue-400" },
  francese: { icon: Languages, chip: "bg-blue-100 text-blue-700", accent: "bg-blue-400" },
  spagnolo: { icon: Languages, chip: "bg-orange-100 text-orange-700", accent: "bg-orange-400" },
  tedesco: { icon: Languages, chip: "bg-zinc-100 text-zinc-700", accent: "bg-zinc-400" },
  latino: { icon: ScrollText, chip: "bg-stone-100 text-stone-700", accent: "bg-stone-400" },
  greco: { icon: Building2, chip: "bg-stone-100 text-stone-700", accent: "bg-stone-400" },
  filosofia: { icon: Brain, chip: "bg-purple-100 text-purple-700", accent: "bg-purple-400" },
  arte: { icon: Palette, chip: "bg-pink-100 text-pink-700", accent: "bg-pink-400" },
  musica: { icon: Music, chip: "bg-fuchsia-100 text-fuchsia-700", accent: "bg-fuchsia-400" },
  educazione_fisica: { icon: Dumbbell, chip: "bg-orange-100 text-orange-700", accent: "bg-orange-400" },
  educazione_civica: { icon: Scale, chip: "bg-blue-100 text-blue-700", accent: "bg-blue-400" },
  religione: { icon: Church, chip: "bg-amber-100 text-amber-700", accent: "bg-amber-400" },
  tecnologia: { icon: Wrench, chip: "bg-slate-100 text-slate-700", accent: "bg-slate-400" },
  economia: { icon: TrendingUp, chip: "bg-emerald-100 text-emerald-700", accent: "bg-emerald-400" },
  diritto: { icon: Gavel, chip: "bg-indigo-100 text-indigo-700", accent: "bg-indigo-400" },
  altro: { icon: HelpCircle, chip: "bg-slate-100 text-slate-600", accent: "bg-slate-300" },
};

export function getSubjectVisual(slug: string | null | undefined): SubjectVisual {
  if (!slug) return DEFAULT;
  return MAP[slug] ?? DEFAULT;
}
