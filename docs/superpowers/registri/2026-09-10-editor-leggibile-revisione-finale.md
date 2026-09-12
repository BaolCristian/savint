# Revisione finale del ramo `feature/editor-leggibile`

**Diff:** `244ebed..0162888` — 21 commit, 58 file, +4513 / −464
**Piano:** `docs/superpowers/plans/2026-09-10-editor-leggibile.md`
**Specifica:** `docs/superpowers/specs/2026-09-10-editor-leggibile-design.md`
**Data:** 2026-09-12

## Come ho lavorato

Tre passate sul diff: la prima sul solo Task 7 (il caso che decide il ramo),
la seconda sui file finiti letti **interi** e non come diff (`campo-jme.tsx`,
`campo-testo-matematico.tsx`, `ascii-jme.ts`, `finestra-formula*.tsx`,
`anteprima.tsx`, `editor-esercizio.tsx`), la terza sui rapporti di task e sul
registro.

**Verifiche eseguite (nessuna fidata al rapporto):**

- suite intera: **208 file, 2617 passati, 1 saltato** (pre-esistente, `it.skipIf`
  sull'upstream Numbas), 14,1 s;
- `npx tsc --noEmit`: pulito;
- lint bloccante della CI (`npx eslint --quiet src/lib/esercizi src/app/api/esercizi
  src/components/esercizi "src/app/(dashboard)/dashboard/esercizi" "src/app/(student)"
  packages/engine`): **uscita 0**. I 124 errori di `npm run lint` stanno tutti
  nell'arretrato non bloccante (`tests/`, file non toccati dal ramo);
- chiavi dei messaggi: **1295 = 1295**, insiemi identici (confronto ricorsivo
  delle chiavi foglia, non conteggio a occhio);
- peso del pacchetto misurato su `.next` già costruito: mathlive sta in **un solo
  chunk da 814 661 byte**, l'unico che contiene `fontsDirectory`;
- file protetti: `verso-numbas.ts`, `da-numbas.ts`, `modello.ts`, `verifica.ts`,
  `content/esercizi/`, `ui/input.tsx`, `ui/textarea.tsx` — **assenti dal diff**.

**Due sonde temporanee**, entrambe cancellate subito e `git status --porcelain`
verificato a zero dopo ciascuna:

1. `__tests__/sonda-temporanea.test.tsx` — 33 formule LaTeX disegnate in un vero
   `MathfieldElement`, lette con `getValue("ascii-math")` e passate a `versoJme`.
   È la tabella riportata più sotto;
2. `__tests__/sonda-perf.test.ts` — costo di un tasto premuto (3 `loadQuestion`
   + `ecoDi`), riportato nel rilievo I4.

L'albero è pulito. Non ho toccato indice, HEAD, stash né stato del ramo.

---

## Punti di forza

**Il caso che decide il ramo è preso, e il ramo è andato oltre il piano.**
Il piano chiedeva il rifiuto testuale di `+-` e `-+`. `SEGNI_AMBIGUI`
(`ascii-jme.ts:54`) contiene **quattro** segni, e i due aggiunti sono la misura
che mancava al piano: `\mp` dentro una frazione esce da MathLive come **U+2213**,
non come `-+`. L'ho verificato io stesso: `\frac{-b\mp\sqrt{b^2-4ac}}{2a}` →
`(-b∓sqrt(b^2-4a c))/(2a)`. Senza quei due caratteri Unicode, **la quadratica con
l'altro segno sarebbe passata** — nomi tutti noti, strato 3 muto, esattamente il
difetto che il task esiste per non commettere, con un segno diverso. È la
correzione più preziosa di tutto il ramo e non era nel piano.

**`chiamataSconosciuta` è un miglioramento architetturale, non una rifinitura.**
Il quarto motivo (`nome_come_funzione`, `ascii-jme.ts:128-139`) nasce da una
constatazione giusta: un nome in posizione di chiamata vuole la frase **opposta**
a un nome in posizione di valore (`a(x+1)` → «manca l'asterisco», non «metti le
parentesi»). La mia sonda conferma che è quello strato, e non il terzo, a prendere
`\sum`, `\lim`, `\log_{10}x`, `\binom{n}{k}`, `f(x)`, `pi(x+1)`: sei costrutti che
il piano non aveva elencato.

**Le prove asseriscono un valore che il docente vede.** `sin×x` e non «c'è un
nodo KaTeX»; `.mathit` e non «c'è una `a`»; «vale 2» chiesto al motore con la
riga di controllo del controllo (`expect(vale(prodotto, "3")).toBe(false)`,
`ascii-jme.test.ts:85`) che impedisce a `vale` di rispondere `true` a tutto.
`it.each(Object.keys(jme.builtinScope.allConstants()))` con la guardia che
l'elenco non sia vuoto (`ascii-jme.test.ts:205`) è il modo giusto di scrivere un
`it.each` su un elenco che viene da fuori.

**Il contesto `MacroFormula` (Ruling 15) è la decisione migliore del ramo.**
Ha tolto 70 righe invece di aggiungerne, ha reso inutili tre funzioni, e il valore
predefinito `undefined` lascia le opzioni di KaTeX **identiche byte per byte**
per lo studente — verificato dal ri-revisore spiando le opzioni passate a
`katex.renderToString`, non leggendo il codice. La frase dell'implementatore
(«non serviva *un sorgente di ripiego*, serviva *non aver mai riscritto il
sorgente*») è la diagnosi giusta.

**Il caricamento pigro è reale, non dichiarato.** Sonda `vi.hoisted` che scatta
solo se qualcuno importa davvero `mathlive`, più `CARICATO_ALL_IMPORT` catturato
al livello di modulo: distingue «non caricato» da «caricato e non si vede». E la
sorveglianza sta nei **due** file che contano, non solo nella finestra.

**Il refactoring che tocca lo studente è a somma zero, e l'ho verificato in
totale.** I tre interventi su `player/` sono: `espressione.tsx` (−78 righe,
estrazione in `tastiera-simboli.tsx`), `formula.tsx` (contesto nuovo con valore
predefinito `undefined`), `contenuto-html.tsx` (due `export`, nessun cambio di
corpo). Letti insieme: il markup della tastiera è identico classe per classe,
`disabilitato` passa, la `useEffect` del caret ha la stessa dipendenza,
`inserisciSimbolo` produce la stessa stringa, e senza fornitore la chiave
`macros` **non compare affatto** nelle opzioni. Lo studente non vede differenze,
e ora le tre superfici condividono un solo meccanismo di cursore invece di tre
copie.

**I vincoli globali reggono tutti**, compreso quello che ha già fatto fallire due
volte: nessun `setState` dentro `useEffect` per derivare valori. `Anteprima`
riallinea `selezionato` **durante il render** (`anteprima.tsx:89-95`), che è il
pattern documentato da React, e la ragione per cui serve — il seme del rifiuto
deve finire davanti agli occhi del docente — è scritta nel commento.

---

## Il caso che decide il ramo, e le altre vie

Il piano chiede di guardare per primo `(-b+-sqrt(b^2-4a c))/(2a)`. È preso, dallo
strato 1, con la prova che cade quando quello strato sparisce (mutazione già
riprodotta due volte nel registro). Non l'ho rifatto.

Ho cercato invece **l'altra via**: un percorso per far entrare una formula
rovinata in un campo JME senza passare dal cancello. Ecco che cosa MathLive
produce davvero, misurato, e che cosa il cancello ne fa:

| disegnato | `ascii-math` | esito |
|---|---|---|
| `\frac{-b\pm\sqrt{b^2-4ac}}{2a}` | `(-b+-sqrt(b^2-4a c))/(2a)` | **KO** ambiguo ✅ |
| `\frac{-b\mp\sqrt{b^2-4ac}}{2a}` | `(-b∓sqrt(b^2-4a c))/(2a)` | **KO** ambiguo ✅ *(solo grazie a U+2213)* |
| `\sin x` | `sin x` | **KO** nome_sconosciuto ✅ |
| `\operatorname{sen}x` | `s e n x` | **KO** nome_sconosciuto ✅ |
| `\sum_{i=1}^{n}i` | ` sum  _(i=1)^n i` | **KO** nome_come_funzione ✅ |
| `\log_{10}x` | `log _(10)x` | **KO** nome_come_funzione ✅ |
| `\binom{n}{k}` | `(((n) choose (k)))` | **KO** nome_come_funzione ✅ |
| `90\degree`, `10\%` | `90°`, `10%` | **KO** non_compila ✅ |
| `\infty`, `\theta`, `\alpha+\beta`, `\vec v` | `oo`, `theta`, `alpha+beta`, `vec v` | **KO** nome_sconosciuto ✅ |
| `\begin{pmatrix}…\end{pmatrix}`, `\{1,2,3\}`, `(1,2)` | `((1,2),(3,4))`, `{1,2,3}`, `(1,2)` | **KO** non_compila ✅ |
| `\sqrt[3]{8}` | `root(3)(8)` | OK → vale 2 ✅ |
| `\left|x\right|` | `\|x\|` | OK → `abs(x)` ✅ |
| `x\ge3`, `x\ne3` | `x>=3`, `x≠3` | OK, il motore li legge ✅ |
| **`\left[0,1\right]`** | `[0,1]` | **OK** → in JME è una **lista**, non un intervallo ⚠️ |
| **`\text{ciao}`** | `"ciao"` | **OK** → letterale stringa in un campo di risposta ⚠️ |
| **`\overline{x}`** | `""` *(vuoto)* | **OK con JME vuoto** → vedi I1 ⚠️ |

Le tre righe con ⚠️ sono le vie che il Task 7 non ha considerato, perché guardava
il proprio pulsante. Due sono residui noti e accettabili della scelta «immune per
controllo invece che per struttura» (rilievo M5); la terza è un difetto vero
(rilievo I1, il più importante che questa revisione abbia trovato).

**Le altre porte di ingresso a un campo JME, controllate una per una:**

- *battere nel campo* — ammesso per progetto, e l'eco è la difesa. ✅
- *il tastierino* — inserisce solo `^ sqrt() / pi ()`. ✅
- *il contenuto di `\simplify{}` nel campo di testo*, che **è** JME: la finestra
  delle formule è spenta col cursore dentro le graffe, sui **due** capi della
  selezione, e `dentroSimplify` conta le graffe invece di cercare la prima
  chiusura. Solido; una sola incrinatura in M8.
- *l'inserimento al cursore dopo il cancello*: `versoJme` valida il **frammento**,
  non il campo risultante. È corretto così (l'eco mostra il risultato) ed è anche
  provato (`campo-jme.test.tsx:317`, `2*|1` + `root(3)(8)` → vale 5).
- *`parte-numerica` margine, `pannello-variabili` definizione e condizione*: né
  tastierino né assistente, e due prove dedicate impediscono che ricompaiano.
  Conforme alla specifica («mai per le definizioni delle variabili né per la
  condizione»). ✅

---

## Rilievi

### Critical (da correggere)

Nessuno. Il cancello tiene, i vincoli globali reggono, la suite è verde e il
pacchetto servito è quello promesso.

### Important (da correggere)

#### I1 — `versoJme("")` risponde «va bene», e la conferma a vuoto butta via il disegno in silenzio

`src/lib/esercizi/editor/ascii-jme.ts:207-234` · `campo-jme.tsx:133-145`

`jme.compile("")` **non lancia**. Quindi con un ASCIIMath vuoto: nessun segno
ambiguo, nessuna chiamata sconosciuta, `findvars` dà `[]`, e la funzione
restituisce `{ ok: true, jme: "" }`.

Conseguenze, entrambe misurate:

1. il docente disegna qualcosa che MathLive non sa serializzare in ASCIIMath —
   **`\overline{x}` dà stringa vuota**, e non è l'unico — preme «Inserisci», la
   finestra **si chiude**, nel campo non entra niente e non compare nessun
   avviso. Il disegno è perso senza una parola. È esattamente il contrario di
   quel che la finestra promette quando rifiuta: «il disegno resta lì, da
   correggere o da annullare»;
2. se nel campo c'era una **selezione** (gesto naturale: seleziono `sqrt(2)` e
   apro la finestra per rifarlo), `inserisciNelCampo` sostituisce la selezione con
   la stringa vuota: **il testo selezionato viene cancellato**, la finestra si
   chiude, nessun messaggio.

Conta perché è l'unico punto del ramo in cui un gesto del docente distrugge del
lavoro senza dirglielo, e perché contraddice la regola dichiarata del componente.

**Come si corregge:** una guardia in cima a `versoJme`, prima di tutto il resto —
`if (!asciiMath.trim()) return { ok: false, motivo: "non_compila", dettaglio: … }`
— oppure un motivo dedicato `vuoto` con la sua frase. Tre righe, più una riga di
tabella in `ascii-jme.test.ts` (`""` → rifiutato) e una prova sul componente (il
campo non cambia, la finestra resta aperta). In alternativa o in aggiunta:
«Inserisci» disabilitato con il campo di MathLive vuoto.

#### I2 — I venti file di font non vengono mai chiesti in questa applicazione, e la verifica a mano scritta nel file non può accorgersene

`src/components/esercizi/editor/finestra-formula-contenuto.tsx:25-45` ·
`public/fonts/mathlive/*` (20 file, 296 KB)

Letto nel sorgente di `mathlive.min.mjs` (funzione di caricamento dei font):

```js
let r = ["KaTeX_Main","KaTeX_Math","KaTeX_AMS","KaTeX_Caligraphic","KaTeX_Fraktur",
         "KaTeX_SansSerif","KaTeX_Script","KaTeX_Typewriter","KaTeX_Size1",
         "KaTeX_Size2","KaTeX_Size3","KaTeX_Size4"],
    i = Array.from(document.fonts).map(a => a.family);
if (r.every(a => i.includes(a))) { Ie = "ready"; return }      // ← esce QUI
if (!globalThis.MathfieldElement.fontsDirectory) { … }          //   non ci arriva
```

`src/app/layout.tsx:13` importa `katex/dist/katex.min.css` nel **root layout**,
cioè su ogni pagina. Ho estratto le famiglie dichiarate da quel CSS: sono
**esattamente le stesse dodici**. Quindi quando la finestra si apre, le dodici
famiglie sono già connesse in `document.fonts`, MathLive esce al primo `return` e
`fontsDirectory` non viene mai letto. I venti `.woff2` sotto `public/fonts/mathlive/`
sono inoltre **identici byte per byte** a quelli che `katex.min.css` già serve
(md5 confrontati): l'applicazione ne spedisce due copie.

Il punto che rende questo un rilievo e non una curiosità: la nota di verifica a
mano nel file, al passo 3, dice *«nella scheda Rete i venti `KaTeX_*.woff2` non
devono essere 404»*. Non lo saranno mai — **non compariranno affatto**. Chi
seguisse quella ricetta leggerebbe «nessun 404» e concluderebbe «tutto a posto»
in ogni caso, compreso quello in cui la cartella fosse davvero sbagliata. La
verifica non sorveglia il difetto per cui esiste. (La prova a `curl` del passo 2
è invece corretta e ha dato 20/20: dimostra che i file sono *serviti*, non che
MathLive li *chieda*.)

Ironia utile: è la stessa misura che il Ruling 17 ha prodotto per togliere il
rumore dai test — il finto `document.fonts` in `aiuto-mathlive.ts:80-100` dichiara
le dodici famiglie proprio per far saltare a MathLive quel caricamento. Nessuno ha
collegato quel fatto al fatto gemello in produzione.

**Come si corregge:** la riga `MathfieldElement.fontsDirectory = withBasePath(…)`
va **tenuta** — è corretta, costa nulla ed è la rete di sicurezza se un giorno
`katex.min.css` uscisse dal layout. Va corretta la **nota**: dire che i font
arrivano da `katex.min.css`, che la cartella è il ripiego, e che il segnale da
guardare in un browser è la classe `ML__fonts-did-not-load` su `<body>` (che
MathLive aggiunge quando la cartella non risolve) più il carattere serif della
formula. Poi decidere consapevolmente sui 296 KB: tenerli documentati come
ripiego, o toglierli dopo una conferma in un browser vero. Non toglierli sulla
sola forza di questa lettura.

#### I3 — Gli `id` fissi nelle parti diventano duplicati, e ora ci appendono anche l'eco

`parte-numerica.tsx:27-29` · `parte-espressione.tsx:29` · `campo-jme.tsx:148-150`

`idValore = "parte-numerica-valore"`, `idMargine`, `idCifre`, `idRisposta` sono
**stringhe costanti** in componenti che `editor-esercizio.tsx:384` rende dentro un
`map` sulle parti. Con due parti numeriche nello stesso esercizio — caso
supportato, tant'è che c'è un `<h3>Parte N</h3>` — gli `id` si ripetono.

Il `label htmlFor` duplicato è **pre-esistente**. Quello che il ramo aggiunge è
che ora da quell'`id` discendono `${id}-eco` e `${id}-aiuto`, e il campo li
riferisce in `aria-describedby`: **il campo della parte 2 viene descritto
dall'eco della parte 1**. Cioè un lettore di schermo legge, sotto il valore atteso
della seconda domanda, l'interpretazione del motore della prima. Un `id`
duplicato era un fastidio; ora è un'informazione sbagliata.

**Come si corregge:** `const idBase = useId()` nei due componenti di parte (il
pattern è già in `anteprima.tsx:69`), oppure l'indice della parte passato come
prop. Quattro righe, due file. Le prove esistenti montano una parte sola e
restano verdi; aggiungerne una con due parti che verifica `aria-describedby` è la
riga che impedisce il ritorno.

#### I4 — Ogni tasto premuto costa 3 `loadQuestion` sincroni più un `ecoDi` per campo

`valori-sorteggiati.tsx:76-81` · `campo-jme.tsx:147` · `editor-esercizio.tsx:140`

Ogni modifica passa da `mutaEditor`, che sostituisce l'oggetto `editor`: cambia
l'identità, quindi `content` si ricalcola, quindi `contentKey` cambia (il testo è
cambiato davvero), quindi il `useMemo` di `ValoriSorteggiati` **si ricalcola** —
tre `loadQuestion` **sincroni dentro il render** — e ogni `CampoJme` montato
ricalcola `ecoDi` (nessun `useMemo`: è il Minor differito del Task 4).

