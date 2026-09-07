# Editor degli esercizi — piano di implementazione

> **Per chi esegue:** SOTTO-ABILITÀ RICHIESTA: usare
> superpowers:subagent-driven-development per eseguire questo piano un task
> alla volta. I passi usano caselle (`- [ ]`).

**Obiettivo:** dare al docente un editor con cui scrivere esercizi a variabili
casuali, verificati su venti semi prima di essere salvati.

**Architettura:** un modello dell'editor (`EsercizioEditor`) che è la forma su
cui lavora il modulo, due conversioni pure verso e da il JSON Numbas, una
verifica che esegue l'esercizio con venti semi, un dominio che scrive versioni
nuove senza mai toccare quelle esistenti, e le pagine.

**Tecnologie:** Next.js 16, React 19, Prisma, zod, next-intl, `@savint/engine`,
vitest, Playwright.

**Specifica:** `docs/superpowers/specs/2026-09-07-esercizi-05-editor-design.md`

## Vincoli globali

- Nessuna migrazione. Lo schema esistente basta: `Esercizio`,
  `EsercizioVersione`, `hashContenuto`. **Non modificare `prisma/schema.prisma`.**
- **Non modificare `packages/engine`.** Se il motore ha un difetto, va
  registrato, non corretto da qui.
- **Non modificare `content/esercizi/`.** Quegli otto file sono il corpus di
  prova del Task 2 e devono restare com'è.
- Ogni stringa visibile passa da next-intl, presente in **entrambi**
  `src/messages/it.json` e `src/messages/en.json`.
- Le pagine del cruscotto dietro `redirectUnlessTeacher()`.
- Le rotte seguono la forma del sotto-progetto 4: cancello, tetto di frequenza
  per docente con chiave propria, validazione dello scafo, dominio in fondo, e
  i rifiuti del dominio mappati su codici di stato, **con il dettaglio che
  arriva nel corpo della risposta**, non appiattito.
- Test guidati dalle prove: prima il test che fallisce, e va visto fallire per
  la ragione giusta.
- Pulizia dei test **circoscritta per prefisso**. Mai una `deleteMany()` su
  tabella intera: ha già reso instabile questa suite una volta.
- Il database di sviluppo è condiviso con il committente. Mai
  `prisma migrate reset`. Mai occupare la porta 3000; Playwright usa la 3100.
  Se serve fermare un server, per porta (`lsof -ti:3100 | xargs kill`), mai
  per corrispondenza sulla riga di comando.
- Commit in italiano, ciascuno chiuso da:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611
  ```

---

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/lib/esercizi/editor/modello.ts` | il tipo `EsercizioEditor` e il suo schema zod |
| `src/lib/esercizi/editor/verso-numbas.ts` | modello → JSON Numbas + involucro SAVINT |
| `src/lib/esercizi/editor/da-numbas.ts` | JSON Numbas → modello, o «non rappresentabile» |
| `src/lib/esercizi/editor/verifica.ts` | la verifica a venti semi |
| `src/lib/esercizi/redazione.ts` | dominio: crea, salva versione, duplica, elenca, carica |
| `src/app/api/esercizi/redazione/route.ts` | POST crea |
| `src/app/api/esercizi/redazione/[id]/route.ts` | POST nuova versione |
| `src/app/api/esercizi/redazione/[id]/duplica/route.ts` | POST duplica |
| `src/app/api/esercizi/redazione/verifica/route.ts` | POST verifica senza salvare |
| `src/components/esercizi/editor/pannello-variabili.tsx` | le variabili e la condizione |
| `src/components/esercizi/editor/parte-numerica.tsx` | modulo risposta numerica |
| `src/components/esercizi/editor/parte-scelta.tsx` | modulo scelta multipla |
| `src/components/esercizi/editor/parte-espressione.tsx` | modulo espressione |
| `src/components/esercizi/editor/anteprima.tsx` | tre semi resi dal player vero |
| `src/components/esercizi/editor/editor-esercizio.tsx` | il modulo intero |
| `src/app/(dashboard)/dashboard/esercizi/redazione/page.tsx` | elenco |
| `src/app/(dashboard)/dashboard/esercizi/redazione/nuovo/page.tsx` | editor vuoto |
| `src/app/(dashboard)/dashboard/esercizi/redazione/[id]/page.tsx` | editor su esistente |
| `tests/e2e/esercizi-editor.spec.ts` | prova end-to-end |

