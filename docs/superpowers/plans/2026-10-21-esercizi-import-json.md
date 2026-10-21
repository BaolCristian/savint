# Import esercizi da JSON (IA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Il docente genera esercizi con un'IA partendo da un prompt pronto, li incolla/carica in Savint, li vede in anteprima e li importa come esercizi normali.

**Architecture:** Un modulo puro `src/lib/esercizi/importa/` (estrazione del JSON dal testo, normalizzazione, prompt + esempio, tipi degli esiti) usato sia dal client sia dal server; un modulo di dominio che controlla (schema → verifica su semi → doppioni) e crea con `creaEsercizio`; due rotte API; una pagina di import con anteprima `soloLocale`; una scheda "Esercizi" nella pagina Prompt IA.

**Tech Stack:** Next.js App Router, TypeScript, zod, Prisma, next-intl, vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-21-esercizi-import-json-design.md`

## Global Constraints

- Formato: il modello dell'editor `EsercizioEditor` (`src/lib/esercizi/editor/modello.ts`), involucro `{ "esercizi": [...] }`, oppure array nudo, oppure oggetto singolo.
- Massimo **30** esercizi per import; corpo delle richieste massimo **1 MB** (1_000_000 byte) → 413.
- Normalizzazione solo dei vuoti mancanti: `meta.descrizione: ""`, `meta.tag: []`, `suggerimento: ""`, `variabili: []`, `condizione: ""`. Nient'altro.
- Doppione = `hashContenuto(versoNumbas(input))` uguale all'`hash` di una qualsiasi `EsercizioVersione`, o a quello di un elemento precedente dello stesso import.
- Il server rifà sempre normalizzazione + schema + verifica + doppioni: non si fida del client.
- Nessuna migrazione Prisma. Non toccare migrazioni esistenti.
- Niente grafici/figure/immagini nel prompt.
- Tutte le stringhe UI in `src/messages/it.json` e `en.json`. **Il testo del prompt NON va nei messaggi** (contiene `{`/`}` del JSON, che ICU di next-intl interpreterebbe): vive in `src/lib/esercizi/importa/prompt.ts` (deviazione voluta dallo spec, che diceva "messaggi").
- Rate limit: chiavi `esercizi:redazione-importa-verifica:<id>` e `esercizi:redazione-importa:<id>`, `windowSeconds: 60`, `max: 10`.
- Suite: mai due suite insieme sul DB di sviluppo; dopo merge che toccano lo schema, `npx prisma generate` prima, in un comando separato.
- Commenti e nomi in italiano, nello stile dei file vicini.

## Review Focus

1. Testo copiato dall'IA con virgolette tipografiche (`“ ”`) o con BOM iniziale → il BOM va tolto; le virgolette tipografiche danno un errore "non è JSON valido" leggibile, non un crash. Test nel Task 1.
2. Numeri scritti come stringhe dall'IA (`"anno": "2"`) → elemento `invalido` con il percorso `meta.anno` nel messaggio. Test nel Task 3.
3. Lo stesso esercizio due volte nello stesso file → il secondo è `gia_presente`. Test nel Task 3.
4. Doppio clic su "Importa" → il pulsante è disabilitato durante la richiesta, e un secondo import dello stesso contenuto lato server dà `gia_presente` invece di una copia. Test nei Task 3 e 5.
5. Un elemento non oggetto (`null`, una stringa) dentro l'array → `invalido` per quell'elemento, gli altri proseguono. Test nel Task 3.

---

### Task 1: Estrazione e normalizzazione

**Files:**
- Create: `src/lib/esercizi/importa/estrai.ts`
- Test: `src/lib/esercizi/importa/__tests__/estrai.test.ts`

**Interfaces:**
- Produces:
  - `export const MAX_ESERCIZI_IMPORT = 30;`
  - `export type EsitoEstrazione = { ok: true; elementi: unknown[] } | { ok: false; motivo: "vuoto" | "non_json" | "troppi"; messaggio: string };`
  - `export function estraiEsercizi(testo: string): EsitoEstrazione`
  - `export function normalizza(elemento: unknown): unknown`

- [ ] **Step 1: Write the failing tests**

```ts
const es = { meta: { titolo: "T" }, testo: "x", parti: [] };
it("involucro { esercizi }", () => expect(estraiEsercizi(JSON.stringify({ esercizi: [es, es] }))).toEqual({ ok: true, elementi: [es, es] }));
it("array nudo", () => expect(estraiEsercizi(JSON.stringify([es]))).toEqual({ ok: true, elementi: [es] }));
it("oggetto singolo", () => expect(estraiEsercizi(JSON.stringify(es))).toEqual({ ok: true, elementi: [es] }));
it("blocco ```json con testo attorno", () =>
  expect(estraiEsercizi("Ecco:\n```json\n" + JSON.stringify({ esercizi: [es] }) + "\n```\nBuon lavoro!")).toEqual({ ok: true, elementi: [es] }));
