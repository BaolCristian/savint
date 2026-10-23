import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { loadQuestion, type NumbasQuestionJSON, type Question } from "@savint/engine";

/** Proprietà che devono valere per i contenuti SPEDITI, non per il motore né
 * per il player: sono affermazioni sugli otto file di `content/esercizi/`.
 *
 * Il motivo per cui questo file esiste. Ogni parte `numberentry` dichiarava
 * `notationStyles: ["plain", "en", "si-en"]`, tre stili tutti col PUNTO come
 * separatore decimale. Uno studente italiano che scriveva `7,39` — l'unico
 * modo in cui si scrive in un'aula italiana, e il modo in cui l'enunciato di
 * 07 scrive da sé la propria tolleranza, `\(\pm 0{,}05\)` — si sentiva dire
 * che aveva sbagliato. In un prodotto di matematica per la scuola italiana
 * quello non è un ruvido: è un difetto in ciò per cui il prodotto esiste.
 *
 * Alla lista si sono aggiunti i tre stili europei a virgola (`plain-eu`,
 * `eu`, `si-fr`), DOPO quelli col punto e non al loro posto, così che
 * nessuna delle due scritture sia punita. L'ordine conta: `matchNotationStyle`
 * (engine, `math/format.ts`) sceglie lo stile la cui corrispondenza è più
 * LUNGA, e a parità di lunghezza vince il primo della lista — quindi
 * lasciando davanti gli stili col punto una scrittura ambigua come `1.234`
 * continua a leggersi 1,234 come prima, invece di diventare milleduecento-
 * trentaquattro. Verificato al banco su tutte le forme oggi accettate:
 * nessuna cambia significato. */

const dir = path.resolve(process.cwd(), "content/esercizi");
const file = readdirSync(dir).filter((f) => f.endsWith(".json"));

/** Gli stili in cui la virgola è il separatore DECIMALE. */
const STILI_VIRGOLA = ["plain-eu", "eu", "si-fr"];

interface ParteJSON {
  type?: string;
  prompt?: string;
  notationStyles?: string[];
  correctAnswerStyle?: string;
  gaps?: ParteJSON[];
}

function carica(nome: string): { question: NumbasQuestionJSON; parti: ParteJSON[] } {
  const dati = JSON.parse(readFileSync(path.join(dir, nome), "utf8")) as {
    question: NumbasQuestionJSON & { parts: ParteJSON[] };
  };
  return { question: dati.question, parti: dati.question.parts };
}

/** Tutte le parti `numberentry` di un file, gap compresi. */
function partiNumericheJSON(parti: ParteJSON[]): ParteJSON[] {
  return parti.flatMap((p) => [
    ...(p.type === "numberentry" ? [p] : []),
    ...partiNumericheJSON(p.gaps ?? []),
  ]);
}

// I percorsi delle parti numeriche non dipendono dal seme: si enumerano una
// volta sola, così ogni caso di `it.each` nomina la parte che verifica.
const SEMI = ["it-uno", "it-due", "it-tre"];
const percorsiNumerici: [string, string][] = file.flatMap((nome) => {
  const q = loadQuestion(carica(nome).question, { seed: SEMI[0]!, locale: "it" });
  return q
    .allParts()
    .filter((p) => p.type === "numberentry")
    .map((p) => [nome, p.path] as [string, string]);
});

/** Le due scritture della stessa risposta. `correctAnswer()` esce nello
 * stile di visualizzazione della parte, che ora è italiano: si riporta prima
 * la risposta alla forma col punto, poi si costruiscono le due forme. Per una
 * risposta intera non c'è un decimale da girare, e allora la forma con la
 * virgola è quella che uno studente scrive comunque — `5,0` per 5. */
function dueForme(giusta: string): { punto: string; virgola: string } {
  const punto = giusta.replace(",", ".");
  return { punto, virgola: punto.includes(".") ? punto.replace(".", ",") : `${punto},0` };
}

/** Invia un valore a una parte e restituisce il credito che ne ricava. Un
 * gap non si invia da solo: lo fa la sua parte gapfill, con il vettore di
 * tutte le risposte (le altre giuste, così l'unica variabile è questa). */
function creditoPer(q: Question, percorso: string, valore: string): number {
  const parte = q.getPart(percorso)!;
  if (!parte.isGap) {
    parte.submit(valore);
    return parte.credit;
  }
  const madre = q.getPart(percorso.slice(0, percorso.indexOf("g")))!;
  const risposte = madre.gaps.map((g) =>
    g.path === percorso ? valore : (q.getPart(g.path)!.correctAnswer() as string),
  );
  madre.submit(risposte as never);
  return q.getPart(percorso)!.credit;
}