---

## Task 1: Il modello dell'editor e la conversione verso Numbas

**Files:**
- Create: `src/lib/esercizi/editor/modello.ts`
- Create: `src/lib/esercizi/editor/verso-numbas.ts`
- Test: `src/lib/esercizi/editor/__tests__/verso-numbas.test.ts`

**Interfaces — produce:**

```ts
// modello.ts
export type Tolleranza =
  | { tipo: "esatta" }
  | { tipo: "margine"; margine: string }   // espressione JME, es. "0.01"
  | { tipo: "decimali"; cifre: number };   // 0..6

export type ParteEditor =
  | { tipo: "numerica"; consegna: string; punti: number;
      valore: string; tolleranza: Tolleranza }
  | { tipo: "scelta"; consegna: string; punti: number;
      risposte: string[]; indiceGiusta: number }
  | { tipo: "espressione"; consegna: string; punti: number; risposta: string };

export type VariabileEditor = {
  nome: string; definizione: string; descrizione: string;
};

export type EsercizioEditor = {
  meta: { titolo: string; descrizione: string; anno: number;
          argomento: string; tag: string[]; difficolta: number };
  testo: string;         // la consegna generale (statement)
  suggerimento: string;  // advice, "" se assente
  variabili: VariabileEditor[];
  condizione: string;    // variablesTest.condition, "" se assente
  parti: ParteEditor[];  // almeno una
};

export const esercizioEditorSchema: z.ZodType<EsercizioEditor>;

// verso-numbas.ts
export function versoNumbas(e: EsercizioEditor): unknown;      // il blocco question
export function versoFile(e: EsercizioEditor): EsercizioFile;  // involucro savint + question
```

**Consuma:** `esercizioFileSchema` e `EsercizioFile` da
`src/lib/esercizi/format/schema.ts`.

### Le tre traduzioni, per esteso

**Risposta numerica.** Numbas non ha un campo «risposta»: ha `minValue` e
`maxValue`, entrambe espressioni JME. L'editor li deriva:

```ts
function intervalloNumerico(valore: string, t: Tolleranza) {
  switch (t.tipo) {
    case "esatta":
      return { minValue: valore, maxValue: valore };
    case "margine":
      // parentesi obbligatorie: `valore` può essere "(c-b)/a" e il margine
      // un'espressione a sua volta.
      return {
        minValue: `(${valore}) - (${t.margine})`,
        maxValue: `(${valore}) + (${t.margine})`,
      };
    case "decimali":
      return {
        minValue: valore,
        maxValue: valore,
        precision: String(t.cifre),
        precisionType: "dp",
        strictPrecision: false,
        showPrecisionHint: true,
        precisionPartialCredit: 0,
      };
  }
}
```

Il resto della parte:

```ts
{
  type: "numberentry",
  marks: parte.punti,
  prompt: `<p>${parte.consegna}</p>`,
  ...intervalloNumerico(parte.valore, parte.tolleranza),
  correctAnswerFraction: false,
  allowFractions: false,
  notationStyles: ["plain", "en", "si-en", "plain-eu", "eu", "si-fr"],
  correctAnswerStyle: "plain-eu",
}
```

**Scelta multipla.** `1_n_2` vuole le risposte come `choices` e la correzione
come `matrix`: una colonna, una riga per risposta, i punti sulla riga giusta e
zero sulle altre.