Misurato da me su `06-derivate-elementari` (2 variabili), in Node su questa
macchina, che è veloce:

```
3 loadQuestion (ValoriSorteggiati, sincrono nel render):  7,1 ms per tasto
ecoDi su un campo:                                       1,03 ms per campo
JSON.stringify(content) ×2:                             < 0,01 ms
```

Un esercizio con sei variabili e tre parti ha una decina di `CampoJme`: ~10 ms di
`ecoDi` più un `loadQuestion` che cresce col numero di variabili. Siamo attorno ai
16 ms per tasto **su questa macchina**; un portatile scolastico è 3-5 volte più
lento. Il rimontaggio del player a ogni tasto (`key={seme-contentKey}`) è invece
**pre-esistente** e non peggiora.

Il piano aveva messo in conto «tre `loadQuestion` per ogni cambio del contenuto» e
aveva chiesto il `useMemo`, che c'è. Quel che nessuno ha fatto è **misurare** che
«ogni cambio del contenuto» vuol dire «ogni tasto».

**Come si corregge:** (a) il `useMemo` su `ecoDi` dentro `CampoJme` — è già nel
registro come Minor differito del Task 4 e va fatto; (b) `useDeferredValue` sulla
chiave passata alla colonna di visione, così la tabella e il player inseguono la
battitura invece di bloccarla. Entrambi sono additivi e non cambiano nessun
comportamento osservabile. Prima di spendere (b), una misura in un browser su una
macchina lenta.

