"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

export type StatoCatalogo = "notStarted" | "inProgress" | "completed";

export type EsercizioCatalogo = {
  id: string;
  title: string;
  yearLevel: number;
  topic: string;
  difficulty: number;
  status: StatoCatalogo;
  dettaglioTentativo?: string;
};

function chiaveTesto(value: string) {
  return value.toLocaleLowerCase();
}

export function CatalogoEsercizi({ esercizi }: { esercizi: EsercizioCatalogo[] }) {
  const t = useTranslations("studentExercisesUi");
  const [ricerca, setRicerca] = useState("");
  const [argomento, setArgomento] = useState("");
  const [anno, setAnno] = useState("");
  const argomenti = useMemo(
    () => [...new Set(esercizi.map((e) => e.topic))].sort((a, b) => a.localeCompare(b)),
    [esercizi],
  );
  const anni = useMemo(() => [...new Set(esercizi.map((e) => e.yearLevel))].sort((a, b) => a - b), [esercizi]);
  const filtrati = useMemo(() => {
    const testo = chiaveTesto(ricerca.trim());
    return esercizi.filter((e) =>
      (!testo || chiaveTesto(`${e.title} ${e.topic}`).includes(testo)) &&
      (!argomento || e.topic === argomento) &&
      (!anno || e.yearLevel === Number(anno)),
    );
  }, [anno, argomento, esercizi, ricerca]);

  const azzera = () => {
    setRicerca("");
    setArgomento("");
    setAnno("");
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
          <span className="sr-only">{t("catalogSearch")}</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={ricerca}
            onChange={(event) => setRicerca(event.target.value)}
            placeholder={t("catalogSearch")}
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20"
          />
        </label>
        <label className="sr-only" htmlFor="catalogo-argomento">{t("catalogTopic")}</label>
        <select
          id="catalogo-argomento"
          value={argomento}
          onChange={(event) => setArgomento(event.target.value)}
          className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20"
        >
          <option value="">{t("catalogAllTopics")}</option>
          {argomenti.map((voce) => <option key={voce} value={voce}>{voce}</option>)}
        </select>
        <label className="sr-only" htmlFor="catalogo-anno">{t("catalogYear")}</label>
        <select
          id="catalogo-anno"
          value={anno}
          onChange={(event) => setAnno(event.target.value)}
          className="h-9 min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus-visible:border-brand-blue focus-visible:ring-3 focus-visible:ring-brand-blue/20"
        >
          <option value="">{t("catalogAllYears")}</option>
          {anni.map((voce) => <option key={voce} value={voce}>{t("catalogYearValue", { year: voce })}</option>)}
        </select>
      </div>

      {filtrati.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center">
          <p className="font-medium text-slate-800">{t("catalogNoMatches")}</p>
          <button type="button" onClick={azzera} className="mt-2 text-sm font-medium text-brand-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">
            {t("catalogReset")}
          </button>
        </div>
      ) : (
        <ul className="grid gap-2">
          {filtrati.map((e) => (
            <li key={e.id}>
              <Link href={`/studente/esercizio/${e.id}`} className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 transition hover:border-brand-blue/30 hover:bg-brand-blue/5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand-blue/30">
                <span className="min-w-0">
                  <span className="block line-clamp-2 font-semibold text-slate-900">{e.title}</span>
                  <span className="block text-sm text-slate-500">{t("catalogMetadata", { year: e.yearLevel, topic: e.topic, difficulty: e.difficulty })}</span>
                  {e.dettaglioTentativo && <span className="block text-sm font-medium text-brand-blue">{e.dettaglioTentativo}</span>}
                </span>
                <span className="shrink-0 text-sm font-medium text-brand-blue">{t(e.status === "inProgress" ? "continue" : e.status === "completed" ? "practiceAgain" : "start")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