```ts
{
  type: "1_n_2",
  marks: 0,                       // i punti stanno nella matrice, non qui
  prompt: `<p>${parte.consegna}</p>`,
  choices: parte.risposte.map((r) => `<p>${r}</p>`),
  matrix: parte.risposte.map((_, i) =>
    i === parte.indiceGiusta ? String(parte.punti) : "0"),
  displayType: "radiogroup",
  displayColumns: 0,
  shuffleChoices: true,
  showCellAnswerState: true,
  minMarks: 0,
  maxMarks: 0,
  distractors: parte.risposte.map(() => ""),
}
```

**Espressione.**

```ts
{
  type: "jme",
  marks: parte.punti,
  prompt: `<p>${parte.consegna}</p>`,
  answer: parte.risposta,
  checkingType: "absdiff",
  checkingAccuracy: 0.001,
  failureRate: 1,
  vsetRange: [0, 1],
  vsetRangePoints: 5,
  checkVariableNames: false,
  expectedVariableNames: [],
  showPreview: true,
  valuegenerators: [],
}
```

**Il blocco question:**

```ts
{
  name: e.meta.titolo,
  statement: `<p>${e.testo}</p>`,
  advice: e.suggerimento ? `<p>${e.suggerimento}</p>` : "",
  variables: Object.fromEntries(e.variabili.map((v) =>
    [v.nome, { name: v.nome, definition: v.definizione, description: v.descrizione }])),
  variablesTest: { condition: e.condizione, maxRuns: 10 },
  ungrouped_variables: e.variabili.map((v) => v.nome),
  variable_groups: [],
  functions: {},
  rulesets: {},
  parts: e.parti.map(versoParte),
}
```

- [ ] **Passo 1: scrivi i test che falliscono**

```ts
import { describe, it, expect } from "vitest";
import { versoNumbas, versoFile } from "../verso-numbas";
import type { EsercizioEditor } from "../modello";

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

describe("tolleranza -> minValue/maxValue", () => {
  it("esatta produce estremi uguali", () => {
    const p = (versoNumbas(base) as any).parts[0];
    expect(p.minValue).toBe("-b/a");
    expect(p.maxValue).toBe("-b/a");
  });

  it("il margine produce un intervallo centrato, con il valore fra parentesi", () => {
    const e = { ...base, parti: [{ ...base.parti[0], tipo: "numerica",
      valore: "(c-b)/a", tolleranza: { tipo: "margine", margine: "0.01" } }] };
    const p = (versoNumbas(e as EsercizioEditor) as any).parts[0];
    expect(p.minValue).toBe("((c-b)/a) - (0.01)");
    expect(p.maxValue).toBe("((c-b)/a) + (0.01)");
  });

  it("le cifre decimali non allargano l'intervallo ma impostano la precisione", () => {
    const e = { ...base, parti: [{ ...base.parti[0], tipo: "numerica",
      valore: "pi", tolleranza: { tipo: "decimali", cifre: 2 } }] };
    const p = (versoNumbas(e as EsercizioEditor) as any).parts[0];
    expect(p.minValue).toBe("pi");
    expect(p.maxValue).toBe("pi");
    expect(p.precision).toBe("2");
    expect(p.precisionType).toBe("dp");
  });
});

describe("scelta multipla", () => {
  it("mette i punti sulla riga giusta e zero sulle altre", () => {
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "scelta",
      consegna: "Quale?", punti: 3,
      risposte: ["primo", "secondo", "terzo"], indiceGiusta: 1 }] };
    const p = (versoNumbas(e) as any).parts[0];
    expect(p.type).toBe("1_n_2");
    expect(p.matrix).toEqual(["0", "3", "0"]);
    expect(p.choices).toEqual(["<p>primo</p>", "<p>secondo</p>", "<p>terzo</p>"]);
    expect(p.shuffleChoices).toBe(true);
  });
});

describe("l'involucro", () => {
  it("versoFile produce un file che lo schema esistente accetta", () => {
    const file = versoFile(base);
    expect(() => esercizioFileSchema.parse(file)).not.toThrow();
    expect(file.savint.version).toBe(1);
    expect(file.savint.title).toBe("T");
  });

  it("dichiara ogni variabile in ungrouped_variables", () => {
    const q = versoNumbas(base) as any;
    expect(q.ungrouped_variables).toEqual(["a", "b"]);
  });
});
```

