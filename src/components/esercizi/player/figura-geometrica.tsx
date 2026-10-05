"use client";

import { useContext, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { valutaFigura, vertici, type DatiFigura, type SpecificaFigura, type TipoFigura, type Vertice } from "@/lib/esercizi/figure";
import { ScopeGrafici } from "./grafico-funzione";

const LARGHEZZA = 400;
const ALTEZZA = 300;
const BORDO = 46;

/** Le chiavi di traduzione del nome di ogni figura. */
const NOME: Record<TipoFigura, string> = {
  rettangolo: "rettangolo",
  quadrato: "quadrato",
  "triangolo rettangolo": "triangoloRettangolo",
  triangolo: "triangolo",
  cerchio: "cerchio",
};

/** Per ogni figura, quale lato porta ciascuna etichetta (indici dei vertici,
 * da→a) e come si chiama a parole (per la descrizione). */
const LATI: Record<Exclude<TipoFigura, "cerchio">, { lato: [number, number]; nome: string }[]> = {
  rettangolo: [{ lato: [0, 1], nome: "base" }, { lato: [1, 2], nome: "altezza" }],
  quadrato: [{ lato: [0, 1], nome: "lato" }],
  "triangolo rettangolo": [
    { lato: [0, 1], nome: "cateto" },
    { lato: [2, 0], nome: "cateto" },
    { lato: [1, 2], nome: "ipotenusa" },
  ],
  triangolo: [{ lato: [0, 1], nome: "lato" }, { lato: [1, 2], nome: "lato" }, { lato: [2, 0], nome: "lato" }],
};

/** Una figura geometrica in scala con le misure dello studente (vedi
 * src/lib/esercizi/figure.ts). Senza la domanda caricata (l'eco
 * dell'editor) mostra un segnaposto. */
export function FiguraGeometrica({ specifica }: { specifica: SpecificaFigura }) {
  const scope = useContext(ScopeGrafici);
  const t = useTranslations("esercizi.figura");
  const locale = useLocale();
  const formato = (n: number) => n.toLocaleString(locale === "en" ? "en-GB" : "it-IT", { maximumFractionDigits: 2 });
  const nomeTipo = t(NOME[specifica.tipo]);

  const dati = useMemo<DatiFigura | "errore" | null>(() => {
    if (!scope) return null;
    try {
      return valutaFigura(scope, specifica);
    } catch {
      return "errore";
    }
  }, [scope, specifica]);

  if (!scope) {
    return (
      <span className="my-2 block rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600">
        {t("segnaposto", { tipo: nomeTipo, misure: specifica.misure.join(", ") })}
      </span>
    );
  }
  if (dati === "errore" || dati === null) {
    return <span className="my-2 block text-sm text-destructive">{t("errore")}</span>;
  }

  const testo = (i: number) =>
    specifica.incognite.includes(i + 1) ? "?" : `${formato(dati.etichette[i]!)}${specifica.unita ? ` ${specifica.unita}` : ""}`;
  const classe = "my-3 block h-auto w-full max-w-md rounded-md border border-slate-200 bg-white";

  if (specifica.tipo === "cerchio") {
    const cx = LARGHEZZA / 2;
    const cy = ALTEZZA / 2;
    const r = ALTEZZA / 2 - BORDO;
    const etichetta = specifica.incognite.includes(1) ? "r = ?" : `r = ${testo(0)}`;
    return (
      <svg role="img" aria-label={t("descrizione", { tipo: nomeTipo, misure: `${t("raggio")} ${testo(0)}` })} viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`} className={classe}>
        <circle data-figura cx={cx} cy={cy} r={r} fill="#dbeafe" stroke="#2563eb" strokeWidth={2.5} />
        <line x1={cx} y1={cy} x2={cx + r} y2={cy} stroke="#1e3a8a" strokeWidth={1.5} strokeDasharray="5 4" />
        <circle cx={cx} cy={cy} r={3} fill="#1e3a8a" />
        <text x={cx + r / 2} y={cy - 8} textAnchor="middle" fontSize={14} className="fill-slate-800">{etichetta}</text>
      </svg>
    );
  }

  // Poligono: i vertici in unità, poi in scala dentro il riquadro, con la y
  // verso il basso come vuole l'SVG.
  const v = vertici(specifica.tipo, dati.misure);
  const xs = v.map((p) => p.x);
  const ys = v.map((p) => p.y);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scala = Math.min((LARGHEZZA - 2 * BORDO) / (maxX - minX || 1), (ALTEZZA - 2 * BORDO) / (maxY - minY || 1));
  const ox = (LARGHEZZA - (maxX - minX) * scala) / 2;
  const oy = (ALTEZZA - (maxY - minY) * scala) / 2;
  const P = (p: Vertice) => ({ x: ox + (p.x - minX) * scala, y: ALTEZZA - (oy + (p.y - minY) * scala) });
  const punti = v.map(P);
  const centro = {
    x: punti.reduce((a, p) => a + p.x, 0) / punti.length,
    y: punti.reduce((a, p) => a + p.y, 0) / punti.length,
  };
  const lati = LATI[specifica.tipo];

  // L'etichetta di un lato: a metà, spostata verso l'esterno della figura.
  const posizione = ([da, a]: [number, number]) => {
    const p = punti[da]!;
    const q = punti[a]!;
    const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    let nx = -(q.y - p.y);
    let ny = q.x - p.x;
    const lunghezza = Math.hypot(nx, ny) || 1;
    nx /= lunghezza;
    ny /= lunghezza;
    if ((m.x - centro.x) * nx + (m.y - centro.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    // Su un lato quasi verticale il testo si appoggia di fianco (allineato
    // verso il lato), invece di centrarsi sul punto: centrato, un'etichetta
    // larga come «8 cm» toccava la linea.
    const ancora: "start" | "middle" | "end" = nx > 0.5 ? "start" : nx < -0.5 ? "end" : "middle";
    return { x: m.x + nx * 12, y: m.y + ny * 18 + 5, ancora };
  };

  // Il segno dell'angolo retto, nel primo vertice dei rettangoli e del
  // triangolo rettangolo.
  const angoloRetto =
    specifica.tipo === "triangolo" ? null : (() => {
      const a = punti[0]!;
      const b = punti[1]!;
      const c = punti[punti.length - 1]!;
      const u = (p: { x: number; y: number }) => {
        const l = Math.hypot(p.x - a.x, p.y - a.y) || 1;
        return { x: ((p.x - a.x) / l) * 12, y: ((p.y - a.y) / l) * 12 };
      };
      const ub = u(b);
      const uc = u(c);
      return `M${a.x + ub.x},${a.y + ub.y} L${a.x + ub.x + uc.x},${a.y + ub.y + uc.y} L${a.x + uc.x},${a.y + uc.y}`;
    })();

  const descrizione = t("descrizione", {
    tipo: nomeTipo,
    misure: lati.map((l, i) => `${t(l.nome)} ${testo(i)}`).join(", "),
  });

  return (
    <svg role="img" aria-label={descrizione} viewBox={`0 0 ${LARGHEZZA} ${ALTEZZA}`} className={classe}>
      <polygon
        data-figura
        points={punti.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
        fill="#dbeafe"
        stroke="#2563eb"
        strokeWidth={2.5}
        strokeLinejoin="round"
      />
      {angoloRetto && <path d={angoloRetto} fill="none" stroke="#1e3a8a" strokeWidth={1.5} />}
      <g fontSize={14} className="fill-slate-800">
        {lati.map((l, i) => {
          const pos = posizione(l.lato);
          return <text key={i} x={pos.x} y={pos.y} textAnchor={pos.ancora}>{testo(i)}</text>;
        })}
      </g>
    </svg>
  );
}
