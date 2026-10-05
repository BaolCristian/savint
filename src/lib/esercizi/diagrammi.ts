import { jme } from "@savint/engine";

/** I grafici statistici nel testo di un esercizio: diagramma a barre,
 * istogramma, diagramma a torta.
 *
 * I dati li definisce il docente nel pannello Variabili — `dati =
 * repeat(random(1..10), 5)`, `giorni = ["Lun", "Mar", …]` — e il segnaposto
 * li richiama: `[diagramma: barre | valori: dati | etichette: giorni]`. Le
 * liste stanno nelle variabili e non nel segnaposto perché le loro parentesi
 * quadre lo chiuderebbero. Il player calcola le due espressioni nello scope
 * della domanda dello studente (i SUOI numeri) e disegna; la verifica dei
 * venti sorteggi controlla che i dati siano disegnabili. */

export type TipoDiagramma = "barre" | "istogramma" | "torta";

export const TIPI_DIAGRAMMA: readonly TipoDiagramma[] = ["barre", "istogramma", "torta"];

export interface SpecificaDiagramma {
  tipo: TipoDiagramma;
  /** Un'espressione JME (di solito il nome di una variabile) che vale una
   * lista di numeri. */
  valori: string;
  /** Idem, una lista di etichette; `null`: 1, 2, 3… */
  etichette: string | null;
}

export interface DatiDiagramma {
  valori: number[];
  etichette: string[];
}

/** Al più tante barre o fette: oltre, un diagramma per la scuola non si
 * legge più. */
export const MASSIMO_VALORI = 20;

/** Un'espressione ammessa nel segnaposto: niente graffe (il motore le
 * sostituirebbe), niente parentesi quadre o barre verticali (chiuderebbero il
 * segnaposto), niente virgolette doppie (finisce in un attributo). */
const ESPRESSIONE = /^[^{}|[\]"\n<>]+$/;

export function leggiSpecificaDiagramma(
  tipo: string,
  valori: string,
  etichette: string | undefined,
): SpecificaDiagramma | null {
  if (!(TIPI_DIAGRAMMA as readonly string[]).includes(tipo)) return null;
  const v = valori.trim();
  if (v === "" || !ESPRESSIONE.test(v)) return null;
  if (etichette === undefined || etichette.trim() === "") return { tipo: tipo as TipoDiagramma, valori: v, etichette: null };
  const e = etichette.trim();
  return ESPRESSIONE.test(e) ? { tipo: tipo as TipoDiagramma, valori: v, etichette: e } : null;
}

function lista(scope: jme.Scope, espressione: string, che: string): unknown[] {
  const albero = jme.compile(espressione);
  if (albero === null) throw new Error(`${che}: espressione vuota`);
  const v = scope.evaluate(albero);
  const valore = v ? jme.unwrapValue(v) : null;
  if (!Array.isArray(valore)) throw new Error(`${che} (${espressione}) deve essere una lista, per esempio [3, 5, 2]`);
  return valore;
}

/** I dati del diagramma per lo studente di questo scope. Lancia, con un
 * messaggio da docente, quando i dati non si possono disegnare. */
export function valutaDiagramma(scope: jme.Scope, s: SpecificaDiagramma): DatiDiagramma {
  const grezzi = lista(scope, s.valori, "i valori");
  if (grezzi.length === 0) throw new Error(`la lista dei valori (${s.valori}) è vuota`);
  if (grezzi.length > MASSIMO_VALORI) {
    throw new Error(`la lista dei valori (${s.valori}) ha più di ${MASSIMO_VALORI} elementi`);
  }
  const valori = grezzi.map(Number);
  if (valori.some((n) => !Number.isFinite(n))) throw new Error(`i valori (${s.valori}) devono essere numeri`);
  if (valori.some((n) => n < 0)) throw new Error(`i valori (${s.valori}) non possono essere negativi`);
  if (valori.every((n) => n === 0)) throw new Error(`i valori (${s.valori}) sono tutti zero: non c'è niente da disegnare`);

  let etichette = valori.map((_, i) => String(i + 1));
  if (s.etichette !== null) {
    const e = lista(scope, s.etichette, "le etichette");
    if (e.length !== valori.length) {
      throw new Error(`le etichette (${s.etichette}) sono ${e.length}, i valori (${s.valori}) ${valori.length}: devono essere tante quante`);
    }
    etichette = e.map((x) => String(x));
  }
  return { valori, etichette };
}

/** Le percentuali delle fette di una torta. */
export function percentuali(valori: number[]): number[] {
  const totale = valori.reduce((a, b) => a + b, 0);
  return valori.map((v) => (v / totale) * 100);
}
