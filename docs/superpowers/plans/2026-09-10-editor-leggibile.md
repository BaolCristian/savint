# L'editor leggibile, e le formule visuali — piano di implementazione

> **Per chi esegue:** SOTTO-ABILITÀ RICHIESTA: usare
> superpowers:subagent-driven-development, un task alla volta.

**Obiettivo:** l'editor degli esercizi diventa a due colonne — a sinistra si
scrive, a destra si vede — con l'eco del motore sotto ogni campo JME e
MathLive come assistente per le formule.

**Architettura:** nessun cambio al modello, al formato, al motore né al
corpus. Si ristruttura `editor-esercizio.tsx` (oggi un unico blocco da 500
righe) in componenti di presentazione, si sostituiscono i tre player
dell'anteprima con uno solo a linguette, e si aggiunge MathLive caricato
pigramente solo dove serve.

**Stack:** Next.js 16, React 19, next-intl, `@savint/engine` (KaTeX già
presente via `Formula`), MathLive 0.110.0 (nuovo, dai Task 6-7).

**Spec:** `docs/superpowers/specs/2026-09-10-editor-leggibile-design.md`

## Vincoli globali

- **Il modello non cambia.** `EsercizioEditor`, `versoNumbas`, `daNumbas`,
  `verifica.ts` e il corpus in `content/esercizi/` restano identici: se un
  task ha bisogno di toccarli, il task è sbagliato. L'unica eccezione
  ammessa è aggiungere un modulo NUOVO sotto `src/lib/esercizi/editor/`.
- **Non si toccano `src/components/ui/input.tsx` né `textarea.tsx`**: li
  usano decine di altre schermate.
- Ogni stringa visibile passa da next-intl, in **entrambi** `src/messages/it.json`
  e `src/messages/en.json`. Il conteggio delle chiavi nei due file coincide.
- **Regole del compilatore React**: niente `setState` dentro `useEffect` per
  ricavare valori da altri stati — si derivano. È bloccante in CI su questa
  superficie e ha già fatto fallire due volte.
- Database di sviluppo condiviso col committente. Mai `prisma migrate
  reset`. Mai occupare la porta 3000; Playwright usa la 3100. Fermare un
  server **per porta** (`lsof -ti:PORTA | xargs kill`), mai per
  corrispondenza sulla riga di comando. **Mai `npm ci`**, mai `git stash`
  (la pila è condivisa fra worktree).
- Prove guidate dal comportamento: si asserisce su un **valore che il
  docente vede**, non sull'esistenza di un nodo. Pulizia circoscritta per
  prefisso.
- Commit in italiano, ciascuno chiuso da:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611
  ```

## Struttura dei file

| File | Responsabilità |
|---|---|
| `src/components/esercizi/editor/editor-esercizio.tsx` | *(esiste, 500 righe)* → resta lo stato e le azioni; l'impaginazione esce |
| `src/components/esercizi/editor/impaginazione.tsx` | **nuovo** — le due colonne, la barra d'azione fissa, la scheda |
| `src/components/esercizi/editor/scheda-catalogo.tsx` | **nuovo** — i metadati ripiegati |
| `src/components/esercizi/editor/anteprima.tsx` | *(esiste)* → un player, linguette per i semi |
| `src/components/esercizi/editor/valori-sorteggiati.tsx` | **nuovo** — la tabella variabili × semi |
| `src/components/esercizi/editor/eco-jme.tsx` | **nuovo** — l'eco sotto un campo JME |
| `src/components/esercizi/editor/campo-jme.tsx` | **nuovo** — campo + eco + tastierino |
| `src/components/esercizi/editor/campo-testo-matematico.tsx` | **nuovo** — textarea + palette + inserisci variabile |
| `src/lib/esercizi/editor/ascii-jme.ts` | **nuovo** — la conversione ASCIIMath → JME |
| `src/components/esercizi/editor/finestra-formula.tsx` | **nuovo** — MathLive caricato pigramente |

---

## Task 1: Le due colonne

**Files:**
- Crea: `src/components/esercizi/editor/impaginazione.tsx`
- Crea: `src/components/esercizi/editor/scheda-catalogo.tsx`
- Modifica: `src/components/esercizi/editor/editor-esercizio.tsx`
- Messaggi: `src/messages/it.json`, `src/messages/en.json`
- Test: `src/components/esercizi/editor/__tests__/impaginazione.test.tsx`,
  e i test esistenti di `editor-esercizio` che cambiano di forma

**Interfacce — produce:**

```ts
export interface ImpaginazioneEditorProps {
  intestazione: React.ReactNode;   // titolo + scheda catalogo
  scrittura: React.ReactNode;      // colonna sinistra
  visione: React.ReactNode;        // colonna destra, appiccicata
  azioni: React.ReactNode;         // barra in fondo, appiccicata
}
export function ImpaginazioneEditor(props: ImpaginazioneEditorProps): JSX.Element;