describe("notazione decimale dei contenuti", () => {
  it("ci sono parti numeriche da verificare (la suite non gira a vuoto)", () => {
    expect(percorsiNumerici.length).toBeGreaterThan(0);
  });

  it.each(percorsiNumerici)("%s %s accetta la virgola decimale come il punto", (nome, percorso) => {
    const { question } = carica(nome);
    for (const seme of SEMI) {
      const giusta = loadQuestion(question, { seed: seme, locale: "it" })
        .getPart(percorso)!
        .correctAnswer() as string;
      const { punto, virgola } = dueForme(giusta);

      // Nessuna delle due scritture è punita: entrambe prendono il credito
      // pieno. Prima della correzione la forma con la virgola dava 0.
      expect(
        creditoPer(loadQuestion(question, { seed: seme, locale: "it" }), percorso, punto),
        `${nome} ${percorso} seme ${seme}: la forma col punto "${punto}" non e' stata accettata`,
      ).toBeGreaterThanOrEqual(1);
      expect(
        creditoPer(loadQuestion(question, { seed: seme, locale: "it" }), percorso, virgola),
        `${nome} ${percorso} seme ${seme}: la forma con la virgola "${virgola}" non e' stata accettata`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  // Senza questo, la prova qui sopra potrebbe restare verde per un motivo
  // debole: se ogni risposta fosse intera, la "forma con la virgola" sarebbe
  // sempre e solo `n,0`, e un decimale vero — il caso che ha fatto scattare
  // la segnalazione — non verrebbe mai esercitato.
  it("almeno una parte numerica ha una risposta con dei decimali", () => {
    const conDecimali = percorsiNumerici.filter(([nome, percorso]) =>
      SEMI.some((seme) => {
        const giusta = loadQuestion(carica(nome).question, { seed: seme, locale: "it" })
          .getPart(percorso)!
          .correctAnswer() as string;
        return /[.,]\d/.test(giusta);
      }),
    );
    expect(conDecimali.length).toBeGreaterThan(0);
  });

  // Guardia strutturale: un esercizio aggiunto domani non deve poter tornare
  // di nascosto ai soli stili col punto. Questa prova non ha bisogno di
  // caricare il motore, guarda il file.
  it.each(file)("in %s ogni parte numerica dichiara uno stile a virgola decimale", (nome) => {
    for (const parte of partiNumericheJSON(carica(nome).parti)) {
      const stili = parte.notationStyles ?? [];
      expect(
        stili.some((s) => STILI_VIRGOLA.includes(s)),
        `${nome}: una parte numberentry dichiara ${JSON.stringify(stili)}, nessuno stile a virgola decimale`,
      ).toBe(true);
      // E non a scapito di quelli col punto: `7.39` deve restare valido.
      expect(stili).toContain("plain");
    }
  });

  // Il punto da cui è partita la segnalazione: l'enunciato di 07 scrive la
  // tolleranza come `\(\pm 0{,}05\)`, con la virgola. La risposta mostrata
  // deve parlare la stessa lingua dell'enunciato.
  it("07-limiti-notevoli: l'enunciato e la risposta usano la stessa virgola", () => {
    const { question, parti } = carica("07-limiti-notevoli.json");
    expect(parti[0]!.prompt).toContain("0{,}05");
    const giusta = loadQuestion(question, { seed: "it-uno", locale: "it" })
      .getPart("p0")!
      .correctAnswer() as string;
    expect(giusta).toMatch(/^\d+,\d{2}$/);
  });
});

/** Le chiavi di un oggetto nell'ordine in cui le restituisce PostgreSQL
 * (jsonb): prima le più corte, a parità di lunghezza in ordine di byte. È
 * l'ordine con cui il player riceve `variables` dal database, diverso da
 * quello del file. */
function ordineJsonb<T>(o: Record<string, T>): Record<string, T> {
  const chiavi = Object.keys(o).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(chiavi.map((k) => [k, o[k] as T]));
}

describe("i contenuti si caricano anche nell'ordine del database", () => {
  // Il caso che l'ha reso necessario: 14-percentuali-frazioni-decimali ha
  // una variabile `i` (omonima dell'unità immaginaria); dal database `d`
  // veniva prima di `i` e `p = [...][i]` falliva nel player.
  it.each(file)("%s", (nome) => {
    const { question } = carica(nome);
    const riordinata = { ...question, variables: ordineJsonb(question.variables ?? {}) };
    for (const seme of SEMI) {
      expect(() => loadQuestion(riordinata, { seed: seme, locale: "it", numberStyle: "plain-eu" })).not.toThrow();
    }
  });
});
