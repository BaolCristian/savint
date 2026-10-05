"use client";

import { createContext, useContext, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { jme } from "@savint/engine";
import {
  campiona,
  limitiAutomatici,
  passoEtichette,
  passoGriglia,
  tratti,
  type SpecificaGrafico,
} from "@/lib/esercizi/grafici";

/** Lo scope della domanda che lo studente sta risolvendo: le SUE variabili.
 * Lo fornisce il player; dove manca (l'eco «Come si vedrà» dell'editor, che
 * non carica la domanda) il grafico mostra un segnaposto. */
export const ScopeGrafici = createContext<jme.Scope | null>(null);

const LARGHEZZA = 400;
const ALTEZZA = 300;
const MARGINE_SINISTRO = 34;
const MARGINE_BASSO = 22;
const MARGINE = 8;

function multipli(da: number, a: number, passo: number): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(da / passo - 1e-9) * passo; v <= a + 1e-9; v += passo) {
    out.push(Number(v.toPrecision(12)));
  }
  return out;
}

/** Il grafico di una funzione, disegnato con i numeri dello studente. */
export function GraficoFunzione({ specifica }: { specifica: SpecificaGrafico }) {
  const scope = useContext(ScopeGrafici);
  const t = useTranslations("esercizi.grafico");
  const locale = useLocale();
  const numero = (n: number) => n.toLocaleString(locale === "en" ? "en-GB" : "it-IT", { maximumFractionDigits: 3 });
  const [x0, x1] = specifica.x;

  const disegno = useMemo(() => {
    if (!scope) return null;
    try {
      const punti = campiona(scope, specifica.espressione, specifica.x);
      const y = specifica.y ?? limitiAutomatici(punti);
      return { punti, y, tratti: tratti(punti, y) };
    } catch {
      return "errore" as const;
    }
  }, [scope, specifica]);

  if (!scope) {
    return (
      <span className="my-2 block rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {t("segnaposto", { espressione: specifica.espressione, da: numero(x0), a: numero(x1) })}
      </span>
    );
  }
  if (disegno === "errore" || disegno === null) {
    return <span className="my-2 block text-sm text-destructive">{t("errore")}</span>;
  }

  const [y0, y1] = disegno.y;
  const w = LARGHEZZA - MARGINE_SINISTRO - MARGINE;
  const h = ALTEZZA - MARGINE_BASSO - MARGINE;
  const px = (x: number) => MARGINE_SINISTRO + ((x - x0) / (x1 - x0)) * w;
  const py = (y: number) => MARGINE + (1 - (y - y0) / (y1 - y0)) * h;
  const passoX = passoGriglia(x1 - x0);
  const passoY = passoGriglia(y1 - y0);
  const grigliaX = multipli(x0, x1, passoX);
  const grigliaY = multipli(y0, y1, passoY);
  const etichetteX = multipli(x0, x1, passoEtichette(x1 - x0));
  const etichetteY = multipli(y0, y1, passoEtichette(y1 - y0));
  const asseX = y0 <= 0 && y1 >= 0 ? py(0) : py(y0);
  const asseY = x0 <= 0 && x1 >= 0 ? px(0) : px(x0);
  const percorso = disegno.tratti
    .map((tratto) => tratto.map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(2)},${py(p.y!).toFixed(2)}`).join(""))
    .join("");
  const idTaglio = `taglio-${specifica.espressione.length}-${x0}-${x1}-${y0}-${y1}`.replace(/[^\w-]/g, "_");

  return (
    <svg
      role="img"
      aria-label={t("descrizione", { da: numero(x0), a: numero(x1) })}
      viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`}
      data-y-da={y0}
      data-y-a={y1}
      className="my-3 block h-auto w-full max-w-md rounded-md border border-slate-200 bg-white"
    >
      <defs>
        <clipPath id={idTaglio}>
          <rect x={MARGINE_SINISTRO} y={MARGINE} width={w} height={h} />
        </clipPath>
      </defs>
      <g className="stroke-slate-200" strokeWidth={1}>
        {grigliaX.map((v) => <line key={`gx${v}`} x1={px(v)} x2={px(v)} y1={MARGINE} y2={MARGINE + h} />)}
        {grigliaY.map((v) => <line key={`gy${v}`} x1={MARGINE_SINISTRO} x2={MARGINE_SINISTRO + w} y1={py(v)} y2={py(v)} />)}
      </g>
      <g className="stroke-slate-500" strokeWidth={1.5}>
        <line x1={MARGINE_SINISTRO} x2={MARGINE_SINISTRO + w} y1={asseX} y2={asseX} />
        <line x1={asseY} x2={asseY} y1={MARGINE} y2={MARGINE + h} />
      </g>
      <g className="fill-slate-600" fontSize={11}>
        {etichetteX.map((v) => (
          <text key={`tx${v}`} x={px(v)} y={ALTEZZA - 6} textAnchor="middle">{numero(v)}</text>
        ))}
        {etichetteY.map((v) => (
          <text key={`ty${v}`} x={MARGINE_SINISTRO - 4} y={py(v) + 4} textAnchor="end">{numero(v)}</text>
        ))}
      </g>
      <path
        d={percorso}
        data-curva
        data-punti={disegno.punti.length}
        clipPath={`url(#${idTaglio})`}
        fill="none"
        className="stroke-blue-600"
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