export interface SchedaCatalogoProps {
  meta: EsercizioEditor["meta"];
  onChange: (campo: keyof EsercizioEditor["meta"], valore: unknown) => void;
}
export function SchedaCatalogo(props: SchedaCatalogoProps): JSX.Element;
```

**La forma.** Sopra i 1280 pixel: due colonne, la sinistra elastica, la
destra fissa a 420 pixel con `position: sticky` sotto l'intestazione.
Sotto i 1280: una colonna sola, la visione dopo la scrittura. La barra
delle azioni — Controlla, Salva, lo stato di salvataggio — è `sticky
bottom-0` con uno sfondo pieno, non trasparente, perché ci scorre sotto
del contenuto.

**La scheda di catalogo** raccoglie descrizione, anno, difficoltà,
argomento e tag dietro un `<details>` con riassunto «Catalogo» e, accanto,
i valori correnti in forma breve («2ª · Equazioni · media»), così chi
scorre sa cosa c'è dentro senza aprirlo. Il **titolo resta fuori**: è
l'unico metadato che si scrive mentre si pensa all'esercizio.

L'ordine della colonna sinistra: **titolo, testo, suggerimento, variabili,
domande**. Non più catalogo per primo.

**La gerarchia.** Le intestazioni di sezione salgono a `text-base
font-semibold` con la sezione dentro una `rounded-lg border bg-card p-4`;
le etichette dei campi scendono a `text-xs font-medium
text-muted-foreground`. I campi brevi (anno, difficoltà) non occupano più
tutta la larghezza: `w-32`. È l'unico modo di ottenere figura e sfondo
senza toccare i componenti di base — si agisce sul contenitore, non sul
campo.

- [ ] **Passo 1: i test che falliscono.** Tre asserzioni sul
      comportamento, non sulle classi: (a) l'anteprima è nel DOM **prima**
      della sezione delle domande — `compareDocumentPosition` fra i due
      nodi, che è ciò che «l'anteprima non è più ultima» significa
      davvero; (b) il riassunto della scheda mostra anno, argomento e
      difficoltà correnti mentre è **chiusa**; (c) cambiare l'anno dentro
      la scheda aggiorna il riassunto.
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: i due componenti nuovi e il montaggio in `editor-esercizio`**
- [ ] **Passo 4: eseguirli e vederli passare**, insieme a tutta la suite
      esistente dell'editor: **nessun test esistente va riscritto per
      farlo passare** — se un test dell'editor si rompe, si è cambiato il
      comportamento, non l'impaginazione
- [ ] **Passo 5: `npm run lint`** — le regole del compilatore React su
      questa superficie sono bloccanti
- [ ] **Passo 6: commit**

---

## Task 2: Un player solo, con le linguette

**Files:**
- Modifica: `src/components/esercizi/editor/anteprima.tsx`
- Messaggi: entrambi
- Test: `src/components/esercizi/editor/__tests__/anteprima.test.tsx`

**Consuma:** `ImpaginazioneEditor` dal Task 1 (l'anteprima vive nella
colonna «visione»).

Oggi tre `PlayerEsercizioLazy` affiancati, ciascuno in una griglia da un
terzo. Diventa: **una fila di linguette** (`role="tablist"`) con i tre
semi, **un solo player** sotto, e il pulsante «Nuovi numeri» accanto alle
linguette.

**Il seme del rifiuto resta la cosa più importante di questo componente e
la sua logica non cambia**: quando `semeRifiuto` è definito prende il posto
del **primo** seme, la sua linguetta è rossa e marcata
`data-seme-rifiuto`, e «Nuovi numeri» **non** lo rigenera — sparirebbe
proprio mentre il docente prova la correzione. Quel comportamento è già
provato: i test esistenti devono continuare a passare parlando di
linguette invece che di riquadri.

Attenzione al rimontaggio: la chiave del player resta
`${seme}-${contentKey}`, quindi cambiare linguetta rimonta il player e
riparte da capo — che è quello che serve, perché il player carica la
domanda una volta sola al montaggio.

Le etichette delle linguette non dicono «Seme: 4ucvgdur»: dicono
«Sorteggio 1», «Sorteggio 2», «Sorteggio 3». Il seme resta, in piccolo,
sotto il player — serve a chi segnala un problema, non a chi guarda.

- [ ] **Passo 1: i test che falliscono.** (a) c'è **un solo** player nel
      DOM; (b) cliccando la seconda linguetta il player montato ha il
      `seed` del secondo seme; (c) con `semeRifiuto` la prima linguetta è
      selezionata di partenza e porta `data-seme-rifiuto`; (d) «Nuovi
      numeri» **non** cambia il primo seme quando c'è un rifiuto, e lo
      cambia quando non c'è
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: le linguette**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 3: La tabella dei valori sorteggiati

**Files:**
- Crea: `src/components/esercizi/editor/valori-sorteggiati.tsx`
- Modifica: `src/components/esercizi/editor/anteprima.tsx` (la ospita)
- Messaggi: entrambi
- Test: `src/components/esercizi/editor/__tests__/valori-sorteggiati.test.tsx`

**Interfacce — produce:**

```ts
export interface ValoriSorteggiatiProps {
  content: NumbasQuestionJSON;   // già prodotto da versoNumbas nell'anteprima
  semi: string[];
}
export function ValoriSorteggiati(props: ValoriSorteggiatiProps): JSX.Element | null;
```

Una riga per variabile, una colonna per seme. I valori si ottengono
caricando la domanda una volta per seme con `loadQuestion(content, { seed,
locale: "it" })` e leggendo `caricata.scope`; i nomi delle variabili si
prendono da `content.variables` (`variables.splitVariableNames(def.name)`,
la stessa fonte che usa `verifica.ts` — non le chiavi dell'oggetto).

**Il caricamento può lanciare, ed è il caso che conta**: un esercizio in
corso di scrittura è quasi sempre rotto. Un seme che lancia produce una
cella con un trattino, **non** un componente che sparisce e non un errore
in console. Se lanciano tutti e tre, il componente rende `null`: c'è già
l'anteprima che mostra il guasto, e due messaggi d'errore sullo stesso
guasto sono peggio di uno.

Il valore si mostra con `jme.display.treeToJME` o, per i tipi semplici
(numero, stringa), la loro forma testuale; niente LaTeX qui — è una
tabella di controllo, non una formula.

**Costo:** tre `loadQuestion` per ogni cambio del contenuto. Va dentro un
`useMemo` sulla stessa chiave che l'anteprima già calcola (`contentKey` +
semi), non su ogni ridisegno.

- [ ] **Passo 1: i test che falliscono.** (a) due variabili e tre semi
      danno una tabella 2×3 con i valori attesi per semi fissi; (b) un
      contenuto che lancia al caricamento su un solo seme mostra il
      trattino in quella colonna e i valori nelle altre; (c) un contenuto
      che lancia su tutti e tre rende `null`
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: il componente**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 4: L'eco del motore sotto i campi JME

**Files:**
- Crea: `src/components/esercizi/editor/eco-jme.tsx`
- Crea: `src/components/esercizi/editor/campo-jme.tsx`
- Modifica: `pannello-variabili.tsx`, `parte-numerica.tsx`,
  `parte-espressione.tsx`
- Messaggi: entrambi
- Test: `src/components/esercizi/editor/__tests__/campo-jme.test.tsx`

**Interfacce — produce:**

```ts
export type EsitoEco =
  | { stato: "vuoto" }
  | { stato: "reso"; latex: string }
  | { stato: "errore"; messaggio: string };