- [ ] **Passo 2: eseguili e verifica che falliscano**

`npx vitest run src/lib/esercizi/editor` — attesi errori di modulo mancante.

- [ ] **Passo 3: scrivi `modello.ts`, poi `verso-numbas.ts`**

Lo schema zod deve rifiutare: nome di variabile che non è un identificatore
(`/^[a-zA-Z_][a-zA-Z0-9_]*$/`), `parti` vuoto, `indiceGiusta` fuori
dall'intervallo delle risposte, meno di 2 o più di 6 risposte, `anno` fuori
da 1..5, `difficolta` fuori da 1..3, `cifre` fuori da 0..6.

**E deve rifiutare i marcatori nei campi di testo.** La specifica dice che
consegna, suggerimento e testo delle risposte sono testo semplice con formule,
non HTML, e la ragione è che il player rende quell'HTML nella pagina di ogni
studente della scuola. Un campo che contenga `<` o `>` viene rifiutato dallo
schema con un messaggio che spiega di scrivere le formule fra `\( \)` invece
che con marcatori.

Il rifiuto sta nello schema e non nell'interfaccia perché lo schema è anche
la validazione della rotta: una difesa che vive solo nel modulo non difende
da una richiesta costruita a mano. Serve un test che mandi
`<script>alert(1)</script>` in ciascuno dei campi di testo e veda il rifiuto.

- [ ] **Passo 4: eseguili e verifica che passino**

- [ ] **Passo 5: aggiungi i casi limite dello schema**

Un test per ciascun rifiuto elencato sopra, che verifichi il rifiuto e non
solo l'assenza di eccezione.

- [ ] **Passo 6: commit**

---

## Task 2: La conversione inversa e il riconoscimento del non rappresentabile

**Files:**
- Create: `src/lib/esercizi/editor/da-numbas.ts`
- Test: `src/lib/esercizi/editor/__tests__/da-numbas.test.ts`

**Interfaces — produce:**

```ts
export type Lettura =
  | { ok: true; editor: EsercizioEditor }
  | { ok: false; motivo: "tipo_non_supportato" | "costrutti_non_supportati";
      dettaglio: string };

export function daNumbas(file: EsercizioFile): Lettura;
```

**Consuma:** `EsercizioEditor` dal Task 1.

Questa è la funzione che protegge dal danno peggiore descritto nella
specifica: aprire un esercizio ricco, mostrarne la metà che si capisce, e
salvarne una versione con l'altra metà cancellata. **Nel dubbio deve
rifiutare.**

Rifiuta se: un tipo di parte non è fra i tre; `functions` non è vuoto;
`variable_groups` non è vuoto; una parte ha `gaps`; il testo contiene marcatori
oltre il `<p>` che avvolge (perché riaprendolo li perderebbe).

La coppia `minValue`/`maxValue` va ritradotta in valore + tolleranza:
uguali e senza `precision` → esatta; uguali con `precision` → decimali;
diversi nella forma `(v) - (m)` / `(v) + (m)` → margine con quel valore e
quel margine. **Una coppia diversa che non ha quella forma non è
rappresentabile** e va rifiutata: è un esercizio scritto a mano con un
intervallo asimmetrico, e reinterpretarlo perderebbe l'intenzione.

- [ ] **Passo 1: scrivi i test che falliscono**