it("toglie il BOM", () => expect(estraiEsercizi("﻿" + JSON.stringify([es])).ok).toBe(true));
it("vuoto", () => expect(estraiEsercizi("   ")).toMatchObject({ ok: false, motivo: "vuoto" }));
it("virgolette tipografiche → non_json leggibile", () => {
  const r = estraiEsercizi("{“esercizi”: []}");
  expect(r).toMatchObject({ ok: false, motivo: "non_json" });
  expect((r as { messaggio: string }).messaggio).toMatch(/JSON/);
});
it("più di 30 → troppi", () => expect(estraiEsercizi(JSON.stringify(Array(31).fill(es)))).toMatchObject({ ok: false, motivo: "troppi" }));
it("array vuoto → vuoto", () => expect(estraiEsercizi("[]")).toMatchObject({ ok: false, motivo: "vuoto" }));

it("normalizza aggiunge solo i vuoti mancanti", () =>
  expect(normalizza({ meta: { titolo: "T" }, testo: "x", parti: [] })).toEqual({
    meta: { titolo: "T", descrizione: "", tag: [] }, testo: "x", parti: [], suggerimento: "", variabili: [], condizione: "",
  }));
it("normalizza non sovrascrive i presenti", () => {
  const pieno = { meta: { titolo: "T", descrizione: "d", tag: ["a"] }, testo: "x", suggerimento: "s", variabili: [], condizione: "c", parti: [] };
  expect(normalizza(pieno)).toEqual(pieno);
});
it("normalizza lascia stare i non-oggetti", () => { expect(normalizza(null)).toBeNull(); expect(normalizza("x")).toBe("x"); });
```

- [ ] **Step 2: Run** `npx vitest run src/lib/esercizi/importa/__tests__/estrai.test.ts` — Expected: FAIL (modulo mancante).

- [ ] **Step 3: Implement** in `estrai.ts`. Approccio: togli BOM e spazi; se c'è un blocco ```` ``` ```` (con o senza `json`) usa il suo contenuto; altrimenti taglia dal primo `{`/`[` all'ultimo `}`/`]`. `JSON.parse` in try → `non_json` con messaggio italiano "Il testo non è JSON valido: <messaggio di JSON.parse>" (aggiungere "controlla le virgolette: devono essere \" e non “ ”" quando il testo contiene `“` o `”`). Poi involucro: oggetto con array `esercizi` → quello; array → quello; altro oggetto → `[oggetto]`. Lunghezza 0 → `vuoto`; > 30 → `troppi`. `normalizza` aggiunge le cinque chiavi solo se assenti (`=== undefined`) su un oggetto non-array; `meta` solo se è un oggetto.

- [ ] **Step 4: Run** lo stesso comando — Expected: PASS.

- [ ] **Step 5: Commit** `feat(esercizi): estrazione del JSON degli esercizi incollato dall'IA`

---

### Task 2: Prompt per l'IA ed esempio verificato

**Files:**
- Create: `src/lib/esercizi/importa/prompt.ts`
- Test: `src/lib/esercizi/importa/__tests__/prompt.test.ts`