### Minor (opzionali)

**M1 — Chiavi di messaggio gemelle.** `esercizi.redazione.campoJme.scriviFormula`,
`campoTesto.scriviFormula` e `finestraFormula.titolo` sono la **stessa stringa**
(«Scrivi la formula») in tre chiavi; `anteprima.sorteggio` e
`valoriSorteggiati.sorteggio` sono la stessa stringa in due chiavi **sulla stessa
schermata** (linguette e intestazioni di colonna, che il docente legge come la
stessa cosa). Rinominare una sola delle due farebbe divergere linguette e colonne
senza che nulla lo dica. Non è un errore — chiavi distinte per contesti distinti
è una scelta legittima di next-intl — ma qui i contesti sono lo stesso.

**M2 — `\mathit{#1}` scritto due volte.** `MACRO_ECO` in
`campo-testo-matematico.tsx:49` e `MACRO_VAR` in `finestra-formula-contenuto.tsx:23`.
Ho verificato che **dicono la stessa cosa** e che la divergenza sarebbe presa:
`finestra-formula.test.tsx:126` asserisce il letterale `x^2-\mathit{a}^2` e
`campo-testo-matematico.test.tsx:219` asserisce `.mathit`, quindi cambiarne una
sola fa cadere la sua prova. Non è un buco. Resta che il corpo della macro
meriterebbe una costante condivisa (le due chiavi restano diverse: `"\\var"` per
KaTeX, `var` per MathLive) — un file, tre righe, e i due commenti gemelli che si
rimandano a vicenda diventano superflui.

