import { jme } from "@savint/engine";

/** Le figure geometriche nel testo di un esercizio, disegnate IN SCALA con le
 * misure di ogni studente.
 *
 * `[figura: triangolo rettangolo | misure: a, b | unità: cm | incognite: 3]`:
 * le misure sono espressioni JME (di solito nomi di variabili), l'unità è
 * facoltativa, e `incognite` dice quali etichette mostrano «?» invece del
 * valore (per l'esercizio che chiede di trovarle). Le etichette di ogni
 * figura, nell'ordine in cui `incognite` le conta:
 *
 *   rettangolo           base, altezza
 *   quadrato             lato
 *   triangolo rettangolo cateto 1, cateto 2, ipotenusa (calcolata)
 *   triangolo            lato AB, lato BC, lato CA (i tre lati)
 *   cerchio              raggio */

export type TipoFigura = "rettangolo" | "quadrato" | "triangolo rettangolo" | "triangolo" | "cerchio";

/** Per ogni figura: quante misure servono e quante etichette ha. */
export const FIGURE: Record<TipoFigura, { misure: number; etichette: number }> = {
  rettangolo: { misure: 2, etichette: 2 },
  quadrato: { misure: 1, etichette: 1 },
  "triangolo rettangolo": { misure: 2, etichette: 3 },
  triangolo: { misure: 3, etichette: 3 },
  cerchio: { misure: 1, etichette: 1 },
};

export interface SpecificaFigura {
  tipo: TipoFigura;
  misure: string[];
  unita: string | null;
  /** Le etichette (contate da 1) che mostrano «?». */
  incognite: number[];
}

export interface DatiFigura {
  misure: number[];
  /** Il valore di ogni etichetta, comprese quelle calcolate (l'ipotenusa). */
  etichette: number[];
}

export interface Vertice {
  x: number;
  y: number;
}

const ESPRESSIONE = /^[^{}|[\]"\n<>,&]+$/;
const UNITA = /^[\p{L}\d²³ ]{1,8}$/u;

export function leggiSpecificaFigura(
  tipo: string,
  misure: string,
  unita: string | undefined,
  incognite: string | undefined,
): SpecificaFigura | null {
  const t = tipo.trim() as TipoFigura;
  const forma = FIGURE[t];
  if (!forma) return null;
  const m = misure.split(",").map((x) => x.trim());
  if (m.length !== forma.misure || m.some((x) => x === "" || !ESPRESSIONE.test(x))) return null;
  let u: string | null = null;
  if (unita !== undefined && unita.trim() !== "") {
    if (!UNITA.test(unita.trim())) return null;
    u = unita.trim();
  }
  let inc: number[] = [];
  if (incognite !== undefined && incognite.trim() !== "") {
    inc = incognite.split(",").map((x) => Number(x.trim()));
    if (inc.some((n) => !Number.isInteger(n) || n < 1 || n > forma.etichette)) return null;
  }
  return { tipo: t, misure: m, unita: u, incognite: inc };
}

function numero(scope: jme.Scope, espressione: string): number {
  const albero = jme.compile(espressione);
  if (albero === null) throw new Error("misura vuota");
  const v = scope.evaluate(albero);
  return v ? Number(jme.unwrapValue(v)) : NaN;
}

/** Le misure della figura per lo studente di questo scope. Lancia, con un
 * messaggio da docente, quando la figura non si può disegnare. */
export function valutaFigura(scope: jme.Scope, s: SpecificaFigura): DatiFigura {
  const misure = s.misure.map((e) => numero(scope, e));
  misure.forEach((m, i) => {
    if (!Number.isFinite(m) || m <= 0) {
      throw new Error(`la misura ${s.misure[i]} vale ${m}: le misure di una figura devono essere numeri positivi`);
    }
  });
  if (s.tipo === "triangolo") {
    const [a, b, c] = misure as [number, number, number];
    if (a >= b + c || b >= a + c || c >= a + b) {
      throw new Error(`con lati ${a}, ${b} e ${c} non esiste un triangolo: ogni lato deve essere minore della somma degli altri due`);
    }
  }
  const etichette = s.tipo === "triangolo rettangolo" ? [...misure, Math.hypot(misure[0]!, misure[1]!)] : misure;
  return { misure, etichette };
}

/** I vertici della figura in unità di misura (y verso l'alto). Per il
 * cerchio, il centro. */
export function vertici(tipo: TipoFigura, m: number[]): Vertice[] {
  switch (tipo) {
    case "rettangolo":
      return [{ x: 0, y: 0 }, { x: m[0]!, y: 0 }, { x: m[0]!, y: m[1]! }, { x: 0, y: m[1]! }];
    case "quadrato":
      return [{ x: 0, y: 0 }, { x: m[0]!, y: 0 }, { x: m[0]!, y: m[0]! }, { x: 0, y: m[0]! }];
    case "triangolo rettangolo":
      return [{ x: 0, y: 0 }, { x: m[0]!, y: 0 }, { x: 0, y: m[1]! }];
    case "triangolo": {
      // AB sulla base; C dove |AC| = CA e |BC| = BC.
      const [ab, bc, ca] = m as [number, number, number];
      const x = (ca * ca + ab * ab - bc * bc) / (2 * ab);
      return [{ x: 0, y: 0 }, { x: ab, y: 0 }, { x, y: Math.sqrt(Math.max(0, ca * ca - x * x)) }];
    }
    case "cerchio":
      return [{ x: 0, y: 0 }];
  }
}