**Interfaces:**
- Consumes: `esercizioEditorSchema`, `EsercizioEditor` (modello.ts); `verificaEsercizio(input: EsercizioEditor): EsitoVerifica` (redazione.ts).
- Produces:
  - `export const ESEMPIO_IMPORT: { esercizi: EsercizioEditor[] }` — due esercizi: (1) distanza fra A(xA;yA) e B(xB;yB) con coordinate `random(-9..9)`, `condizione` che esclude A = B, parte `numerica` con tolleranza `decimali` 2; (2) punto medio con due parti `numerica` (`x_M`, `y_M`), tolleranza `esatta` o `margine`.
  - `export interface DatiPrompt { argomento: string; classe: number /* 1..5 */; quanti: number /* 1..30 */ }`
  - `export function promptEsercizi(dati: DatiPrompt, locale: "it" | "en"): string`

- [ ] **Step 1: Write the failing tests**

```ts
it("ogni esempio passa schema e verifica su semi", () => {
  for (const e of ESEMPIO_IMPORT.esercizi) {
    expect(esercizioEditorSchema.safeParse(e).success).toBe(true);
    expect(verificaEsercizio(e)).toEqual({ ok: true });
  }
});
it("il prompt contiene l'esempio, l'argomento, la classe e il numero", () => {
  const p = promptEsercizi({ argomento: "piano cartesiano", classe: 2, quanti: 7 }, "it");
  expect(p).toContain(JSON.stringify(ESEMPIO_IMPORT, null, 2));
  expect(p).toContain("piano cartesiano");
  expect(p).toMatch(/"anno": 2|anno.*2/);
  expect(p).toContain("7");
});
it("il prompt vieta grafici e figure", () => expect(promptEsercizi({ argomento: "x", classe: 1, quanti: 1 }, "it")).toMatch(/grafic/i));
it("esiste la versione inglese", () => expect(promptEsercizi({ argomento: "x", classe: 1, quanti: 1 }, "en")).toMatch(/JSON/));
```

- [ ] **Step 2: Run** `npx vitest run src/lib/esercizi/importa/__tests__/prompt.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Il testo del prompt deve coprire (spec, sezione "La pagina del prompt"): involucro `{ "esercizi": [...] }`; tutti i campi di `EsercizioEditor` con i vincoli (anno 1–5, difficoltà 1–3, punti ≥ 1, 2–6 risposte `scelta` con `indiceGiusta` da 0, 2–8 `sceltaMultipla` con `corrette` lungo quanto `risposte` e almeno un `true`, tolleranze `esatta`/`margine`/`decimali` 0–6); variabili JME (`random(a..b)`, `random(a..b except 0)`, `precround`, `sqrt`), uso nei testi con `\var{nome}` e formule tra `\( \)` come nell'esempio; `condizione` per escludere sorteggi degeneri; difficoltà e tipo di parte li sceglie l'IA; niente grafici/figure/immagini/HTML; rispondere **solo** con il JSON. Usare `meta.anno = classe`, numero di esercizi = `quanti`. Prima di scrivere l'esempio, copiare la sintassi da un esercizio esistente (`content/esercizi/10-sconto.json` per `\var{}`, e `base` in `src/lib/esercizi/__tests__/redazione.test.ts` per il formato editor).

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(esercizi): prompt per generare esercizi con l'IA, con esempio verificato`

---

### Task 3: Dominio — controllo e import

**Files:**
- Create: `src/lib/esercizi/importa/tipi.ts`, `src/lib/esercizi/importa/importa.ts`
- Test: `src/lib/esercizi/__tests__/importa.test.ts` (DB reale, come `redazione.test.ts`: prefisso `importatest-` sui titoli, pulizia in `beforeEach`/`afterAll`)

**Interfaces:**
- Consumes: `normalizza` (Task 1); `esercizioEditorSchema`; `versoNumbas`; `verificaEsercizio`, `creaEsercizio` (redazione.ts); `hashContenuto` (`../format/schema`); `prisma`.
- Produces (in `tipi.ts`, senza import server: lo usa anche il client):
  ```ts
  export type Problema = { percorso: string; messaggio: string };
  export type EsitoControllo =
    | { indice: number; stato: "ok"; titolo: string; content: unknown }
    | { indice: number; stato: "invalido"; titolo: string | null; problemi: Problema[] }
    | { indice: number; stato: "verifica_fallita"; titolo: string; dettaglio: { seme: number; fase: string; messaggio: string } }
    | { indice: number; stato: "gia_presente"; titolo: string; titoloEsistente: string };
  export type EsitoImport =
    | { indice: number; stato: "creato"; titolo: string; esercizioId: string }
    | Exclude<EsitoControllo, { stato: "ok" }>;
  export function testoErrorePerIA(esito: Exclude<EsitoControllo, { stato: "ok" }>): string;
  ```
  - In `importa.ts`: `export async function controllaImport(elementi: unknown[]): Promise<EsitoControllo[]>` e `export async function importaEsercizi(elementi: unknown[], authorId: string): Promise<EsitoImport[]>`.

