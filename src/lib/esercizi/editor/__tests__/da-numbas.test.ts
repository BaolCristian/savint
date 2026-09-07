import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { daNumbas } from "../da-numbas";
import { versoFile } from "../verso-numbas";
import { esercizioFileSchema } from "../../format/schema";
import type { EsercizioEditor } from "../modello";

const DIR = join(process.cwd(), "content/esercizi");
function leggi(nome: string) {
  return esercizioFileSchema.parse(JSON.parse(readFileSync(join(DIR, nome), "utf8")));
}

/** Stessa base minima di verso-numbas.test.ts (Task 1), duplicata qui: quel
 * file non va toccato in questo task. */
const base: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni",
          tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
            valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

describe("il corpus reale", () => {
  // Il valore di questo test e' che i file NON sono stati scritti
  // dall'editor: sono il banco di prova indipendente. La tabella qui sotto
  // e' derivata dal confronto strutturale (giro di correzioni 1), non da
  // un elenco di campi controllati a mano: 06 e 07 sono passati da "true"
  // a "false" perche' la mia prima tabella non era stata verificata contro
  // la rigenerazione reale, solo contro i controlli specifici che avevo
  // scritto — che non potevano sapere di checkVariableNames o della
  // combinazione margine+precisione, campi a cui non avevo pensato. Il
  // motivo di 04 e' cambiato nel giro di correzioni 2: prima veniva
  // rifiutato per il "<" letterale nello statement (< 0), un difetto del
  // divieto sui marcatori che rendeva l'editor incapace di scrivere una
  // disequazione; ora quel "<" e' testo matematico legittimo, e il vero
  // (unico) ostacolo e' il tipo di parte m_n_2, non supportato.
  it.each([
    ["01-equazione-primo-grado.json", true],   // rigenera byte per byte
    ["02-scomposizione-polinomi.json", true],  // distractors ora modellati
    ["03-sistemi-lineari.json", false],   // gapfill
    ["04-disequazioni-secondo-grado.json", false], // m_n_2, non piu' il "<" nello statement
    ["05-goniometria-valori.json", false],  // m_n_x
    ["06-derivate-elementari.json", false], // checkVariableNames/expectedVariableNames
    ["07-limiti-notevoli.json", false],     // margine E precisione insieme
    ["08-terminologia-funzioni.json", false], // patternmatch
  ] as const)("%s rappresentabile: %s", (nome, atteso) => {
    expect(daNumbas(leggi(nome)).ok).toBe(atteso);
  });

  it("04 e' rifiutato per il tipo di parte (m_n_2), non piu' per il '<' nello statement", () => {
    const esito = daNumbas(leggi("04-disequazioni-secondo-grado.json"));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.motivo).toBe("tipo_non_supportato");
      expect(esito.dettaglio).toContain("m_n_2");
    }
  });

  it("quando rifiuta, dice cosa non sa trattare", () => {
    const esito = daNumbas(leggi("03-sistemi-lineari.json"));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.dettaglio).toContain("gapfill");
  });

  it("06 dice che è il controllo dei nomi delle variabili a mancare, non solo che 'non torna'", () => {
    const esito = daNumbas(leggi("06-derivate-elementari.json"));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.dettaglio).toContain("checkVariableNames");
      expect(esito.dettaglio).toContain("duplica");
    }
  });

  it("07 dice che è la combinazione di margine e precisione a mancare", () => {
    const esito = daNumbas(leggi("07-limiti-notevoli.json"));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.dettaglio).toContain("precision");
      expect(esito.dettaglio).toContain("margine");
    }
  });

  // La perdita che ha innescato questo giro di correzioni: prima di
  // modellare le spiegazioni (distractors), 02 veniva accettato ma
  // salvandolo di nuovo le tre spiegazioni delle risposte sbagliate
  // sparivano (sostituite da stringhe vuote da versoNumbas). Questo test
  // fallisce se quella perdita si ripresenta.
  it("02 non perde le spiegazioni delle risposte sbagliate (distractors)", () => {
    const file = leggi("02-scomposizione-polinomi.json");
    const esito = daNumbas(file);
    expect(esito.ok).toBe(true);
    if (esito.ok) {
      const parte = esito.editor.parti[0];
      if (parte.tipo !== "scelta") throw new Error("attesa una parte a scelta");
      expect(parte.spiegazioni).toEqual([
        "",
        "Manca il doppio prodotto cambiato di segno: questo è il quadrato di un binomio, non una differenza di quadrati.",
        "Anche qui manca il doppio prodotto cambiato di segno.",
        "Una differenza di quadrati si scompone sempre come somma per differenza.",
      ]);
    }
  });
});