export function ecoDi(espressione: string): EsitoEco;

export interface CampoJmeProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** Il tastierino compare solo dove serve davvero: non sotto ogni campo. */
  tastierino?: boolean;
  aiuto?: string;
}
export function CampoJme(props: CampoJmeProps): JSX.Element;
```

**`ecoDi` è il cuore del task.** `jme.compile` per validare, `renderLatex`
per rendere. Tre trappole, tutte già misurate in questo repository:

1. `renderLatex("sqrt()")` non lancia e produce `\sqrt{ undefined }`. La
   difesa esiste già in `espressione.tsx` (`/\bundefined\b/`): **riusare
   quella regola**, non reinventarla.
2. Un errore del motore va mostrato **in italiano**: `JmeError` porta il
   messaggio già tradotto quando la lingua è impostata; `errorMessageIn` è
   la via per gli `EngineError`. Un `String(e)` con dentro «Expected an
   expression» è un fallimento del task.
3. Ogni prefisso di ciò che si sta scrivendo è quasi sempre invalido. L'eco
   in stato d'errore **non** deve essere rossa e allarmante mentre si
   scrive: è `text-muted-foreground` finché il campo ha il fuoco, e
   diventa `text-destructive` solo dopo che il campo l'ha perso.

Il formula rendering usa il `Formula` già in repo
(`src/components/esercizi/player/formula.tsx`), non un secondo ponte verso
KaTeX.

**Dove va l'eco:** definizioni delle variabili (`pannello-variabili`),
valore atteso e margine (`parte-numerica`), risposta attesa
(`parte-espressione`). **La condizione no**: `random(-9..9 except 0)` è
un'istruzione, non una formula, e renderla come formula direbbe una
bugia.

Il tastierino è quello dello studente — le stesse cinque voci di
`SIMBOLI` in `espressione.tsx` — e va **solo** sui campi di risposta
attesa, dove si scrive matematica; non sulle definizioni delle variabili,
che sono istruzioni.

- [ ] **Passo 1: i test che falliscono.** Sette casi su `ecoDi`, come
      tabella: `""` → vuoto; `"2*x"` → reso; `"2*"` → errore; `"sqrt()"` →
      **vuoto**, non reso (la trappola 1); `"sin x"` → reso **come
      moltiplicazione** (è il caso che motiva tutta la funzione: si
      asserisce che il LaTeX contiene la moltiplicazione, così se un giorno
      il motore cambiasse comportamento il test lo dice); `"random(1..5)"`
      → reso; un errore di sintassi ha un messaggio **senza parole
      inglesi** — si asserisce che il messaggio non contiene «Expected».
      Più due sul componente: l'eco non è rossa mentre il campo ha il
      fuoco, lo diventa dopo il blur.
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: `ecoDi`, `CampoJme`, e i tre campi che lo adottano**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: `npm run lint`**
- [ ] **Passo 6: commit**

---

## Task 5: LaTeX nel testo, senza dipendenze nuove

**Files:**
- Crea: `src/components/esercizi/editor/campo-testo-matematico.tsx`
- Modifica: `editor-esercizio.tsx` (testo e suggerimento lo adottano)
- Messaggi: entrambi
- Test: `src/components/esercizi/editor/__tests__/campo-testo-matematico.test.tsx`

**Interfacce — produce:**

```ts
export interface CampoTestoMatematicoProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** I nomi dichiarati nel pannello variabili, per il menu «Inserisci variabile». */
  variabili: string[];
  righe?: number;
}
export function CampoTestoMatematico(props: CampoTestoMatematicoProps): JSX.Element;
```

Una `Textarea` (quella di sempre, non toccata) con sopra una barra:

- **`\( \)`** — avvolge la selezione in una zona matematica, o inserisce la
  coppia vuota col cursore in mezzo
- **`\simplify{}`** — idem, e il contenuto **resta JME**: questo pulsante
  non apre nessun editor di formule, né adesso né al Task 6
- **Inserisci variabile** — un menu coi nomi da `variabili`, che inserisce
  `\var{nome}`
- **frazione, radice, potenza, indice** — quattro inserimenti LaTeX con il
  cursore piazzato nel primo argomento

Sotto, l'**eco del testo reso**: le zone matematiche passano da
`Formula`, il resto è testo. `\var{a}` in eco si mostra come `a` in corsivo
— non si prova a sostituirlo con un valore, perché il valore dipende dal
seme e questa è l'eco di *come si scrive*, non di *cosa esce*: quella è
l'anteprima, che sta accanto.

**La gestione del cursore è la parte che si sbaglia.** Il pattern corretto
è già in `espressione.tsx`: si registra la posizione in un `useRef`, si
chiama `onChange`, e si sposta il cursore in un `useEffect` che dipende dal
testo — **dopo** che il valore risalito dal genitore ha ridisegnato il
campo. Impostarlo subito viene sovrascritto.

- [ ] **Passo 1: i test che falliscono.** (a) selezionare `x^2` e premere
      `\( \)` dà `\(x^2\)` con il cursore dopo; (b) senza selezione dà
      `\(\)` col cursore in mezzo; (c) «Inserisci variabile» su `a`
      inserisce `\var{a}`; (d) l'eco rende la zona matematica come formula
      e lascia il resto come testo; (e) `\simplify{2x+{a}}` **non** viene
      alterato dai pulsanti
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: il componente**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 6: MathLive nei campi di testo

**Files:**
- Modifica: `package.json` (`mathlive@0.110.0`)
- Crea: `src/components/esercizi/editor/finestra-formula.tsx`
- Modifica: `campo-testo-matematico.tsx` (il pulsante che la apre)
- Crea: `public/fonts/mathlive/` (i font copiati)
- Modifica: `next.config.ts` se serve per i font sotto `basePath`
- Messaggi: entrambi
- Test: `src/components/esercizi/editor/__tests__/finestra-formula.test.tsx`

**Interfacce — produce:**

```ts
export interface FinestraFormulaProps {
  aperta: boolean;
  /** Il LaTeX di partenza, quando si modifica una formula esistente. */
  iniziale?: string;
  onChiudi: () => void;
  onConferma: (latex: string) => void;
}
export function FinestraFormula(props: FinestraFormulaProps): JSX.Element | null;
```

**Il caricamento è pigro e non negoziabile:** `mathlive` pesa 843 KB e non
deve entrare nel pacchetto della pagina. `next/dynamic` con `ssr: false`,
e l'import di `mathlive` **dentro** il componente caricato, mai in cima a
un file che la pagina importa direttamente. Il modello in repo è
`player-esercizio-lazy.tsx`.

**I font.** MathLive li cerca in una cartella che va dichiarata
(`MathfieldElement.fontsDirectory`). Questa installazione ha un prefisso di
percorso configurabile (`BASE_PATH` nel `.env`, vedi
`docs/` sul deploy): la cartella va composta col prefisso, altrimenti in
produzione le formule appaiono senza font — **e nessun test se ne
accorge**, perché in jsdom i font non si caricano. Il task deve lasciare
una nota nel file su come si verifica a mano.

**La macro `\var`.** `\var{a}` dentro una formula deve sopravvivere al giro
attraverso MathLive. Si registra come macro
(`MathfieldElement.macros = { ...MathfieldElement.macros, var: "\\mathit{#1}" }`)
così che l'editor la mostri come `a` in corsivo e la restituisca
invariata. **Il test che conta:** una formula con `\var{a}` che entra ed
esce dalla finestra torna byte per byte identica.

`\simplify{}` **non passa di qui**: il pulsante della finestra è
disabilitato quando il cursore è dentro un `\simplify{}`, perché il suo
contenuto è JME e MathLive lo distruggerebbe.

- [ ] **Passo 1: verificare l'installazione.** `npm install mathlive@0.110.0`
      nel worktree, poi `npm run build` per accertare che il pacchetto
      servito **non** contenga mathlive nel chunk della pagina
- [ ] **Passo 2: i test che falliscono.** (a) la finestra chiusa non
      importa mathlive (si asserisce che il modulo non è stato caricato);
      (b) `\var{a}` entra ed esce identico; (c) confermando, il LaTeX
      finisce nella textarea dentro `\( \)`; (d) il pulsante è
      disabilitato col cursore dentro `\simplify{}`
- [ ] **Passo 3: eseguirli e vederli fallire**
- [ ] **Passo 4: la finestra, i font, la macro**
- [ ] **Passo 5: eseguirli e vederli passare**
- [ ] **Passo 6: `npm run build` e `npm run lint`**
- [ ] **Passo 7: commit**

---

## Task 7: MathLive come assistente per JME

**Files:**
- Crea: `src/lib/esercizi/editor/ascii-jme.ts`
- Modifica: `campo-jme.tsx` (il pulsante «Scrivi la formula»)
- Messaggi: entrambi
- Test: `src/lib/esercizi/editor/__tests__/ascii-jme.test.ts`

**Interfacce — produce:**

```ts
export type EsitoConversione =
  | { ok: true; jme: string; latex: string }
  | { ok: false; motivo: "non_compila" | "ambiguo"; dettaglio: string };