- [ ] **Step 1: Write the failing tests**

```ts
it("ok: restituisce titolo e content Numbas", async () => {
  const [r] = await controllaImport([valido("A")]);
  expect(r).toMatchObject({ indice: 0, stato: "ok", titolo: `${PREFIX}A` });
  expect(r.stato === "ok" && r.content).toEqual(versoNumbas(valido("A")));
});
it("campi vuoti mancanti accettati", async () => {
  const { suggerimento, condizione, ...senza } = valido("B");
  expect((await controllaImport([senza]))[0].stato).toBe("ok");
});
it("anno come stringa → invalido con percorso meta.anno", async () => {
  const e = valido("C"); (e.meta as any).anno = "2";
  const [r] = await controllaImport([e]);
  expect(r.stato).toBe("invalido");
  expect(r.stato === "invalido" && r.problemi.map((p) => p.percorso)).toContain("meta.anno");
});
it("null e stringa nell'array → invalido solo quelli", async () => {
  const r = await controllaImport([null, "x", valido("D")]);
  expect(r.map((x) => x.stato)).toEqual(["invalido", "invalido", "ok"]);
});
it("variabile inesistente → verifica_fallita", async () => {
  const e = valido("E"); e.testo = "\\(\\var{zeta}\\)";
  expect((await controllaImport([e]))[0].stato).toBe("verifica_fallita");
});
it("stesso esercizio due volte nel file → il secondo gia_presente", async () => {
  const r = await controllaImport([valido("F"), valido("F")]);
  expect(r.map((x) => x.stato)).toEqual(["ok", "gia_presente"]);
});
it("importa crea con l'autore, poi un secondo import è gia_presente", async () => {
  const [a] = await importaEsercizi([valido("G")], docenteId);
  expect(a.stato).toBe("creato");
  const riga = await prisma.esercizio.findUnique({ where: { id: (a as any).esercizioId } });
  expect(riga?.authorId).toBe(docenteId);
  expect((await importaEsercizi([valido("G")], docenteId))[0]).toMatchObject({ stato: "gia_presente", titoloEsistente: `${PREFIX}G` });
});
it("un elemento rotto non blocca gli altri", async () => {
  const r = await importaEsercizi([null, valido("H")], docenteId);
  expect(r.map((x) => x.stato)).toEqual(["invalido", "creato"]);
});
it("testoErrorePerIA nomina esercizio, campo e chiede tutto il JSON", () => {
  const t = testoErrorePerIA({ indice: 2, stato: "invalido", titolo: "Distanza", problemi: [{ percorso: "meta.anno", messaggio: "Expected number" }] });
  expect(t).toContain("3"); expect(t).toContain("Distanza"); expect(t).toContain("meta.anno"); expect(t).toMatch(/tutto il JSON/);
});
```
`valido(nome)` = un `EsercizioEditor` completo e valido con titolo `${PREFIX}${nome}` (testo diverso per nome, così l'hash cambia).

- [ ] **Step 2: Run** `npx vitest run src/lib/esercizi/__tests__/importa.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** `controllaImport`: per ogni elemento `normalizza` → `esercizioEditorSchema.safeParse` (problemi = `error.issues.map(i => ({ percorso: i.path.join("."), messaggio: i.message }))`; titolo dall'elemento grezzo se è una stringa) → `verificaEsercizio` → `hashContenuto(versoNumbas(input))`. Alla fine **una** query `prisma.esercizioVersione.findMany({ where: { hash: { in: hashes } }, select: { hash: true, esercizio: { select: { title: true } } } })` per marcare `gia_presente`; dentro lo stesso import, il secondo con lo stesso hash è `gia_presente` con `titoloEsistente` = titolo del primo. `importaEsercizi`: `controllaImport`, poi `creaEsercizio` per ogni `ok`, in sequenza; se `creaEsercizio` rifiuta, l'esito diventa `verifica_fallita` col suo dettaglio. `testoErrorePerIA`: italiano, numerazione da 1.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(esercizi): controllo e import di esercizi in blocco, con doppioni`

---

### Task 4: Rotte API

**Files:**
- Create: `src/app/api/esercizi/redazione/importa/route.ts`, `src/app/api/esercizi/redazione/importa/verifica/route.ts`
- Test: `src/app/api/esercizi/__tests__/importa-route.test.ts` (stile di `redazione-route.test.ts`: mock di `require-role`, `rate-limit` e `@/lib/esercizi/importa/importa`)

**Interfaces:**
- Consumes: `controllaImport`, `importaEsercizi`, `MAX_ESERCIZI_IMPORT`.
- Produces:
  - `POST /api/esercizi/redazione/importa/verifica` corpo `{ esercizi: unknown[] }` → 200 `{ esiti: EsitoControllo[] }`
  - `POST /api/esercizi/redazione/importa` corpo `{ esercizi: unknown[] }` → 200 `{ esiti: EsitoImport[] }`
  - Errori: 401/403 dal gate; 429 `{ error: "rate_limited" }` con `Retry-After`; 413 `{ error: "troppo_grande" }` se il testo del corpo supera 1_000_000 byte; 400 `{ error: "invalid_body" }` se manca l'array o ha più di 30 elementi o 0.

- [ ] **Step 1: Write the failing tests** — per entrambe le rotte: 401, 403, 429 (non chiama il dominio), 413 con corpo di 1_000_001 caratteri, 400 con `{}`, 400 con 31 elementi, 200 che passa gli elementi **grezzi** al dominio (`expect(controllaImport).toHaveBeenCalledWith([elem1, elem2])`) e restituisce `{ esiti }`; l'import passa `"docente1"` come `authorId`.

- [ ] **Step 2: Run** `npx vitest run src/app/api/esercizi/__tests__/importa-route.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement.** Leggere `await request.text()`, controllare la lunghezza, poi `JSON.parse` in try; schema `z.object({ esercizi: z.array(z.unknown()).min(1).max(MAX_ESERCIZI_IMPORT) })` — gli elementi restano `unknown`, li valida il dominio uno per uno.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(esercizi): rotte per controllare e importare esercizi da JSON`

---

### Task 5: Pagina di import

**Files:**
- Create: `src/app/(dashboard)/dashboard/esercizi/redazione/importa/page.tsx`, `.../importa/importa-client.tsx`
- Modify: `src/app/(dashboard)/dashboard/esercizi/redazione/page.tsx` (pulsante "Importa da file" accanto a "Nuovo esercizio"; avviso da `?importati=N&saltati=M`)
- Modify: `src/messages/it.json`, `src/messages/en.json` (chiave nuova `esercizi.redazione.importa.*`, più `esercizi.redazione.elenco.importa` e `esercizi.redazione.elenco.importati`)
- Test: `src/app/(dashboard)/dashboard/esercizi/redazione/importa/__tests__/importa-client.test.tsx`, aggiornare `src/app/(dashboard)/dashboard/esercizi/redazione/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `estraiEsercizi` (Task 1), tipi e `testoErrorePerIA` (Task 3), rotte (Task 4), `PlayerEsercizioLazy` con `soloLocale` come in `anteprima-docente-client.tsx`, `withBasePath` per i `fetch`.
- Produces: `export function ImportaClient({ locale }: { locale: "it" | "en" })`.

Comportamento (spec, "La pagina di import"): area di testo + input file `.json` (il file si legge con `file.text()` e riempie l'area); "Controlla" → `estraiEsercizi` lato client (errore mostrato subito se `ok: false`) → POST verifica → una scheda per esito: titolo, argomento/anno/difficoltà per gli `ok` (dall'elemento), anteprima con un sorteggio e "Altri numeri"; per `invalido`/`verifica_fallita` il messaggio e "Copia l'errore per l'IA" (`navigator.clipboard.writeText(testoErrorePerIA(e))`); per `gia_presente` "Già importato come «titoloEsistente»". Pulsante "Importa N esercizi" (N = quanti `ok`; disabilitato se 0 o durante la richiesta) → POST import con **solo** gli elementi `ok` → `router.push("/dashboard/esercizi/redazione?importati=<creati>&saltati=<altri>")`.

- [ ] **Step 1: Write the failing tests** (mock di `fetch` e del player lazy):
  - testo non JSON → mostra l'errore, nessun `fetch`;
  - esiti `[ok, invalido, gia_presente]` → tre schede, pulsante "Importa 1 esercizi" (testo secondo il messaggio con plurale ICU), "Copia l'errore per l'IA" copia un testo contenente il percorso;
  - clic su Importa → il `fetch` di import riceve solo l'elemento `ok`; il pulsante è disabilitato finché la richiesta è in corso (un secondo clic non fa un secondo `fetch`); al termine `router.push` con `importati=1&saltati=2`;
  - pagina redazione: c'è il link a `/dashboard/esercizi/redazione/importa`, e con `importati=3` mostra l'avviso.

- [ ] **Step 2: Run** `npx vitest run "src/app/(dashboard)/dashboard/esercizi/redazione"` — Expected: FAIL.

- [ ] **Step 3: Implement** `page.tsx` (server: `redirectUnlessTeacher`, `TeacherExercisesNav` come la redazione, titolo, link "Torna ai miei esercizi", `ImportaClient`) e il client; aggiungere i testi it/en; il pulsante e l'avviso sulla pagina della redazione.

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(esercizi): pagina di import con anteprima e doppioni`

---

### Task 6: Scheda "Esercizi" nella pagina Prompt IA

**Files:**
- Modify: `src/app/(dashboard)/dashboard/ai-prompts/page.tsx`
- Create: `src/app/(dashboard)/dashboard/ai-prompts/prompt-esercizi.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json` (chiavi `ai.schede.quiz`, `ai.schede.esercizi`, `ai.esercizi.*`: titolo, istruzioni, argomento, classe, quanti, copia, link all'import)
- Test: `src/app/(dashboard)/dashboard/ai-prompts/__tests__/prompt-esercizi.test.tsx`

**Interfaces:**
- Consumes: `promptEsercizi`, `DatiPrompt` (Task 2); `useLocale` di next-intl.
- Produces: `export function PromptEsercizi()`.

La scheda Quiz resta esattamente com'è (spostare il suo JSX in un componente interno solo se serve per le schede). Campi Esercizi: argomento (testo), classe (select 1ª–5ª, default 1), quanti (numero, default 5, 1–30). Il prompt mostrato si aggiorna ai campi; pulsante copia; link "Importa gli esercizi" a `/dashboard/esercizi/redazione/importa`.

- [ ] **Step 1: Write the failing tests:** con argomento "piano cartesiano", classe 3, quanti 4 il `<pre>` contiene `promptEsercizi({ argomento: "piano cartesiano", classe: 3, quanti: 4 }, "it")`; "Copia" chiama `clipboard.writeText` con lo stesso testo; c'è il link all'import; quanti fuori range (0, 31) viene riportato dentro 1–30.

- [ ] **Step 2: Run** `npx vitest run "src/app/(dashboard)/dashboard/ai-prompts"` — Expected: FAIL.

- [ ] **Step 3: Implement.**

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Commit** `feat(ai-prompts): scheda Esercizi con prompt pronto`

---

### Task 7: Verifica finale

- [ ] **Step 1:** `npx tsc --noEmit` — Expected: nessun errore.
- [ ] **Step 2:** `npm run lint` — Expected: nessun errore nei file toccati.
- [ ] **Step 3:** `npm run test:run` (una sola suite alla volta) — Expected: tutto verde; se qualcosa fallisce fuori dai file toccati, verificare su `main` prima di toccarlo.
- [ ] **Step 4:** Prova a mano con `npm run dev`: copiare il prompt della scheda Esercizi, incollare in pagina di import `ESEMPIO_IMPORT` (e una versione con un errore), controllare anteprima, importare, rifare l'import e vedere "già importato".