describe("andata e ritorno", () => {
  it("un esercizio scritto dall'editor si riapre identico", () => {
    // Estende `base` con tutte e tre le parti, cosi' il ritorno va provato
    // su ogni tipo, non solo sul numerico.
    const originale: EsercizioEditor = { ...base, parti: [
      base.parti[0],
      { tipo: "scelta", consegna: "Quale?", punti: 1,
        risposte: ["uno", "due"], indiceGiusta: 0 },
      { tipo: "espressione", consegna: "Deriva", punti: 2, risposta: "2*x" },
    ] };
    const esito = daNumbas(versoFile(originale));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor).toEqual(originale);
  });

  it("una parte a scelta con spiegazioni torna identica, spiegazioni incluse", () => {
    const originale: EsercizioEditor = { ...base, parti: [
      { tipo: "scelta", consegna: "Quale?", punti: 1,
        risposte: ["uno", "due", "tre"], indiceGiusta: 1,
        spiegazioni: ["non è il doppio di uno", "", "non è nemmeno il numero giusto di zeri"] },
    ] };
    const esito = daNumbas(versoFile(originale));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor).toEqual(originale);
  });
});

// Giro di correzioni 2: il divieto sui marcatori impediva di scrivere una
// disequazione. Ora `versoNumbas` scappa `<`/`>`/`&` invece di rifiutarli, e
// `daNumbas` li recupera com'erano: questi test lo provano end-to-end,
// invece di fermarsi al livello dello schema (coperto in verso-numbas.test.ts).
describe("< > & sopravvivono al giro completo", () => {
  it("una disuguaglianza reale (x < 0) torna identica", () => {
    const originale: EsercizioEditor = { ...base, testo: "Risolvi \\(x^2-1 < 0\\)" };
    const esito = daNumbas(versoFile(originale));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor).toEqual(originale);
  });

  it("<, > e & insieme in uno stesso testo tornano identici", () => {
    const originale: EsercizioEditor = { ...base,
      testo: "Se a < b e b > 0, allora a/b < 1 & questo si verifica sempre" };
    const esito = daNumbas(versoFile(originale));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor).toEqual(originale);
  });

  it("un payload da iniezione torna come testo visibile, non viene rifiutato", () => {
    const payload = "<script>alert(1)</script>";
    const originale: EsercizioEditor = { ...base, testo: payload };
    const file = versoFile(originale);
    // scritto come entità: non e' markup eseguibile nel file salvato.
    expect(JSON.stringify(file.question)).toContain("&lt;script&gt;");
    expect(JSON.stringify(file.question)).not.toContain("<script>");
    const esito = daNumbas(file);
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor.testo).toBe(payload);
  });
});

// Per manomettere `question` (tipizzato `unknown` nello schema del file, lo
// valida solo il motore al caricamento) i test seguenti hanno bisogno di un
// tipo mutabile locale, invece di un `as any` che spegnerebbe il controllo
// dei tipi su tutto il resto del file.
type QuestionMutabile = { parts: Array<Record<string, unknown>> } & Record<string, unknown>;
type FileMutabile = ReturnType<typeof versoFile> & { question: QuestionMutabile };