/** ASCIIMath (ciò che MathLive restituisce con `getValue("ascii-math")`)
 * verso JME, con il nostro parser come giudice finale. */
export function versoJme(asciiMath: string): EsitoConversione;
```

Il flusso: si scrive nella finestra del Task 6, si preme conferma,
MathLive dà l'ASCIIMath, `versoJme` lo aggiusta e lo **passa a
`jme.compile`**. Se compila, il docente vede il JME e la formula resa e
conferma; se non compila, **non si inserisce niente** e si spiega perché.

**La tabella degli aggiustamenti va tenuta corta e chiusa.** Quello che
serve davvero, misurato sul corpus:

| ASCIIMath | JME |
|---|---|
| `root(n)(x)` | `x^(1/n)` |
| `abs(x)` | `abs(x)` *(già giusto)* |
| `x^2` | `x^2` *(già giusto)* |
| `(a)/(b)` | `(a)/(b)` *(già giusto)* |
| `sqrt(x)` | `sqrt(x)` *(già giusto)* |
| `pi` | `pi` *(già giusto)* |
| `**` | `^` |
| `xx` | `*` |
| `-:` | `/` |

**`+-` si rifiuta**, con motivo `ambiguo`: ASCIIMath lo produce per `\pm`,
e qualunque conversione ne sceglierebbe **una sola** delle due soluzioni,
in silenzio. Un docente che scrive `x = +- 3` e ne ottiene `x = 3` ha un
esercizio sbagliato e nessun modo di accorgersene. È il difetto più
pericoloso di tutto questo task e la sua unica difesa è il rifiuto
esplicito.

**Non si scrive un parser.** Se dopo la tabella `jme.compile` lancia, si
restituisce `non_compila` col messaggio del motore. La tentazione di
aggiungere una regola in più per far passare un caso è esattamente come si
finisce a mantenere un parser LaTeX.

- [ ] **Passo 1: il test a tabella.** Almeno venti coppie
      (ASCIIMath, atteso), fra cui tutte le righe qui sopra, più: `+-` →
      `ambiguo`; `root(3)(8)` → `8^(1/3)` che **compila e vale 2**
      (si asserisce il valore, non la stringa: è ciò che rende il test una
      prova e non una fotografia); una stringa che non compila →
      `non_compila` con un dettaglio non vuoto
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: `versoJme` e il pulsante**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Note per il controllore

- **Il Task 1 è quello che può rompere tutto in silenzio.** Sposta ogni
  campo dell'editor. Il segnale che è andato bene non è «i test passano»,
  è «i test passano **senza essere stati riscritti**». Un implementatore
  che adatta un test esistente per farlo passare ha cambiato il
  comportamento e va fermato.
- **Il Task 4 vale più di quanto costa, e per una ragione precisa**: `sin
  x` che si compila come moltiplicazione è un esercizio sbagliato che
  supera tutti i controlli esistenti. Se l'eco non lo rende visibile, il
  task ha fallito anche coi test verdi.
- **Il Task 6 ha un modo di fallire che nessun test vede**: i font sotto
  `basePath`. Va verificato a mano, in un `npm run build` con
  `BASE_PATH` impostato, e la verifica va scritta nel commit.
- **Il Task 7 ha un modo di fallire che sembra un successo**: `+-`
  convertito invece che rifiutato. Guardare quel caso per primo.
- Il modello, il formato e il corpus non cambiano: un diff che tocca
  `verso-numbas.ts`, `da-numbas.ts`, `modello.ts` o `content/esercizi/` è
  un diff sbagliato, qualunque cosa dica la sua motivazione.
