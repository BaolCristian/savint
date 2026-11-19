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
 *
 * Domande a NUMERI VARIABILI (`variabili` non vuote: ogni studente riceve
 * numeri diversi da quelli del fascicolo; la descrizione lo dice da sola,
 * vedi `NOTA_VARIABILI`). Si convertono solo le domande di testo + calcolo
 * in cui cambiare i numeri lascia la STESSA domanda (stessa abilità, stessa
 * difficoltà, stessa struttura). Restano fisse le domande legate a
 * un'immagine, a un grafico o a una figura che mostra i numeri, quelle
 * concettuali o Vero/Falso su un'affermazione fissa, quelle che
 * richiederebbero di ridisegnare qualcosa, e quelle per cui non si può
 * garantire un problema ben posto per ogni estrazione. Nel dubbio: fissa.
 * Regole:
 * - gli intervalli si scelgono perché OGNI estrazione sia ben posta e i
 *   risultati restino «puliti» dove lo erano nel fascicolo (interi restano
 *   interi, un decimale resta un decimale finito). Si costruisce il dato a
 *   partire dal risultato quando serve (es. `N = lcm(entra, d)*random(5..10)`
 *   perché `N/d` sia intero), e un vincolo si scrive dentro le definizioni
 *   (es. `entra = d + random(1..3)` invece di «entra diverso da d»): `condizione` solo se
 *   non si può fare altrimenti, perché il motore fa al più 10 tentativi;
 * - i valori del fascicolo sono, quando è ragionevole, una delle estrazioni
 *   possibili (la descrizione di ogni variabile lo può ricordare);
 * - i decimali si costruiscono come RAZIONALI esatti (`random(50..120)/10`,
 *   `k*s10/10`): il motore li mostra con la virgola e senza code (`6{,}4`).
 *   NON `precround(x, 1)` per un valore da mostrare (mostra `4{,}0` per 4) né
 *   una divisione che non finisce (mostra `0{,}3333333333`). Gli importi in
 *   euro si mostrano con `\var{dpformat(x, 2)}` (sempre due decimali);
 * - `\var{...}` funziona SOLO dentro una formula `\( \)`; un numero negativo
 *   va scritto con il segno nel testo e la variabile positiva
 *   (`3x - \var{c}`, non `3x + \var{q}` con `q` negativo: mostrerebbe `+ -5`);
 * - scelta multipla: i distrattori si CALCOLANO dalle variabili con la
 *   stessa logica d'errore delle risposte sbagliate del fascicolo, e non
 *   devono mai coincidere fra loro né con la giusta, per nessuna estrazione:
 *   si scelgono gli intervalli che lo garantiscono (e la prova lo
 *   controlla su molti semi). Se non si capisce l'errore che un distrattore
 *   del fascicolo rappresenta, la domanda resta fissa;
 * - una parte «espressione» (JME) non accetta la virgola decimale nella
 *   risposta dello studente: non creare parti «espressione» la cui risposta
 *   abbia decimali (le frazioni vanno bene: `{B-2}/{N-2}`);
 * - una risposta «numerica» da arrotondare usa il margine (es. "0.01" per i
 *   centesimi), e l'errore tipico scritto nella prova deve stare FUORI dal
 *   margine per ogni estrazione;
 * - le tabelle `\begin{array}` del testo si possono rendere variabili se ogni
 *   numero che ne dipende è calcolato;
 * - il suggerimento usa le stesse variabili: deve restare giusto per ogni
 *   estrazione (una divisione intera si spiega con quoziente e resto,
 *   `mod(a, b)`, non con un «≈» che per certe estrazioni mostrerebbe `15,00`);
 * - i nomi delle variabili in JME NON distinguono maiuscole e minuscole (`M` e
 *   `m`, `S` e `s` sono la stessa variabile), e non devono coincidere con
 *   costanti o funzioni del motore (`e`, `i`, `pi`, `sec`, `max`…): nomi
 *   parlanti come `entra`, `ombra`, `durata`;
 * - attenzione alla grammatica attorno a un numero variabile: «il 8%» va
 *   evitato (si toglie l'8 dall'intervallo, o si riscrive la frase);
 * - accanto a ogni variabile, nella descrizione, il valore del fascicolo.
 * Nella prova (`src/lib/esercizi/__tests__/invalsi-comune.ts`) la soluzione
 * di una domanda a numeri variabili è una funzione dei valori estratti, che
 * rifà il calcolo per conto suo.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { EsercizioEditor, ParteEditor, VariabileEditor } from "../../src/lib/esercizi/editor/modello";
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
  /** Le variabili casuali (vedi le regole in cima): assenti, la domanda ha i
   * numeri del fascicolo, uguali per tutti. */
  variabili?: VariabileEditor[];
  /** La condizione che i valori estratti devono rispettare ("" se nessuna). */
  condizione?: string;
  testo: string;
  suggerimento: string;
  parti: ParteEditor[];
}

/** La frase che chiude la descrizione di una domanda a numeri variabili. */
export const NOTA_VARIABILI = "Numeri variabili: ogni studente riceve valori diversi da quelli del fascicolo.";

/** Una variabile: nome, definizione JME e descrizione. */
export const variabile = (nome: string, definizione: string, descrizione = ""): VariabileEditor => ({ nome, definizione, descrizione });

export function creaPacchetto(prova: Prova, domande: Domanda[]): EsercizioPacchetto[] {
  const fonte = `Prova INVALSI di matematica ${prova.annoScolastico}, classe seconda della secondaria di secondo grado`;
  return domande.map((d) => {
    const codice = `d${String(d.numero).padStart(2, "0")}`;
    const variabili = d.variabili ?? [];
    const note = [d.adattamento, variabili.length > 0 ? NOTA_VARIABILI : undefined].filter(Boolean);
    return {
      nome: `invalsi-${prova.anno}-${codice}-${d.slug}`,
      domanda: d.numero,
      modello: {
        meta: {
          titolo: `INVALSI ${prova.anno} · D${d.numero} · ${d.titolo}`,
          descrizione: [`${fonte}, domanda D${d.numero}.`, ...note].join(" "),
          anno: 2,
          argomento: d.ambito,
          tag: ["INVALSI", `INVALSI ${prova.anno}`, ...d.temi],
          difficolta: d.difficolta,
        },
        testo: d.testo,
        suggerimento: d.suggerimento,
        variabili,
        condizione: d.condizione ?? "",
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