```ts
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { daNumbas } from "../da-numbas";
import { versoFile } from "../verso-numbas";
import { esercizioFileSchema } from "@/lib/esercizi/format/schema";

const DIR = join(process.cwd(), "content/esercizi");
function leggi(nome: string) {
  return esercizioFileSchema.parse(
    JSON.parse(readFileSync(join(DIR, nome), "utf8")));
}

describe("il corpus reale", () => {
  // Il valore di questo test e' che i file NON sono stati scritti
  // dall'editor: sono il banco di prova indipendente.
  it.each([
    ["01-equazione-primo-grado.json", true],
    ["02-scomposizione-polinomi.json", true],
    ["03-sistemi-lineari.json", false],   // gapfill
    ["04-disequazioni-secondo-grado.json", false], // m_n_2
    ["05-goniometria-valori.json", false],  // m_n_x
    ["06-derivate-elementari.json", true],
    ["07-limiti-notevoli.json", true],      // numberentry con precision
    ["08-terminologia-funzioni.json", false], // patternmatch
  ])("%s rappresentabile: %s", (nome, atteso) => {
    expect(daNumbas(leggi(nome)).ok).toBe(atteso);
  });

  it("quando rifiuta, dice cosa non sa trattare", () => {
    const esito = daNumbas(leggi("03-sistemi-lineari.json"));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.dettaglio).toContain("gapfill");
  });
});

describe("andata e ritorno", () => {
  it("un esercizio scritto dall'editor si riapre identico", () => {
    // Copia nel file di test la costante `base` del Task 1 ed estendila con
    // tutte e tre le parti, cosi': il ritorno va provato su ogni tipo, non
    // solo sul numerico.
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
});

describe("il rifiuto prudente", () => {
  it("un intervallo asimmetrico non e' rappresentabile", () => {
    const file = versoFile(base) as any;
    file.question.parts[0].minValue = "1";
    file.question.parts[0].maxValue = "5";
    expect(daNumbas(file).ok).toBe(false);
  });

  it("una funzione definita dal docente rende l'esercizio non modificabile", () => {
    const file = versoFile(base) as any;
    file.question.functions = { f: { parameters: [], type: "number",
                                     definition: "1", language: "jme" } };
    expect(daNumbas(file).ok).toBe(false);
  });
});
```

- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi `da-numbas.ts`**
- [ ] **Passo 4: eseguili e verifica che passino**
- [ ] **Passo 5: commit**

---

## Task 3: La verifica a venti semi

**Files:**
- Create: `src/lib/esercizi/editor/verifica.ts`
- Test: `src/lib/esercizi/editor/__tests__/verifica.test.ts`

**Interfaces — produce:**

```ts
export type EsitoVerifica =
  | { ok: true }
  | { ok: false; seme: number;
      fase: "caricamento" | "testo" | "risposta";
      messaggio: string };

export function verificaSuSemi(question: unknown, quanti?: number): EsitoVerifica;
```

**Consuma:** `loadQuestion` da `@savint/engine`.

È il pezzo che giustifica l'intero sotto-progetto. Per ogni seme da 0 a
`quanti-1` (venti di default):

1. `loadQuestion(question, { seed, locale: "it" })` dentro un `try`. Un
   lancio è fase `caricamento`.
2. Il testo sostituito non deve contenere `\var{` residui né la stringa
   `undefined`. Fase `testo`.
3. Per ogni parte, `correctAnswer()` deve restituire qualcosa e il LaTeX
   prodotto non deve contenere `undefined`. Fase `risposta`.

Il terzo controllo esiste per un difetto noto e registrato del motore:
`renderLatex("sqrt()")` restituisce `\sqrt{ undefined }` invece di lanciare.
Senza questo controllo una risposta attesa incompleta passa in silenzio.

**Il primo seme che fallisce ferma la verifica** e viene riportato: al docente
serve un caso da guardare, non venti.

- [ ] **Passo 1: scrivi i test che falliscono**

