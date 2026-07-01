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
  /** solid colour — icon badge background + top accent bar (static for Tailwind) */
  solid: string;
  /** soft colour — subject label pill */
  pill: string;
};

const DEFAULT: SubjectVisual = {
  icon: HelpCircle,
  solid: "bg-slate-400",
  pill: "bg-slate-100 text-slate-600",
};

// Subject → colour + icon. Colours are spread across the wheel and rendered as
// a SOLID icon badge so different subjects are obvious at a glance (adjacent
// hues like indigo/blue are hard to tell apart when only used as a faint tint).
const MAP: Record<string, SubjectVisual> = {
  matematica: { icon: Calculator, solid: "bg-sky-500", pill: "bg-sky-100 text-sky-700" },
  italiano: { icon: BookOpen, solid: "bg-rose-500", pill: "bg-rose-100 text-rose-700" },
  storia: { icon: Landmark, solid: "bg-amber-500", pill: "bg-amber-100 text-amber-700" },
  geografia: { icon: Globe2, solid: "bg-teal-500", pill: "bg-teal-100 text-teal-700" },
  scienze: { icon: FlaskConical, solid: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-700" },
  fisica: { icon: Atom, solid: "bg-cyan-500", pill: "bg-cyan-100 text-cyan-700" },
  chimica: { icon: TestTube, solid: "bg-lime-500", pill: "bg-lime-100 text-lime-700" },
  biologia: { icon: Leaf, solid: "bg-green-500", pill: "bg-green-100 text-green-700" },
  informatica: { icon: Code2, solid: "bg-violet-500", pill: "bg-violet-100 text-violet-700" },
  inglese: { icon: Languages, solid: "bg-blue-500", pill: "bg-blue-100 text-blue-700" },
  francese: { icon: Languages, solid: "bg-sky-600", pill: "bg-sky-100 text-sky-700" },
  spagnolo: { icon: Languages, solid: "bg-orange-500", pill: "bg-orange-100 text-orange-700" },
  tedesco: { icon: Languages, solid: "bg-zinc-500", pill: "bg-zinc-100 text-zinc-700" },
  latino: { icon: ScrollText, solid: "bg-stone-500", pill: "bg-stone-100 text-stone-700" },
  greco: { icon: Building2, solid: "bg-stone-600", pill: "bg-stone-100 text-stone-700" },
  filosofia: { icon: Brain, solid: "bg-purple-500", pill: "bg-purple-100 text-purple-700" },
  arte: { icon: Palette, solid: "bg-pink-500", pill: "bg-pink-100 text-pink-700" },
  musica: { icon: Music, solid: "bg-fuchsia-500", pill: "bg-fuchsia-100 text-fuchsia-700" },
  educazione_fisica: { icon: Dumbbell, solid: "bg-orange-600", pill: "bg-orange-100 text-orange-700" },
  educazione_civica: { icon: Scale, solid: "bg-indigo-500", pill: "bg-indigo-100 text-indigo-700" },
  religione: { icon: Church, solid: "bg-amber-600", pill: "bg-amber-100 text-amber-700" },
  tecnologia: { icon: Wrench, solid: "bg-slate-500", pill: "bg-slate-100 text-slate-700" },
  economia: { icon: TrendingUp, solid: "bg-emerald-600", pill: "bg-emerald-100 text-emerald-700" },
  diritto: { icon: Gavel, solid: "bg-indigo-600", pill: "bg-indigo-100 text-indigo-700" },
  altro: { icon: HelpCircle, solid: "bg-slate-400", pill: "bg-slate-100 text-slate-600" },
};

export function getSubjectVisual(slug: string | null | undefined): SubjectVisual {
  if (!slug) return DEFAULT;
  return MAP[slug] ?? DEFAULT;
}
