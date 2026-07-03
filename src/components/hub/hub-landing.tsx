import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { withBasePath } from "@/lib/base-path";
import { searchHubQuizzes, type SearchResultItem } from "@/lib/hub/search";
import { HubQuizCard } from "@/components/hub/hub-quiz-card";

const WHY_CARDS = [
  { emoji: "🔓", titleKey: "whyOpenTitle", bodyKey: "whyOpenBody", tint: "bg-brand-blue-50", accent: "text-brand-blue" },
  { emoji: "🆓", titleKey: "whyFreeTitle", bodyKey: "whyFreeBody", tint: "bg-brand-green-50", accent: "text-brand-green" },
  { emoji: "🏫", titleKey: "whySchoolTitle", bodyKey: "whySchoolBody", tint: "bg-brand-orange-50", accent: "text-brand-orange" },
  { emoji: "🤝", titleKey: "whyShareTitle", bodyKey: "whyShareBody", tint: "bg-brand-magenta-50", accent: "text-brand-magenta" },
] as const;

const HOW_STEPS = [
  { n: 1, titleKey: "howStep1Title", bodyKey: "howStep1Body", circle: "bg-brand-blue" },
  { n: 2, titleKey: "howStep2Title", bodyKey: "howStep2Body", circle: "bg-brand-orange" },
  { n: 3, titleKey: "howStep3Title", bodyKey: "howStep3Body", circle: "bg-brand-green" },
] as const;

const REGISTER_PERKS = [
  { titleKey: "registerPublishTitle", bodyKey: "registerPublishBody" },
  { titleKey: "registerProfileTitle", bodyKey: "registerProfileBody" },
  { titleKey: "registerSchoolTitle", bodyKey: "registerSchoolBody" },
] as const;

/* Le quattro forme delle tessere-risposta del gioco, come motivo decorativo
 * dell'hero: il linguaggio visivo del prodotto, non ornamento generico. */
const HERO_SHAPES = [
  { glyph: "▲", cls: "text-brand-blue top-12 left-[7%] rotate-12" },
  { glyph: "◆", cls: "text-brand-orange top-40 right-[8%] -rotate-12" },
  { glyph: "●", cls: "text-brand-magenta bottom-14 left-[12%]" },
  { glyph: "■", cls: "text-brand-green bottom-28 right-[14%] rotate-[30deg]" },
] as const;

const HERO_WORD_COLORS = ["text-brand-blue", "text-brand-orange", "text-brand-magenta"] as const;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand-blue mb-2">
      {children}
    </p>
  );
}

