import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, BarChart3, CheckCircle2, GraduationCap, Presentation, Shuffle } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { isHubMode } from "@/lib/config/savint-mode";
import { withBasePath } from "@/lib/base-path";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("eserciziIngresso");
  return { title: t("metaTitle") };
}

/** Senza accesso si passa dal login, che poi porta alla pagina giusta. */
function ingresso(destinazione: string, connesso: boolean): string {
  return connesso ? destinazione : `/login?callbackUrl=${encodeURIComponent(destinazione)}`;
}

/**
 * La porta d'ingresso agli esercizi per studenti e docenti: spiega cosa sono
 * e manda ciascuno alla sua area. Il ruolo lo decide comunque il login, non
 * la scheda scelta: uno studente che sceglie "docente" finisce nei suoi compiti.
 */
export default async function EserciziIngressoPage() {
  // Il sito principale non ha classi né studenti.
  if (isHubMode()) notFound();

  const t = await getTranslations("eserciziIngresso");
  const session = await auth();
  const connesso = Boolean(session?.user?.id);

  const punti = [
    { icona: Shuffle, testo: t("featureNumbers") },
    { icona: CheckCircle2, testo: t("featureFeedback") },
    { icona: BarChart3, testo: t("featureResults") },
  ];
  const schede = [
    {
      icona: GraduationCap,
      titolo: t("studentTitle"),
      testo: t("studentText"),
      nota: t("studentCode"),
      azione: t("studentAction"),
      href: ingresso("/studente", connesso),
      colore: "bg-brand-blue hover:bg-brand-blue/90",
      sfondoIcona: "bg-brand-blue/10 text-brand-blue",
    },
    {
      icona: Presentation,
      titolo: t("teacherTitle"),
      testo: t("teacherText"),
      nota: null,
      azione: t("teacherAction"),
      href: ingresso("/dashboard/esercizi", connesso),
      colore: "bg-brand-orange hover:bg-brand-orange/90",
      sfondoIcona: "bg-brand-orange/10 text-brand-orange",
    },
  ];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-brand-blue-50 via-background to-brand-magenta-50 px-4 py-10 sm:py-16">
      <main className="mx-auto max-w-4xl space-y-10">
        <header className="space-y-4 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <img src={withBasePath("/logo_savint.png")} alt="" className="h-12 w-12 object-contain" />
            <span className="bg-gradient-to-r from-brand-blue via-brand-orange to-brand-magenta bg-clip-text text-2xl font-black tracking-wider text-transparent">
              SAVINT
            </span>
          </Link>
          <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{t("title")}</h1>
          <p className="mx-auto max-w-2xl text-base text-slate-600 sm:text-lg">{t("intro")}</p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 pt-2 text-sm font-medium text-slate-700">
            {punti.map(({ icona: Icona, testo }) => (
              <li key={testo} className="inline-flex items-center gap-2">
                <Icona aria-hidden="true" className="size-4 text-brand-green" />
                {testo}
              </li>
            ))}
          </ul>
        </header>

        {connesso && session?.user?.name && (
          <p className="text-center text-sm text-slate-500">{t("signedInAs", { name: session.user.name })}</p>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {schede.map(({ icona: Icona, ...s }, i) => (
            <section
              key={s.titolo}
              aria-labelledby={`scheda-${i}`}
              className="flex flex-col rounded-3xl border border-white/80 bg-white/70 p-6 shadow-xl shadow-slate-200/50 backdrop-blur-xl sm:p-8"
            >
              <span className={`mb-4 inline-flex size-12 items-center justify-center rounded-2xl ${s.sfondoIcona}`}>
                <Icona aria-hidden="true" className="size-6" />
              </span>
              <h2 id={`scheda-${i}`} className="text-xl font-bold text-slate-900">{s.titolo}</h2>
              <p className="mt-2 text-slate-600">{s.testo}</p>
              {s.nota && <p className="mt-2 text-sm text-slate-500">{s.nota}</p>}
              <div className="flex-1" />
              <Link
                href={s.href}
                className={`mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-6 font-bold text-white shadow-md transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-blue/30 ${s.colore}`}
              >
                {s.azione}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </section>
          ))}
        </div>

        <p className="text-center text-sm text-slate-500">
          {t("quizPrompt")}{" "}
          <Link href="/" className="font-semibold text-brand-blue hover:text-blue-800">
            {t("quizAction")}
          </Link>
        </p>
      </main>
    </div>
  );
}