```ts
describe("verificaSuSemi", () => {
  it("un esercizio sano passa venti semi", () => {
    expect(verificaSuSemi(versoNumbas(base))).toEqual({ ok: true });
  });

  it("una divisione per zero viene intercettata e il seme e' nominato", () => {
    const e = { ...base, variabili: [
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "1/a", descrizione: "" }] };
    const esito = verificaSuSemi(versoNumbas(e as EsercizioEditor));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("caricamento");
      expect(typeof esito.seme).toBe("number");
    }
  });

  it("una variabile inesistente nel testo viene intercettata", () => {
    const e = { ...base, testo: "Il valore e' \\(\\var{zeta}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
  });

  it("una condizione impossibile viene intercettata, non attesa all'infinito", () => {
    const e = { ...base, condizione: "a > 100" };  // a e' random(2..9)
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.fase).toBe("caricamento");
  });

  it("si ferma al primo seme che fallisce", () => {
    // un esercizio rotto per OGNI seme deve riportare il seme 0
    const e = { ...base, variabili: [
      { nome: "a", definizione: "1/0", descrizione: "" }] };
    const esito = verificaSuSemi(versoNumbas(e as EsercizioEditor));
    if (!esito.ok) expect(esito.seme).toBe(0);
  });
});
```

- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi `verifica.ts`**
- [ ] **Passo 4: eseguili e verifica che passino**
- [ ] **Passo 5: misura quanto costa**

Venti semi devono stare sotto il secondo su una macchina normale. Scrivilo nel
rapporto: se costano di più, il numero va discusso, non alzato in silenzio.

- [ ] **Passo 6: commit**

---

## Task 4: Il dominio della redazione

**Files:**
- Create: `src/lib/esercizi/redazione.ts`
- Test: `src/lib/esercizi/__tests__/redazione.test.ts`

**Interfaces — produce:**

```ts
export type EsitoRedazione =
  | { ok: true; esercizioId: string; versione: number }
  | { ok: false; motivo: "non_trovato" | "non_rappresentabile" | "verifica_fallita";
      dettaglio?: unknown };

export function creaEsercizio(input: EsercizioEditor, authorId: string): Promise<EsitoRedazione>;
export function salvaNuovaVersione(esercizioId: string, input: EsercizioEditor): Promise<EsitoRedazione>;
export function duplicaEsercizio(esercizioId: string, authorId: string): Promise<EsitoRedazione>;
export function elencoRedazione(): Promise<VoceRedazione[]>;
export function caricaPerEditor(esercizioId: string): Promise<
  | { ok: true; editor: EsercizioEditor; versione: number;
      autoreNome: string | null; aggiornatoIl: Date }
  | { ok: false; motivo: "non_trovato" | "non_rappresentabile";
      dettaglio: string }>;
// I metadati non tornano a parte: `editor.meta` li porta gia', ricostruiti
// dalla riga Esercizio. Duplicarli darebbe due fonti che possono divergere.

export type VoceRedazione = {
  id: string; titolo: string; argomento: string; anno: number;
  ultimaVersione: number; modificabile: boolean;
  autoreNome: string | null; aggiornatoIl: Date;
};
```

**Consuma:** Task 1, 2, 3 e `hashContenuto` da `format/schema.ts`.

**Le regole che i test devono fissare:**

- `creaEsercizio` e `salvaNuovaVersione` chiamano `verificaSuSemi` **prima**
  di scrivere, e un fallimento è un rifiuto senza alcuna scrittura.
- `salvaNuovaVersione` crea `version = max(version) + 1`. **Non aggiorna mai
  una riga `EsercizioVersione` esistente.**
- I metadati su `Esercizio` (titolo, anno, argomento, tag, difficoltà)
  vengono aggiornati; il contenuto no, quello vive nelle versioni.
- `duplicaEsercizio` crea un `Esercizio` nuovo con `version = 1`, e
  `authorId` è chi duplica, non l'autore originale.
- `elencoRedazione` marca `modificabile` chiamando `daNumbas` sull'ultima
  versione.
- `caricaPerEditor` su un esercizio non rappresentabile restituisce il
  rifiuto con il dettaglio, **non un modello parziale**.

- [ ] **Passo 1: scrivi i test che falliscono**

Il test che conta più di tutti:

