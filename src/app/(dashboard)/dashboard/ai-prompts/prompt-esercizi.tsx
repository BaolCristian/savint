"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy, FileUp, Sparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { promptEsercizi } from "@/lib/esercizi/importa/prompt";

/** Le classi della secondaria di secondo grado: diventano `meta.anno`. */
const CLASSI = [1, 2, 3, 4, 5] as const;

const QUANTI_MIN = 1;
const QUANTI_MAX = 30;
const QUANTI_DI_PARTENZA = 5;

/** `promptEsercizi` non controlla i limiti: lo fa la scheda. Un campo vuoto
 * o illeggibile vale il minimo, così il prompt mostrato è sempre sensato. */
function quantiNeiLimiti(valore: string): number {
  const n = Math.trunc(Number(valore));
  if (valore.trim() === "" || !Number.isFinite(n)) return QUANTI_MIN;
  return Math.min(QUANTI_MAX, Math.max(QUANTI_MIN, n));
}

const CLASSE_CAMPO =
  "w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500";

/** La scheda "Esercizi" della pagina Prompt IA: il docente sceglie argomento,
 * classe e quanti esercizi, copia il prompt per un'IA esterna e poi importa
 * il JSON che ne esce dalla pagina di import della redazione. */
export function PromptEsercizi() {
  const t = useTranslations("ai.esercizi");
  const locale = useLocale() === "en" ? "en" : "it";

  const [argomento, setArgomento] = useState("");
  const [classe, setClasse] = useState(1);
  // Il campo tiene il testo scritto (si può svuotarlo per riscriverlo);
  // il prompt usa sempre il numero riportato fra 1 e 30.
  const [quantiTesto, setQuantiTesto] = useState(String(QUANTI_DI_PARTENZA));
  const [copia, setCopia] = useState<"no" | "fatta" | "fallita">("no");

  const quanti = quantiNeiLimiti(quantiTesto);
  const testoPrompt = useMemo(
    () =>
      promptEsercizi(
        { argomento: argomento.trim() || t("argomentoSegnaposto"), classe, quanti },
        locale,
      ),
    [argomento, classe, quanti, locale, t],
  );

  async function copiaPrompt() {
    try {
      await navigator.clipboard.writeText(testoPrompt);
      setCopia("fatta");
    } catch {
      // Appunti negati dal browser (permessi, pagina non sicura): lo si dice,
      // come nella pagina di import, invece di far credere di aver copiato.
      setCopia("fallita");
    }
    setTimeout(() => setCopia("no"), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <Sparkles className="size-4 text-amber-500" />
          {t("titolo")}
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("istruzioni")}</p>

        <div className="space-y-1.5">
          <label
            htmlFor="esercizi-argomento"
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {t("argomento")}
          </label>
          <input
            id="esercizi-argomento"
            type="text"
            value={argomento}
            onChange={(e) => setArgomento(e.target.value)}
            placeholder={t("argomentoPlaceholder")}
            className={CLASSE_CAMPO}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="esercizi-classe"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t("classe")}
            </label>
            <select
              id="esercizi-classe"
              value={classe}
              onChange={(e) => setClasse(Number(e.target.value))}
              className={CLASSE_CAMPO}
            >
              {CLASSI.map((anno) => (
                <option key={anno} value={anno}>
                  {t("classeOpzione", { anno })}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="esercizi-quanti"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {t("quanti")}
            </label>
            <input
              id="esercizi-quanti"
              type="number"
              inputMode="numeric"
              min={QUANTI_MIN}
              max={QUANTI_MAX}
              step={1}
              value={quantiTesto}
              onChange={(e) => setQuantiTesto(e.target.value)}
              onBlur={() => setQuantiTesto(String(quanti))}
              aria-describedby="esercizi-quanti-aiuto"
              className={CLASSE_CAMPO}
            />
            <p id="esercizi-quanti-aiuto" className="text-xs text-slate-500 dark:text-slate-400">
              {t("quantiAiuto")}
            </p>
          </div>
        </div>
      </div>

      <div className="relative">
        <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1">
          <Button variant="outline" size="sm" onClick={copiaPrompt} className="bg-white dark:bg-slate-800">
            {copia === "fatta" ? (
              <>
                <Check className="size-4 mr-1.5 text-emerald-600" />
                {t("copiato")}
              </>
            ) : (
              <>
                <Copy className="size-4 mr-1.5" />
                {t("copia")}
              </>
            )}
          </Button>
          {copia === "fallita" && <p className="text-xs text-destructive">{t("copiaNonRiuscita")}</p>}
        </div>
        <pre
          data-testid="prompt-esercizi"
          className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 pr-28 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[60vh] overflow-y-auto"
        >
          {testoPrompt}
        </pre>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Link href="/dashboard/esercizi/redazione/importa" className={buttonVariants({ variant: "outline" })}>
          <FileUp className="size-4 mr-2" />
          {t("importa")}
        </Link>
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("importaSuggerimento")}</p>
      </div>
    </div>
  );
}