**M3 — Tre quasi-copie della classe del tasto.** `tastiera-simboli.tsx:149`,
`CLASSE_TASTO` in `campo-testo-matematico.tsx:27`, e la classe in linea in
`campo-jme.tsx:173`. Le prime due differiscono per `px-2.5`/`text-base`; la terza
è l'unica **senza** `min-w-11` e senza gli stili `disabled:` — ed è il pulsante
«Scrivi la formula», che nell'altra barra ce li ha. Lo stesso comando, due
aspetti leggermente diversi in due punti della stessa pagina.

**M4 — Tre copie dell'attesa del campo MathLive nei test.**
`aiuto-mathlive.ts:114` (`campoFormulaAperto`, esportata), più copie locali in
`finestra-formula.test.tsx:54` e `campo-testo-matematico.test.tsx:318` — **due
file che quel modulo già importano**. È il Minor differito del Task 7, ed è vero
al quadrato.

**M5 — Il cancello guarda i segni, la tabella e i nomi, mai la forma.**
`\left[0,1\right]` → `[0,1]` entra come **lista** JME (il docente voleva un
intervallo) e `\text{ciao}` → `"ciao"` entra come letterale stringa in un campo di
risposta. Sono i residui strutturali della via scelta, ed è esattamente ciò che la
porta MathJSON documentata nel piano chiuderebbe. Frequenza bassa (chi disegna un
intervallo in un campo di risposta attesa), e l'eco mostra comunque il risultato.
Vale la pena **scriverli nel commento** di `versoJme` accanto ai tre strati:
oggi il commento suona più completo di quanto il cancello sia.

