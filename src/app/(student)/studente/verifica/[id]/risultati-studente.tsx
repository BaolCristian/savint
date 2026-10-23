"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Clock, Dumbbell, Trophy } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
import { formattaPunti } from "@/components/esercizi/verifica/data-verifica";
import { RevisioneEsercizio } from "@/components/esercizi/verifica/revisione-esercizio";
// Solo il tipo: risultati-verifica.ts legge il database e non entra nel bundle.
import type { RisultatiStudente as Dati } from "@/lib/esercizi/risultati-verifica";

/**
 * I risultati della verifica per lo studente, solo quando la SUA prova è
 * pubblicata (`risultati` null altrimenti: «Risultati non ancora
 * pubblicati»). Il totale è quello finale, sulla scala della verifica
 * completa; per ogni esercizio i punti, la revisione con correzione,
 * risposta attesa e svolgimento, e il link per allenarsi di nuovo (pratica
 * libera, senza effetti sulla verifica). Niente uscite, niente misure.
 */
export function RisultatiStudente({ risultati, locale }: { risultati: Dati | null; locale: "it" | "en" }) {
  const t = useTranslations("esercizi.verifica.risultati.studente");
  const f = (n: number) => formattaPunti(n, locale);

  if (!risultati) {
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-brand-blue/15 bg-brand-blue/5 p-6 sm:p-8">
          <Clock aria-hidden="true" className="mb-4 size-11 text-brand-blue" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("nonPubblicati")}</h1>
          <p className="text-slate-700">{t("nonPubblicatiSpiegazione")}</p>
        </div>
        <div className="p-6 sm:p-8">
          <Link href="/studente" className={`${buttonVariants()} min-h-11 w-full rounded-xl sm:w-auto`}>
            {t("tornaHome")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-2 border-b border-brand-green/20 bg-brand-green/5 p-6 sm:p-8">
          <Trophy aria-hidden="true" className="mb-3 size-10 text-brand-green" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("titolo")}</h1>
          <p className="text-xl font-semibold text-slate-900">
            {t("totale", { finale: f(risultati.finale), totalePieno: f(risultati.totalePieno), percentuale: f(risultati.percentuale) })}
          </p>
        </div>
        <div className="p-6 sm:p-8">
          <Link href="/studente" className={`${buttonVariants({ variant: "outline" })} min-h-11 rounded-xl`}>
            {t("tornaHome")}
          </Link>
        </div>
      </header>

      {risultati.esercizi.map((e) => (
        <section key={e.numero} aria-labelledby={`esercizio-${e.numero}`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id={`esercizio-${e.numero}`} className="text-lg font-semibold text-slate-900">
              {t("esercizio", { numero: e.numero, punti: f(e.punti), puntiMax: f(e.puntiMax) })}
            </h2>
            <Link
              href={`/studente/esercizio/${e.esercizioId}`}
              title={t("esercitatiAiuto")}
              className={`${buttonVariants({ variant: "outline", size: "sm" })} gap-2`}
            >
              <Dumbbell aria-hidden="true" className="size-4" />
              {t("esercitati")}
            </Link>
          </div>
          <RevisioneEsercizio seed={e.seed} content={e.content} state={e.state} locale={locale} />
        </section>
      ))}
    </div>
  );
}