```ts
it("salvare una versione nuova non tocca quella con cui un compito e' stato assegnato", async () => {
  // crea esercizio, mettilo in un contenitore, assegnalo in un compito,
  // annota compito.drawnVersionIds, poi salva una versione nuova
  const prima = compito.drawnVersionIds;
  await salvaNuovaVersione(esercizioId, { ...input, testo: "cambiato" });
  const dopo = await prisma.compito.findUnique({ where: { id: compitoId } });
  expect(dopo!.drawnVersionIds).toEqual(prima);
  const v1 = await prisma.esercizioVersione.findUnique({ where: { id: prima[0] } });
  expect((v1!.content as any).question.statement).not.toContain("cambiato");
});

it("un esercizio che fallisce la verifica non lascia nessuna riga", async () => {
  const quante = await prisma.esercizio.count();
  const esito = await creaEsercizio(inputRotto, docenteId);
  expect(esito.ok).toBe(false);
  expect(await prisma.esercizio.count()).toBe(quante);
});
```

- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi `redazione.ts`**
- [ ] **Passo 4: eseguili e verifica che passino**
- [ ] **Passo 5: commit**

---

## Task 5: Le rotte

**Files:**
- Create: `src/app/api/esercizi/redazione/route.ts`
- Create: `src/app/api/esercizi/redazione/[id]/route.ts`
- Create: `src/app/api/esercizi/redazione/[id]/duplica/route.ts`
- Create: `src/app/api/esercizi/redazione/verifica/route.ts`
- Modify: `src/app/api/__tests__/teacher-only-routes.test.ts`
- Test: `src/app/api/esercizi/__tests__/redazione-route.test.ts`

Modello da seguire: `src/app/api/esercizi/compiti/route.ts`.

Mappatura degli stati: `non_trovato` → 404, `non_rappresentabile` → 409,
`verifica_fallita` → **422 con il dettaglio della verifica nel corpo** — seme,
fase e messaggio. È il punto in cui questo task fallisce più facilmente:
appiattire quel dettaglio in «salvataggio non riuscito» toglierebbe al docente
l'unica informazione utile che abbiamo.

`verifica/route.ts` è la stessa verifica senza salvare, per il pulsante
«controlla» del modulo. Chiave di tetto propria.

Chiavi di tetto: `esercizi:redazione-crea:`, `esercizi:redazione-salva:`,
`esercizi:redazione-duplica:`, `esercizi:redazione-verifica:`, ciascuna con
l'identificativo del docente.

- [ ] **Passo 1: scrivi i test che falliscono**, compreso quello che il
      dettaglio della verifica arriva nel corpo
- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi le rotte**
- [ ] **Passo 4: estendi il registro `teacher-only-routes.test.ts`**
- [ ] **Passo 5: eseguili e verifica che passino**
- [ ] **Passo 6: commit**

---

## Task 6: Il modulo — metadati, testo, variabili

**Files:**
- Create: `src/components/esercizi/editor/pannello-variabili.tsx`
- Create: `src/components/esercizi/editor/editor-esercizio.tsx` (scheletro e
  metadati; le parti arrivano nel Task 7)
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: `src/components/esercizi/editor/__tests__/pannello-variabili.test.tsx`

Il pannello: una riga per variabile con nome, definizione, descrizione, più
il campo condizione. L'errore di una definizione compare **accanto alla riga
che lo causa**.

Due cose che l'interfaccia deve dire, perché sono le meno ovvie e si sbagliano
proprio mentre si scrive:

1. dentro `\simplify{...}` le variabili si scrivono `{a}`, fuori `\var{a}`,
   con un esempio di entrambe;
2. l'ordine non conta — il motore risolve le dipendenze — perché
   l'aspettativa contraria è naturale.

- [ ] **Passo 1: scrivi i test che falliscono**
- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi i componenti e le traduzioni**
- [ ] **Passo 4: eseguili e verifica che passino**
- [ ] **Passo 5: commit**

---

## Task 7: I tre moduli di parte e l'anteprima