**M6 — Il guardiano di `\simplify{}` ha due fonti di verità.**
`campo-testo-matematico.tsx:225` calcola `cursoreInSimplify` dallo **stato**
`selezione`, mentre `apriFinestra:193` rilegge la selezione **viva dal DOM**. Nel
caso normale coincidono (`onSelect` insegue ogni gesto e `inserisci` segna a mano
il caret che sposta da sé: è già corretto e provato). Se però `valore` cambiasse
per una via che non passa da questo componente, lo stato resterebbe indietro di un
render sul testo nuovo. Irrobustimento a costo nullo: `apriFinestra` rilegge già
la selezione, le basta chiamare `dentroSimplify` su quella e rinunciare.

**M7 — `formulaNellaSelezione` su due zone adiacenti.**
`campo-testo-matematico.tsx:109`: una selezione `\(x\)\(y\)` comincia con `\(` e
finisce con `\)`, quindi viene sbucciata in `x\)\(y` e passata a MathLive. Caso di
bordo, ma la funzione promette «la formula dentro ciò che è selezionato».

**M8 — `aiuto` di `CampoJme` non ha chiamanti.** `campo-jme.tsx:22,150,210` —
verificato con `grep`: nessun `aiuto=` in tutto `src/components/esercizi/`. Vedi
il Ruling 12 fra quelli da riesaminare.