describe("il margine con valori che contengono già delle parentesi", () => {
  it("(c-b)/a con margine 0.01 torna identico, senza confondersi con le parentesi del valore", () => {
    const originale: EsercizioEditor = { ...base, parti: [{ tipo: "numerica",
      consegna: "\\(x=\\)", punti: 2, valore: "(c-b)/a",
      tolleranza: { tipo: "margine", margine: "0.01" } }] };
    const esito = daNumbas(versoFile(originale));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor).toEqual(originale);
  });

  it("un valore con un ' - (' letterale al suo interno non spezza lo split", () => {
    // Se lo split cercasse la prima occorrenza della stringa " - (" invece
    // di ragionare sulla profondità delle parentesi, si fermerebbe qui:
    // dentro "a - (b + 1)", non al vero confine fra valore e margine.
    const originale: EsercizioEditor = { ...base, parti: [{ tipo: "numerica",
      consegna: "\\(x=\\)", punti: 2, valore: "a - (b + 1)",
      tolleranza: { tipo: "margine", margine: "0.5" } }] };
    const esito = daNumbas(versoFile(originale));
    expect(esito.ok).toBe(true);
    if (esito.ok) expect(esito.editor).toEqual(originale);
  });

  it("un margine senza gli spazi attorno all'operatore non è riconosciuto", () => {
    // Limite noto del parser: richiede lo spazio singolo attorno a "-"/"+"
    // che `versoNumbas` scrive sempre. Un intervallo scritto a mano senza
    // quello spazio viene rifiutato, anche se un umano lo leggerebbe come
    // la stessa forma a margine.
    const file = versoFile(base) as FileMutabile;
    file.question.parts[0].minValue = "k-1";
    file.question.parts[0].maxValue = "k+1";
    expect(daNumbas(file).ok).toBe(false);
  });
});

describe("il rifiuto prudente", () => {
  it("un intervallo asimmetrico non e' rappresentabile", () => {
    const file = versoFile(base) as FileMutabile;
    file.question.parts[0].minValue = "1";
    file.question.parts[0].maxValue = "5";
    expect(daNumbas(file).ok).toBe(false);
  });

  it("una funzione definita dal docente rende l'esercizio non modificabile", () => {
    const file = versoFile(base) as FileMutabile;
    file.question.functions = { f: { parameters: [], type: "number",
                                     definition: "1", language: "jme" } };
    expect(daNumbas(file).ok).toBe(false);
  });
});

// Giro di correzioni 3: la review ha dimostrato che il confronto strutturale
// era tautologico per i sei campi di testo (statement, advice, ogni prompt,
// choices, distractors, description) — normalizzava l'originale
// RICALCOLANDO `escapaTesto(valore-gia-estratto)`, lo stesso valore che
// `versoNumbas` avrebbe scritto, invece di confrontarlo con i byte grezzi
// del file. Risultato: un `<em>` vero dentro lo statement veniva accettato,
// e il salvataggio successivo lo trasformava in testo scappato visibile
// ("&lt;em&gt;..."), perdendo la formattazione in silenzio — esattamente
// il danno che questo modulo esiste per evitare.
describe("markup HTML vero non e' rappresentabile (giro di correzioni 3)", () => {
  it("un <em> vero nello statement viene rifiutato, non accettato e poi distrutto", () => {
    const file = versoFile(base) as FileMutabile;
    file.question.statement = "<p><em>Importante</em>: risolvi</p>";
    const esito = daNumbas(file);
    expect(esito.ok).toBe(false);
  });

  it("un <a href> vero in una spiegazione (distractors) viene rifiutato", () => {
    const conScelta: EsercizioEditor = { ...base, parti: [
      { tipo: "scelta", consegna: "Quale?", punti: 1,
        risposte: ["uno", "due"], indiceGiusta: 0,
        spiegazioni: ["", "sbagliata"] },
    ] };
    const file = versoFile(conScelta) as FileMutabile;
    file.question.parts[0].distractors = ["", "guarda <a href=\"http://evil\">qui</a>"];
    const esito = daNumbas(file);
    expect(esito.ok).toBe(false);
  });

  it("markup vero in una scelta (choices) viene rifiutato", () => {
    const conScelta: EsercizioEditor = { ...base, parti: [
      { tipo: "scelta", consegna: "Quale?", punti: 1,
        risposte: ["uno", "due"], indiceGiusta: 0 },
    ] };
    const file = versoFile(conScelta) as FileMutabile;
    file.question.parts[0].choices = ["<p><strong>uno</strong></p>", "<p>due</p>"];
    const esito = daNumbas(file);
    expect(esito.ok).toBe(false);
  });

  it("markup vero nella descrizione di una variabile viene rifiutato", () => {
    const file = versoFile(base) as FileMutabile;
    (file.question.variables as Record<string, Record<string, unknown>>).a.description =
      "vale sempre <b>almeno</b> due";
    const esito = daNumbas(file);
    expect(esito.ok).toBe(false);
  });
});
