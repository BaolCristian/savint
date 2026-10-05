"use client";

import { useContext, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { percentuali, valutaDiagramma, type DatiDiagramma, type SpecificaDiagramma } from "@/lib/esercizi/diagrammi";
import { passoEtichette } from "@/lib/esercizi/grafici";
import { ScopeGrafici } from "./grafico-funzione";

const LARGHEZZA = 400;
const ALTEZZA = 300;

/** Colori delle fette: distinti anche per chi non distingue bene il rosso
 * dal verde (blu e arancio per primi), e la legenda dice comunque etichetta
 * e percentuale a parole. */
const COLORI = ["#2563eb", "#f97316", "#059669", "#9333ea", "#eab308", "#0ea5e9", "#e11d48", "#64748b", "#84cc16", "#0d9488"];

function accorcia(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Un grafico statistico — barre, istogramma o torta — con i dati dello
 * studente (vedi src/lib/esercizi/diagrammi.ts). Senza la domanda caricata
 * (l'eco dell'editor) mostra un segnaposto. */
export function DiagrammaStatistico({ specifica }: { specifica: SpecificaDiagramma }) {
  const scope = useContext(ScopeGrafici);
  const t = useTranslations("esercizi.diagramma");
  const locale = useLocale();
  const formato = (n: number, decimali = 2) =>
    n.toLocaleString(locale === "en" ? "en-GB" : "it-IT", { maximumFractionDigits: decimali });
  const nomeTipo = t(specifica.tipo);

  const dati = useMemo<DatiDiagramma | "errore" | null>(() => {
    if (!scope) return null;
    try {
      return valutaDiagramma(scope, specifica);
    } catch {
      return "errore";
    }
  }, [scope, specifica]);

  if (!scope) {
    return (
      <span className="my-2 block rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {t("segnaposto", { tipo: nomeTipo, valori: specifica.valori })}
      </span>
    );
  }
  if (dati === "errore" || dati === null) {
    return <span className="my-2 block text-sm text-destructive">{t("errore")}</span>;
  }

  const elenco = dati.etichette.map((e, i) => `${e} ${formato(dati.valori[i]!)}`).join(", ");
  const descrizione = t("descrizione", { tipo: nomeTipo, elenco });
  const classe = "my-3 block h-auto w-full max-w-md rounded-md border border-slate-200 bg-white";

  if (specifica.tipo === "torta") {
    const cx = 130;
    const cy = ALTEZZA / 2;
    const r = 110;
    const quote = percentuali(dati.valori);
    // Gli angoli di inizio di ogni fetta, calcolati prima del disegno: dalla
    // cima del cerchio, in senso orario.
    const inizi = quote.map((_, i) => -Math.PI / 2 + (quote.slice(0, i).reduce((a, b) => a + b, 0) / 100) * 2 * Math.PI);
    return (
      <svg role="img" aria-label={descrizione} viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`} className={classe}>
        {dati.valori.map((_, i) => {
          const ampiezza = (quote[i]! / 100) * 2 * Math.PI;
          const da = inizi[i]!;
          const a = da + ampiezza;
          const colore = COLORI[i % COLORI.length]!;
          // Una fetta che è tutto il cerchio: un arco da un punto a se stesso
          // non si disegna, serve un cerchio.
          if (quote[i]! >= 99.9999) {
            return <circle key={i} data-fetta cx={cx} cy={cy} r={r} fill={colore} />;
          }
          const grande = ampiezza > Math.PI ? 1 : 0;
          const d =
            `M${cx},${cy} L${(cx + r * Math.cos(da)).toFixed(2)},${(cy + r * Math.sin(da)).toFixed(2)} ` +
            `A${r},${r} 0 ${grande} 1 ${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)} Z`;
          return <path key={i} data-fetta d={d} fill={colore} stroke="#ffffff" strokeWidth={1.5} />;
        })}
        <g fontSize={12} className="fill-slate-700">
          {dati.etichette.map((e, i) => {
            const y = 30 + i * Math.min(24, (ALTEZZA - 40) / dati.etichette.length);
            return (
              <g key={i}>
                <rect x={260} y={y - 10} width={12} height={12} rx={2} fill={COLORI[i % COLORI.length]} />
                <text x={278} y={y}>{`${accorcia(e, 12)} ${formato(quote[i]!, 1)} %`}</text>
              </g>
            );
          })}
        </g>
      </svg>
    );
  }

  // Barre e istogramma: un asse delle y da zero a un valore comodo, una
  // barra per valore; l'istogramma le tiene attaccate.
  const sinistra = 40;
  const basso = 36;
  const alto = 10;
  const w = LARGHEZZA - sinistra - 10;
  const h = ALTEZZA - basso - alto;
  const massimo = Math.max(...dati.valori);
  // Dati interi (conteggi, frequenze): mai tacche a mezze unità.
  const interi = dati.valori.every((v) => Number.isInteger(v));
  const passo = interi ? Math.max(1, passoEtichette(massimo)) : passoEtichette(massimo);
  const cima = Math.ceil(massimo / passo) * passo || 1;
  const py = (v: number) => alto + (1 - v / cima) * h;
  const banda = w / dati.valori.length;
  const larghezzaBarra = specifica.tipo === "istogramma" ? banda : banda * 0.65;
  const scarto = (banda - larghezzaBarra) / 2;
  const tacche: number[] = [];
  for (let v = 0; v <= cima + 1e-9; v += passo) tacche.push(Number(v.toPrecision(12)));
  const lunghezzaEtichetta = Math.max(3, Math.floor(banda / 7));

  return (
    <svg role="img" aria-label={descrizione} viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`} className={classe}>
      <g stroke="#e2e8f0" strokeWidth={1}>
        {tacche.map((v) => <line key={v} x1={sinistra} x2={sinistra + w} y1={py(v)} y2={py(v)} />)}
      </g>
      <g fontSize={11} className="fill-slate-600">
        {tacche.map((v) => (
          <text key={v} x={sinistra - 5} y={py(v) + 4} textAnchor="end">{formato(v)}</text>
        ))}
      </g>
      {dati.valori.map((v, i) => (
        <rect
          key={i}
          data-barra
          x={sinistra + i * banda + scarto}
          y={py(v)}
          width={larghezzaBarra}
          height={py(0) - py(v)}
          fill="#2563eb"
          stroke={specifica.tipo === "istogramma" ? "#ffffff" : "none"}
          strokeWidth={1}
        />
      ))}
      <line x1={sinistra} x2={sinistra + w} y1={py(0)} y2={py(0)} stroke="#64748b" strokeWidth={1.5} />
      <g fontSize={11} className="fill-slate-700">
        {dati.etichette.map((e, i) => (
          <text key={i} x={sinistra + i * banda + banda / 2} y={ALTEZZA - basso + 18} textAnchor="middle">
            {accorcia(e, lunghezzaEtichetta)}
          </text>
        ))}
      </g>
    </svg>
  );
}