**M9 — `content as NumbasQuestionJSON`** in `anteprima.tsx:222`: `versoNumbas`
restituisce `unknown` di proposito, e il cast lo riapre senza controlli. È
circoscritto e documentato altrove; resta l'unico punto del ramo dove la sicurezza
dei tipi è affermata invece che dimostrata.

**M10 — `vitest.config.ts`, giudicato sull'intera suite.** L'alias è globale per
un bisogno locale, ma l'effetto misurato sul resto della suite è **nullo**: solo
quattro file di prova arrivano a `mathlive`, gli altri 204 non lo risolvono mai, e
la suite gira in 14,1 s senza regressioni. Il commento è accurato (la condizione
`node` porterebbe alla build SSR, senza `MathfieldElement`) e il modo di fallire
è rumoroso, non silenzioso. Due avvertenze per il futuro, non azioni: un file di
prova con `@vitest-environment node` che importasse `mathlive` riceverebbe la
build browser e cadrebbe in modo poco leggibile; e `test.alias` è deprecato a
favore di `resolve.alias` nelle versioni recenti di Vitest — oggi funziona
(verificato: le prove che dipendono da `MathfieldElement` passano), ma è una riga
da rivedere al prossimo aggiornamento.

---

## La triage dei Minor differiti

### Da correggere prima del merge

1. **`ecoDi` senza `useMemo`** (Task 4, `campo-jme.tsx`). Non per l'eleganza: è la
   metà misurabile del rilievo I4. Da fare insieme a quello.
2. **`erroreDefinizione` non legato al campo via `aria-describedby`**
   (Task 4, `pannello-variabili.tsx:129`). Da fare **insieme a I3**, perché sono
   lo stesso difetto visto da due lati — vedi sotto.
3. **La regola `/\bundefined\b/` in `eco-jme.tsx:55` è codice morto in questa
   build** (Task 4). Non toglierla: è una difesa contro una variante del motore
   che è esistita. Ma il commento va allineato — oggi presenta le due varianti
   come coeve, mentre in questo repository ne vive una sola. Un commento che
   descrive un mondo che non c'è più è come il commento sbagliato del Ruling 19:
   il prossimo lettore agisce su quello.

### I tre che insieme fanno più della somma

Il registro annota, in task diversi e quindi senza che nessun revisore potesse
vederli insieme:

