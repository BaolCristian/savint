import { jme } from "@savint/engine";

/** I grafici di funzione nel testo di un esercizio.
 *
 * Il docente scrive la funzione con le variabili della domanda (`a*x+b`); il
 * player la calcola con i numeri di QUELLO studente, usando lo scope della
 * sua domanda, e la disegna. Nessuna sostituzione di testo: con lo stile dei
 * numeri all'italiana un «1,5» dentro un'espressione diventerebbe una lista.
 * Qui vivono le parti pure — lettura della specifica, campionamento,
 * intervalli, griglia, spezzatura della curva — usate dal player, dalla
 * verifica dei venti sorteggi e dall'editor. */

export interface SpecificaGrafico {
  espressione: string;
  x: [number, number];
  /** `null`: intervallo delle y automatico (vedi `limitiAutomatici`). */
  y: [number, number] | null;
}

export interface Punto {
  x: number;
  /** `null` dove la funzione non esiste o non è un numero reale finito. */
  y: number | null;
}

/** I punti campionati per un grafico: abbastanza per una curva liscia su uno
 * schermo di telefono, pochi per non pesare sul player. */
export const PUNTI_GRAFICO = 241;

/** Un'espressione ammessa: niente graffe (il motore le sostituirebbe nel
 * testo prima che il player la veda), niente segni che chiudono il
 * segnaposto, niente virgolette (finisce in un attributo), niente a capo. */
const ESPRESSIONE = /^[^{}|[\]"\n<>]+$/;
const NUMERO = "-?\\d+(?:\\.\\d+)?";
const INTERVALLO = new RegExp(`^(${NUMERO})\\.\\.(${NUMERO})$`);
const ESTREMO_MASSIMO = 10000;

function leggiIntervallo(testo: string): [number, number] | null {
  const m = INTERVALLO.exec(testo.trim());
  if (!m) return null;
  const da = Number(m[1]);
  const a = Number(m[2]);
  if (!(da < a) || Math.abs(da) > ESTREMO_MASSIMO || Math.abs(a) > ESTREMO_MASSIMO) return null;
  return [da, a];
}

/** La specifica di un grafico, o `null` se non è nella forma ammessa. */
export function leggiSpecificaGrafico(
  espressione: string,
  x: string,
  y: string | undefined,
): SpecificaGrafico | null {
  const e = espressione.trim();
  if (e === "" || !ESPRESSIONE.test(e)) return null;
  const ix = leggiIntervallo(x);
  if (!ix) return null;
  if (y === undefined || y.trim() === "") return { espressione: e, x: ix, y: null };
  const iy = leggiIntervallo(y);
  return iy ? { espressione: e, x: ix, y: iy } : null;
}

/** Calcola la funzione in `n` punti equidistanti di `[da, a]`, nello scope
 * della domanda dello studente (le sue variabili) più la `x` del grafico,
 * che vince su un'eventuale variabile omonima. Un'espressione che non si
 * compila LANCIA: è un difetto dell'esercizio, e la verifica lo deve
 * vedere. Un punto in cui la funzione non esiste vale `null`. */
export function campiona(scope: jme.Scope, espressione: string, [da, a]: [number, number], n = PUNTI_GRAFICO): Punto[] {
  const albero = jme.compile(espressione);
  if (albero === null) throw new Error("espressione vuota");
  const punti: Punto[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? da : da + ((a - da) * i) / (n - 1);
    let y: number | null = null;
    try {
      const locale = new jme.Scope([scope, { variables: { x: new jme.TNum(x) } }]);
      const v = locale.evaluate(albero);
      const numero = v ? Number(jme.unwrapValue(v)) : NaN;
      y = Number.isFinite(numero) ? numero : null;
    } catch {
      y = null;
    }
    punti.push({ x, y });
  }
  return punti;
}

/** Un numero «comodo» per un passo di griglia: 1, 2 o 5 per una potenza di
 * dieci. */
function passoComodo(grezzo: number): number {
  const potenza = Math.pow(10, Math.floor(Math.log10(grezzo)));
  const m = grezzo / potenza;
  const scelto = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return Number((scelto * potenza).toPrecision(12));
}

/** Il passo della griglia per un intervallo lungo `ampiezza`: un quadretto
 * per unità finché ci stanno al più una ventina di quadretti, poi passi
 * comodi (2, 5, 10, 20…). */
export function passoGriglia(ampiezza: number): number {
  if (ampiezza <= 20 && ampiezza >= 4) return 1;
  return passoComodo(ampiezza / 10);
}

/** Il passo dei numeri scritti su un asse: uno per riga della griglia
 * quando le righe sono al più una dozzina (si leggono i valori interi), se
 * no un passo comodo (2, 5, 10…) multiplo di quello della griglia, così le
 * etichette restano poche e regolari. */
export function passoEtichette(ampiezza: number): number {
  const passo = passoGriglia(ampiezza);
  if (ampiezza / passo <= 12) return passo;
  return Math.max(passo, passoComodo(ampiezza / 8));
}

/** L'intervallo delle y quando il docente non lo fissa: dal minimo al
 * massimo della funzione, con un po' di margine, arrotondato al passo della
 * griglia. I valori estremi (il 2% in alto e in basso) non contano: vicino a
 * un asintoto la funzione esplode, e tenerne conto schiaccerebbe il resto
 * del grafico in una riga. */
export function limitiAutomatici(punti: Punto[]): [number, number] {
  const valori = punti.map((p) => p.y).filter((y): y is number => y !== null).sort((p, q) => p - q);
  if (valori.length === 0) return [-5, 5];
  const taglio = valori.length >= 50 ? Math.floor(valori.length * 0.02) : 0;
  let basso = valori[taglio]!;
  let alto = valori[valori.length - 1 - taglio]!;
  if (alto - basso < 1e-9) {
    basso -= 1;
    alto += 1;
  }
  const margine = (alto - basso) * 0.1;
  const passo = passoGriglia(alto - basso + 2 * margine);
  return [Math.floor((basso - margine) / passo) * passo, Math.ceil((alto + margine) / passo) * passo];
}

/** I tratti da disegnare: la curva si spezza dove la funzione non esiste e
 * dove salta da un lato all'altro del riquadro da un punto al successivo (un
 * asintoto), invece di tracciare una riga verticale che la funzione non
 * ha. */
export function tratti(punti: Punto[], [basso, alto]: [number, number]): Punto[][] {
  const out: Punto[][] = [];
  let corrente: Punto[] = [];
  let precedente: Punto | null = null;
  for (const p of punti) {
    // Un asintoto: fra due punti vicini la funzione passa da sopra il
    // riquadro a sotto (o viceversa). Due punti fuori dallo stesso lato non
    // sono un salto: il riquadro li taglia e basta.
    const salto =
      precedente !== null &&
      p.y !== null &&
      precedente.y !== null &&
      ((p.y > alto && precedente.y < basso) || (p.y < basso && precedente.y > alto));
    if (p.y === null || salto) {
      if (corrente.length > 0) out.push(corrente);
      corrente = p.y === null ? [] : [p];
    } else {
      corrente.push(p);
    }
    precedente = p.y === null ? null : p;
  }
  if (corrente.length > 0) out.push(corrente);
  return out;
}