export async function HubLanding() {
  const t = await getTranslations("hubHome");

  let featured: SearchResultItem[] = [];
  let totalQuizzes = 0;
  try {
    const res = await searchHubQuizzes({ sort: "popular", page: 1, perPage: 6 });
    featured = res.items;
    totalQuizzes = res.total;
  } catch {
    featured = [];
  }

  // "Crea, gioca, condividi" → una parola per colore brand (come il wordmark)
  const heroWords = t("heroTitle").split(", ");
  const triColor = heroWords.length === HERO_WORD_COLORS.length;

  return (
    <main className="min-h-dvh bg-gradient-to-br from-brand-blue-50 via-background to-brand-magenta-50">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="pointer-events-none select-none absolute inset-0 hidden md:block">
          {HERO_SHAPES.map((s) => (
            <span key={s.glyph} className={`absolute text-8xl font-black opacity-[0.08] ${s.cls}`}>
              {s.glyph}
            </span>
          ))}
        </div>

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-12 text-center">
          <img
            src={withBasePath("/logo_savint.png")}
            alt="SAVINT"
            className="mx-auto mb-6 h-28 w-28 sm:h-36 sm:w-36 object-contain drop-shadow-sm"
          />
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-slate-900 mb-5">
            {triColor
              ? heroWords.map((w, i) => (
                  <span key={i}>
                    <span className={HERO_WORD_COLORS[i]}>{w}</span>
                    {i < heroWords.length - 1 ? ", " : ""}
                  </span>
                ))
              : t("heroTitle")}
          </h1>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto mb-8 leading-relaxed">
            {t("heroSubtitle")}
          </p>

          {/* Barra di ricerca a pillola */}
          <form
            action={withBasePath("/explore")}
            className="flex max-w-xl mx-auto items-center gap-1.5 rounded-full border-2 border-slate-200 bg-white p-1.5 shadow-lg shadow-brand-blue/5 focus-within:border-brand-blue transition-colors"
          >
            <input
              type="search"
              name="q"
              aria-label={t("searchPlaceholder")}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 bg-transparent px-4 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="submit"
              className="shrink-0 rounded-full bg-brand-blue px-6 sm:px-7 py-2.5 font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {t("searchButton")}
            </button>
          </form>

          <div className="mt-6 flex justify-center gap-3 text-sm">
            <Link
              href={withBasePath("/explore")}
              className="rounded-full bg-brand-blue px-5 py-2.5 font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              {t("browseAll")}
            </Link>
            <Link
              href={withBasePath("/hub-register")}
              className="rounded-full border border-brand-orange/40 px-5 py-2.5 font-semibold text-brand-orange hover:bg-brand-orange-50 transition-colors"
            >
              {t("signUp")}
            </Link>
          </div>

          {/* Chip di fiducia */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-blue" aria-hidden />
              {t("chipLicense")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-green" aria-hidden />
              {t("chipFree")}
            </span>
            {totalQuizzes > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-magenta" aria-hidden />
                {t("chipQuizCount", { count: totalQuizzes })}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── Perché SAVINT ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
        <Eyebrow>{t("eyebrowWhy")}</Eyebrow>
        <h2 className="text-3xl font-black text-slate-900 mb-6">{t("whyTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {WHY_CARDS.map((card) => (
            <div
              key={card.titleKey}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md hover:border-brand-blue/30"
            >
              <div className="flex items-center gap-3 mb-3">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${card.tint}`}
                  aria-hidden
                >
                  {card.emoji}
                </span>
                <h3 className={`text-lg font-bold ${card.accent}`}>{t(card.titleKey)}</h3>
              </div>
              <p className="text-slate-600 leading-relaxed">{t(card.bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Come funziona ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <Eyebrow>{t("eyebrowHow")}</Eyebrow>
        <h2 className="text-3xl font-black text-slate-900 mb-6">{t("howTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {HOW_STEPS.map((step) => (
            <div key={step.n} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <span
                className={`mb-4 flex h-11 w-11 items-center justify-center rounded-full ${step.circle} text-lg font-black text-white`}
                aria-hidden
              >
                {step.n}
              </span>
              <h3 className="font-bold text-slate-900 mb-1.5">{t(step.titleKey)}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{t(step.bodyKey)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Perché registrarsi ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
        <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <Eyebrow>{t("eyebrowRegister")}</Eyebrow>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 mb-2">{t("registerTitle")}</h2>
            <p className="text-slate-600 mb-4">{t("registerIntro")}</p>
            <ul className="space-y-2.5">
              {REGISTER_PERKS.map((perk) => (
                <li key={perk.titleKey} className="flex items-start gap-2.5">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-xs font-black text-brand-green"
                    aria-hidden
                  >
                    ✓
                  </span>
                  <p className="text-slate-700">
                    <strong className="text-slate-900">{t(perk.titleKey)}</strong> — {t(perk.bodyKey)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:pl-8 md:border-l md:border-slate-200">
            <Link
              href={withBasePath("/hub-register")}
              className="inline-block w-full rounded-xl bg-brand-blue px-8 py-3.5 text-center font-bold text-white hover:bg-blue-700 transition-colors"
            >
              {t("registerCta")}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Quiz in evidenza ── */}
      {featured.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <Eyebrow>{t("eyebrowFeatured")}</Eyebrow>
          <h2 className="text-3xl font-black text-slate-900 mb-6">{t("featuredTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((q) => (
              <HubQuizCard key={q.id} item={q} />
            ))}
          </div>
        </section>
      )}

      {/* ── Porta SAVINT a scuola ── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-14">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue to-brand-magenta p-8 sm:p-10 text-white">
          <img
            src={withBasePath("/logo_savint.png")}
            alt=""
            aria-hidden
            className="pointer-events-none absolute -right-6 -bottom-8 hidden h-48 w-48 rotate-[-8deg] object-contain opacity-20 md:block"
          />
          <div className="relative max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70 mb-2">
              {t("eyebrowSchool")}
            </p>
            <h2 className="text-2xl sm:text-3xl font-black mb-2">{t("schoolTitle")}</h2>
            <p className="text-white/85 mb-5">{t("schoolBody")}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={withBasePath("/demo")}
                className="rounded-xl bg-white px-5 py-2.5 font-semibold text-brand-blue hover:bg-slate-100 transition-colors"
              >
                {t("tryItButton")}
              </Link>
              <Link
                href={withBasePath("/install")}
                className="rounded-xl border border-white/40 px-5 py-2.5 font-semibold text-white hover:bg-white/10 transition-colors"
              >
                {t("installCta")}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-200 bg-white/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2.5">
              <img src={withBasePath("/logo_savint.png")} alt="" aria-hidden className="h-8 w-8 object-contain" />
              <span className="bg-gradient-to-r from-brand-blue to-brand-magenta bg-clip-text text-base font-extrabold text-transparent">
                SAVINT
              </span>
            </div>
            <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-slate-600">
              <Link href={withBasePath("/explore")} className="hover:text-brand-blue transition-colors">
                {t("browseAll")}
              </Link>
              <Link href={withBasePath("/install")} className="hover:text-brand-blue transition-colors">
                {t("installCta")}
              </Link>
              <a
                href="https://github.com/BaolCristian/savint"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand-blue transition-colors"
              >
                GitHub
              </a>
              <Link href={withBasePath("/privacy")} className="hover:text-brand-blue transition-colors">
                {t("footerPrivacy")}
              </Link>
              <Link href={withBasePath("/terms")} className="hover:text-brand-blue transition-colors">
                {t("footerTerms")}
              </Link>
              <Link href={withBasePath("/help")} className="hover:text-brand-blue transition-colors">
                {t("footerHelp")}
              </Link>
            </nav>
          </div>
          <p className="mt-6 text-center text-xs text-slate-400">{t("footer")}</p>
        </div>
      </footer>
    </main>
  );
}