- Task 4: «`espressione.test.tsx` non copre l'inserimento **con una selezione
  attiva**»;
- Task 5: «nessuna prova dei quattro inserimenti LaTeX **con una selezione
  attiva**»;
- Task 4: «`campo-jme.test.tsx:137` — *le cinque voci dello studente* asserisce
  solo `toHaveLength(5)`».

Messi in fila dicono una cosa sola, e grossa: **il ramo ha unificato la gestione
del cursore in un solo hook condiviso da tre superfici in produzione** — lo
studente che risponde, il docente che scrive la risposta attesa, il docente che
scrive il testo — **e il comportamento «l'inserimento sostituisce la selezione»
non è provato da nessuna parte.** Le prove con una selezione attiva che esistono
coprono solo il ramo che *avvolge* (`\( \)`, `\simplify{}`), mai quello che
*sostituisce*. Un difetto in quel ramo dell'hook — per esempio usare `inizio` al
posto di `fine` nello `slice` finale — passerebbe tutta la suite e si vedrebbe
per la prima volta sotto le dita di uno studente durante un compito.

**Una prova sola lo chiude per tutte e tre le superfici**: in
`tastiera-simboli` (o in `espressione.test.tsx`, dove sta lo studente),
selezionare un tratto, premere un tasto, e asserire che il tratto selezionato è
sparito e il simbolo ne ha preso il posto. È il tipo di buco che solo questa
revisione poteva vedere, perché ogni pezzo stava in un task diverso.

### Da fare quando si tocca il file (non bloccanti)

`congeda` allo smontaggio legato a `[]` invece che ad `aperta` (Task 6: un
carattere, toglie una dipendenza non dichiarata dal ripristino del fuoco di React
DOM); il JSDoc orfano in `aiuto-mathlive.ts:1-26`; la quarta copia di
`campoFormula` (M4); `id` e `chiave` identici nelle quattro voci di `INSERIMENTI`.

### Da non correggere, ma da capire

Il difetto pre-esistente del `selectionStart` a zero (Task 5): se il campo **non
ha mai avuto il fuoco**, `selectionStart` vale 0 e il ripiego `?? valore.length`
non si attiva mai. Effetto pratico: si apre un esercizio già scritto, si preme
`\( \)` senza aver prima cliccato nel testo, e la coppia atterra **in testa allo
statement**. Ora l'hook è condiviso, quindi il difetto è in un posto solo e il
rimedio è in un posto solo (se `document.activeElement` non è il campo, si
inserisce in fondo). Riguarda anche lo studente. Non blocca il merge; merita una
riga nel registro dei lavori futuri, non di restare un Minor dentro un task
chiuso.

### Obsoleti

Il Minor del Task 5 su `varInCorsivo` che traduce fuori dalle zone matematiche è
**caduto da solo**: la funzione non esiste più (Ruling 15). Verificato con `grep`.

---

## I Ruling da riesaminare

Ho letto tutti e venti. **Diciassette si sono rivelati giusti**, e tre in modo
dimostrabile: il **4** (i tre strati) è il ramo intero; il **15** (la macro come
contesto) ha tolto 70 righe; il **20** (un nome libero sulla sola risposta attesa)
è confermato dalla tabella misurata, `s e n x` compreso. Il **2** (restituire
entrambe le forme) aveva come costo-se-sbagliato «un campo mai usato»: col ramo
finito, `latex` è usato dal campo di testo e `asciiMath` dal campo JME — nessuno
sprecato.

Tre cose da rimettere davanti all'umano:

**1. Il Ruling 12 va esteso a `aiuto`.** Il 12 ha tolto la prop `righe` con una
motivazione precisa: una prop opzionale che non fa nulla mente a chi la leggerà
fra sei mesi. La distinzione tracciata allora con `aiuto` («non ha chiamanti ma
**funziona** se la passi: è YAGNI, non una bugia») era giusta **a metà ramo**, ma
il ramo è finito e nessuno la passa: l'aiuto testuale che il piano immaginava
sotto i campi JME è stato realizzato altrove (il paragrafo `condizioneAiuto` nel
pannello, la nota `suggerimentoAiuto` accanto al campo). Sei righe da togliere, o
una decisione consapevole di tenerla.

**2. Non esiste un ruling sui venti file di font, e ne serviva uno.** Il Ruling 16
ha fatto la domanda giusta su `soundsDirectory` — «questa risorsa serve davvero in
questa installazione?» — e ha risposto no. Nessuno ha fatto la **stessa** domanda
sui font, che è la risorsa gemella, nello stesso file, decisa nello stesso task.
La risposta misurata (rilievo I2) è che in questa applicazione non vengono mai
chiesti. È la decisione che questa revisione restituisce all'umano.

