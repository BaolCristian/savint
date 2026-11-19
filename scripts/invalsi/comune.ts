/**
 * Le regole comuni a tutte le prove INVALSI trascritte (`scripts/genera-invalsi-AAAA.ts`):
 * come si chiama un file, che metadati ha, come si scrivono le parti.
 *
 * Ogni prova è un elenco di `Domanda`, convertito con `creaPacchetto` in
 * modelli dell'editor (`EsercizioEditor`) e poi con `versoFile`, la stessa
 * conversione dell'editor dei docenti: così l'editor sa riaprire ogni
 * esercizio. I file JSON non si correggono a mano: si corregge lo script
 * della prova e si rigenera.
 *
 * Regole di trascrizione (valgono per tutte le prove):
 * - l'argomento è l'AMBITO INVALSI della domanda (vedi ambiti-invalsi.ts);
 *   il tema specifico sta nei tag;
 * - classe seconda (`anno: 2`); ogni item vale 1 punto, una tabella
 *   Vero/Falso 1 punto per affermazione;
 * - le figure che la piattaforma non sa disegnare sono ritagliate dal
 *   fascicolo con `pdftocairo` (NON pdftoppm, che disegna linee spurie) in
 *   `content/esercizi/immagini/<uuid>.png`, e il seed le copia;
 * - le tabelle si scrivono come formula `\[\begin{array}…\end{array}\]`, in
 *   colonna quando possibile (si leggono sul telefono);
 * - gli a capo nel testo NON si vedono: i blocchi si separano con formule a
 *   blocco, immagini e grafici;
 * - le domande a risposta aperta da argomentare o da elencare diventano a
 *   scelta (o a scelta multipla), e `adattamento` lo dice;
 * - le probabilità e le frazioni come risposta: parte «espressione», che
 *   accetta ogni forma equivalente; la consegna chiede di scrivere una frazione.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { EsercizioEditor, ParteEditor } from "../../src/lib/esercizi/editor/modello";
import { esercizioEditorSchema } from "../../src/lib/esercizi/editor/modello";
import { versoFile } from "../../src/lib/esercizi/editor/verso-numbas";
import type { AmbitoInvalsi } from "../../src/lib/esercizi/ambiti-invalsi";

export const r = String.raw;

/** Una prova: l'anno con cui la si nomina (quello in cui si è svolta, il
 * secondo dell'anno scolastico) e l'anno scolastico per esteso. */
export interface Prova {
  anno: number;
  annoScolastico: string; // "2014/15"
}

/** Il nome del file (senza `.json`), la domanda del fascicolo e il modello. */
export interface EsercizioPacchetto {
  nome: string;
  domanda: number;
  modello: EsercizioEditor;
}

export interface Domanda {
  numero: number;
  slug: string;
  titolo: string;
  ambito: AmbitoInvalsi;
  temi: string[];
  difficolta: 1 | 2 | 3;
  /** Una nota sulla trascrizione, quando la domanda è stata adattata. */
  adattamento?: string;
  testo: string;
  suggerimento: string;
  parti: ParteEditor[];
}

export function creaPacchetto(prova: Prova, domande: Domanda[]): EsercizioPacchetto[] {
  const fonte = `Prova INVALSI di matematica ${prova.annoScolastico}, classe seconda della secondaria di secondo grado`;
  return domande.map((d) => {
    const codice = `d${String(d.numero).padStart(2, "0")}`;
    return {
      nome: `invalsi-${prova.anno}-${codice}-${d.slug}`,
      domanda: d.numero,
      modello: {
        meta: {
          titolo: `INVALSI ${prova.anno} · D${d.numero} · ${d.titolo}`,
          descrizione: `${fonte}, domanda D${d.numero}.${d.adattamento ? ` ${d.adattamento}` : ""}`,
          anno: 2,
          argomento: d.ambito,
          tag: ["INVALSI", `INVALSI ${prova.anno}`, ...d.temi],
          difficolta: d.difficolta,
        },
        testo: d.testo,
        suggerimento: d.suggerimento,
        variabili: [],
        condizione: "",
        parti: d.parti,
      },
    };
  });
}

// ---- costruttori brevi per le parti -----------------------------------

/** Risposta numerica: esatta, o con un margine (stringa, es. "0.01"). */
export const numerica = (consegna: string, valore: string, margine?: string): ParteEditor => ({
  tipo: "numerica",
  consegna,
  punti: 1,
  valore,
  tolleranza: margine ? { tipo: "margine", margine } : { tipo: "esatta" },
});

/** Scelta con una sola risposta giusta (`indiceGiusta` da 0, nell'ordine
 * del fascicolo: A = 0, B = 1, …). Le risposte vengono mescolate per ogni
 * studente. */
export const scelta = (consegna: string, risposte: string[], indiceGiusta: number): ParteEditor => ({
  tipo: "scelta",
  consegna,
  punti: 1,
  risposte,
  indiceGiusta,
});

/** Scelta con più risposte giuste, corretta tutto o niente. */
export const sceltaMultipla = (consegna: string, risposte: string[], corrette: boolean[]): ParteEditor => ({
  tipo: "sceltaMultipla",
  consegna,
  punti: 1,
  risposte,
  corrette,
});

/** Tabella Vero/Falso: un punto per affermazione. */
export const veroFalso = (
  affermazioni: string[],
  vere: boolean[],
  consegna = "Indica se ciascuna affermazione è vera o falsa.",
): ParteEditor => ({
  tipo: "veroFalso",
  consegna,
  punti: affermazioni.length,
  affermazioni,
  vere,
});

/** Risposta come formula (JME): anche frazioni, confrontate numericamente. */
export const espressione = (consegna: string, risposta: string): ParteEditor => ({
  tipo: "espressione",
  consegna,
  punti: 1,
  risposta,
});

/** Un'immagine nel testo: `file` è il nome in content/esercizi/immagini/. */
export const img = (file: string, descrizione: string) => `![${descrizione}](${file})`;

// ---- scrittura dei file ----------------------------------------------

/** I byte esatti del file di un esercizio (come `genera-percentuali.ts`). */
export function testoFile(modello: EsercizioEditor): string {
  return `${JSON.stringify(versoFile(esercizioEditorSchema.parse(modello)), null, 2)}\n`;
}

export function scriviPacchetto(pacchetto: EsercizioPacchetto[]): void {
  const dir = path.resolve(process.cwd(), "content/esercizi");
  mkdirSync(dir, { recursive: true });
  for (const { nome, modello } of pacchetto) {
    writeFileSync(path.join(dir, `${nome}.json`), testoFile(modello));
    console.log(`scritto content/esercizi/${nome}.json`);
  }
}

/** Vero quando il modulo è lanciato da riga di comando (non importato da un test). */
export function lanciatoDirettamente(urlModulo: string): boolean {
  return Boolean(process.argv[1]) && urlModulo === pathToFileURL(path.resolve(process.argv[1]!)).href;
}