**Files:**
- Create: `src/components/esercizi/editor/parte-numerica.tsx`
- Create: `src/components/esercizi/editor/parte-scelta.tsx`
- Create: `src/components/esercizi/editor/parte-espressione.tsx`
- Create: `src/components/esercizi/editor/anteprima.tsx`
- Modify: `src/components/esercizi/editor/editor-esercizio.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: uno per componente

**L'anteprima usa `player-esercizio`**, lo stesso componente dello studente —
non una riproduzione. Tre semi affiancati, un pulsante per rigenerarli.

**L'anteprima è inerte:** nessun tentativo creato, nessuna scrittura. Il
player va usato nella sua modalità locale; se non ne ha una, va aggiunta una
proprietà che disattiva le chiamate al server, **senza cambiare il
comportamento esistente** — un test deve fissare che il percorso dello
studente continua a scrivere.

La parte numerica mostra valore e tolleranza, mai `minValue`. La scelta
multipla da 2 a 6 risposte con un solo segno di giusta.

- [ ] **Passo 1: scrivi i test che falliscono**
- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi i componenti**
- [ ] **Passo 4: eseguili e verifica che passino**
- [ ] **Passo 5: commit**

---

## Task 8: Le pagine

**Files:**
- Create: `src/app/(dashboard)/dashboard/esercizi/redazione/page.tsx`
- Create: `src/app/(dashboard)/dashboard/esercizi/redazione/nuovo/page.tsx`
- Create: `src/app/(dashboard)/dashboard/esercizi/redazione/[id]/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/esercizi/page.tsx` (la voce di menu)
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: uno per pagina

L'elenco distingue a vista modificabile da sola lettura, e per i secondi dice
**perché** e offre il duplica. Mostra autore e data dell'ultima versione, come
richiesto dalla specifica per rendere visibile che due docenti possono
sovrascriversi.

La riga che la specifica impone: dichiarare che qualunque docente può
modificare qualunque esercizio.

- [ ] **Passo 1: scrivi i test che falliscono**
- [ ] **Passo 2: eseguili e verifica che falliscano**
- [ ] **Passo 3: scrivi le pagine**
- [ ] **Passo 4: eseguili e verifica che passino**
- [ ] **Passo 5: commit**

---

## Task 9: Prova end-to-end

**Files:**
- Create: `tests/e2e/esercizi-editor.spec.ts`

Il docente crea un esercizio con una variabile casuale e una risposta
numerica, vede l'anteprima cambiare fra i semi, salva, lo mette in un
contenitore, lo assegna. Lo studente lo apre e lo risolve.

L'asserzione che conta: **due studenti diversi ricevono numeri diversi** per
lo stesso esercizio. È l'intero motivo del sotto-progetto e va provato, non
dato per scontato.

Seconda asserzione: un esercizio che fallisce la verifica **non si salva**, e
il messaggio nomina il seme.

Come il modello già in repo (`tests/e2e/esercizi-compiti.spec.ts`): porta
3100, `test.use({ locale: "it-IT" })`, nomi unici per esecuzione, pulizia per
prefisso. La prova deve passare due volte di fila su un database sporco.

- [ ] **Passo 1: scrivi la prova**
- [ ] **Passo 2: eseguila due volte**
- [ ] **Passo 3: commit**

---

## Note per il controllore

- **Nessuna migrazione in questo piano.** Se un task ne propone una, è un
  segnale che ha frainteso: lo schema esistente basta.
- **Il Task 2 è il guardiano.** Se sbaglia in senso permissivo — dichiara
  modificabile un esercizio che non sa ricostruire — il danno è un
  salvataggio con perdita silenziosa. Nel dubbio deve rifiutare, e la
  revisione deve verificare quel verso in particolare.
- **Il Task 3 è la ragione del sotto-progetto.** Un test che verifica che la
  funzione esiste non vale niente: servono esercizi davvero rotti, che
  falliscano davvero, con il seme nominato.
- **Il Task 7 tocca il player**, che è codice del sotto-progetto 3 con i suoi
  test. Se un test esistente del player si rompe, è un segnale, non un
  fastidio.
- Gli otto file in `content/esercizi/` sono il banco di prova indipendente del
  Task 2 proprio perché **non** sono stati scritti dall'editor. Modificarli
  per farli passare svuoterebbe il test.