**3. Il Ruling 9/18 regge, ma ha lasciato scoperta la domanda che gli stava
accanto.** Tastierino e assistente sono stati tolti dal margine e dalle
definizioni con la regola giusta («dove si scrive matematica»). Nessuno ha però
deciso che cosa succede quando il cancello **accetta** e il risultato è vuoto:
è il rilievo I1, ed è nato proprio nello spazio fra il Ruling 18 (dove compare il
pulsante) e il Ruling 20 (che cosa passa). Non è la colpa di nessuno dei due: è la
zona che nessuno dei due copriva.

**Osservazione sul processo, che il registro stesso chiede di portare qui.** Il
Task 3 annotava: «tre task su tre hanno avuto il difetto principale nella
sorveglianza, non nel codice». Alla fine del ramo la conta è **sette su sette**, e
con una regolarità che vale più di ciascun caso: ogni volta che un revisore ha
**misurato** invece di leggere — una mutazione, un browser headless, le opzioni
spiate prima di entrare in KaTeX, il CSS ricompilato col postcss vero — ha trovato
qualcosa; ogni volta che ha letto, no. Anche i quattro rilievi di questa revisione
vengono tutti da una misura (una sonda su MathLive, il sorgente della libreria,
un cronometro), nessuno da una lettura. Se una sola cosa di questo ramo deve
entrare nel modo di lavorare, è questa.

---

## Raccomandazioni

1. **Una prova sull'hook del cursore con una selezione attiva.** Una riga, tre
   superfici protette (vedi la triage). È la raccomandazione con il rapporto
   resa/costo più alto del ramo.
2. **Una costante condivisa per `\mathit{#1}`**, con le due chiavi (`"\\var"` per
   KaTeX, `var` per MathLive) che restano dove sono. Toglie due commenti che si
   rimandano a vicenda.
3. **`useId()` nei componenti di parte** (I3), e mentre si è lì, `aria-describedby`
   sul messaggio d'errore della definizione nel pannello.
4. **Correggere la ricetta di verifica dei font** (I2) prima che qualcuno la
   esegua e ne tragga una conclusione falsa.
5. **`zoneMatematiche` in `contenuto-html.tsx`.** Il ciclo su
   `trovaProssimaFormula` in `campo-testo-matematico.tsx:61` ha esattamente la
   forma di quello dentro `dividiFormule`. Esportare la scansione dal file che
   possiede la regola — invece di due chiamanti che la ripercorrono ciascuno a
   modo suo — è la stessa mossa che ha già funzionato per `trovaProssimaFormula`.
6. **Misurare in un browser su una macchina lenta** il costo per tasto (I4) prima
   di decidere se serve `useDeferredValue`.
7. **Per il prossimo piano:** i tre punti in cui il piano ha sbagliato e
   l'implementatore ha avuto ragione a disobbedire (`MathfieldElement.macros`
   statica e deprecata, il filtro `allConstants()` che avrebbe aperto un buco, la
   frase «si lascia decidere al nostro parser») hanno una sola causa: il piano
   descriveva il comportamento di una libreria **senza averlo eseguito**. Il
   Ruling 4 e il Ruling 19 sono nati proprio da chi l'ha eseguito. Un piano che
   tocca una libreria nuova dovrebbe avere una sezione «misurato», e il resto
   dichiararsi ipotesi.

---

## Valutazione

**Pronto per il merge?** **Con correzioni**

**Motivo:** il cancello a tre strati prende il caso che decide il ramo e, con i
due segni Unicode aggiunti dopo la misura, prende anche la variante che il piano
non aveva visto; i vincoli globali reggono tutti (modello e corpus intatti, chiavi
1295=1295, nessun `setState` in `useEffect`, lint bloccante e `tsc` puliti, 2617
prove verdi, mathlive in un chunk da 814 KB fuori dal primo caricamento). Prima
del merge va chiuso **I1** — `versoJme("")` risponde «va bene» e la conferma a
vuoto chiude la finestra buttando via il disegno, e con una selezione attiva
cancella del testo, sempre in silenzio: tre righe più due prove. **I3** (quattro
righe) e i due Minor differiti della triage conviene farli nello stesso giro;
**I2** è una correzione di documentazione più una decisione consapevole sui
296 KB, **I4** una misura da prendere.
