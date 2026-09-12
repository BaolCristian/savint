# SDD ledger — plan: docs/superpowers/plans/2026-09-10-editor-leggibile.md

Worktree: .worktrees/editor-leggibile, ramo feature/editor-leggibile
Spec: docs/superpowers/specs/2026-09-10-editor-leggibile-design.md

## Scansione di pre-volo

### Coppie che condividono file o interfacce

| Coppie | Produce → consuma | Esito |
|---|---|---|
| T1 → T2 | `ImpaginazioneEditor` (colonna «visione») → l'anteprima ci vive | **CONFLITTO** (vedi Ruling 1) |
| T1 → T5 | `editor-esercizio.tsx` ristrutturato → testo/suggerimento adottano il campo nuovo | pulito, sequenziale |
| T2 → T3 | `semiVisibili` (non `semi`: con un rifiuto il primo è sostituito) → la tabella | pulito, annotato nel brief di T3 |
| T3 → T2 | `anteprima.tsx` ospita la tabella | pulito, T3 arriva dopo |
| T4 → T7 | `CampoJme` → il pulsante «Scrivi la formula» | pulito |
| T5 → T6 | `campo-testo-matematico.tsx` → il pulsante che apre la finestra | pulito; il rilevamento di `\simplify{}` lo fa T6 dentro lo stesso componente, non serve interfaccia |
| T6 → T7 | `onConferma` → `versoJme(asciiMath)` | **CONFLITTO** (vedi Ruling 2) |

### Coerenza interna di ciascun task

| Task | Controllo | Esito |
|---|---|---|
| T1 | i test che specifica contro i file che tocca | vedi Ruling 1 |
| T2 | il comportamento del seme di rifiuto è già provato dai test esistenti | coerente |
| T3 | la funzione nominata per mostrare i valori esiste? | **NO** (vedi Ruling 3) |
| T4 | la trappola `sqrt()` e la difesa citata esistono in `espressione.tsx` | coerente, verificato |
| T5 | il pattern del cursore citato esiste in `espressione.tsx` | coerente, verificato |
| T6 | `mathlive@0.110.0` installabile, caricamento pigro | verificato in sessione precedente |
| T7 | `8^(1/3)` vale davvero 2 in JME? | **SÌ**, misurato in pre-volo |

### Rulings

**Ruling 1: l'anteprima segue la scrittura nell'ordine del documento, e
l'asserzione del T1 cambia** — il Passo 1 (a) chiedeva «l'anteprima prima
della sezione delle domande», ma in due colonne la visione viene dopo la
scrittura nel DOM, ed è l'ordine giusto anche per il ripiego a una colonna
sotto i 1280 px. L'asserzione diventa: l'anteprima precede **la barra
delle azioni** e vive in una regione distinta. — *Perché:* è ciò che la
specifica chiede davvero («l'anteprima non è più ultima, sotto i
pulsanti»); l'altra formulazione avrebbe imposto un DOM sbagliato per gli
screen reader e per il ripiego. — *Costo se sbagliato:* un'asserzione più
debole; se l'implementatore mettesse la visione prima della scrittura, il
test passerebbe lo stesso e lo prenderebbe la revisione.

**Ruling 2: `onConferma` della finestra restituisce `{ latex, asciiMath }`,
non il solo LaTeX** — il T7 converte a partire dall'ASCIIMath
(`getValue("ascii-math")`), che il T6 così com'era scritto buttava via. —
*Perché:* far cambiare al T7 la firma di un componente appena approvato
costa un giro di revisione su codice già chiuso. — *Costo se sbagliato:*
un campo in più mai usato, se il T7 trovasse una via migliore.

**Ruling 3: la tabella dei valori usa `jme.tokenToDisplayString(tok,
scope)`** — `jme.display.treeToJME`, nominata dal piano, **non esiste**:
`jme/index.ts` non riesporta il modulo `display`, e `display.ts` non
definisce quella funzione. La funzione giusta è esportata da
`jme/subvars`. Misurata in pre-volo: `2`, `[ 1, 2, 3 ]`, `ciao`. —
*Perché:* avrei mandato l'implementatore contro una funzione inesistente,
e la via d'uscita più probabile sarebbe stata scriverne una a mano. —
*Costo se sbagliato:* nessuno, è verificata.

**Nota misurata (non un ruling):** `renderLatex("sin x")` produce
`\texttt{sin} \times x`. La premessa della specifica — «`sin x` si compila
come una moltiplicazione» — è vera, e il test del T4 può asserire
`\times`.

---
## Task 1 — in corso

BASE: 5637f244 · implementatore: aef987d24215f7eef (sonnet)

**Ruling 4 (fuori dal Task 1, riguarda il Task 7): il cancello della
conversione ha tre strati.** Misurato installando mathlive 0.110.0 in
uno scratch e provando le uscite contro il nostro motore:

- `x=+-3` **compila** e vale `x = -3`.
- `(-b+-sqrt(b^2-4a c))/(2a)` **compila** e vale la sola radice col meno.
- `sin x` **compila** come `\texttt{sin} \times x`.
- `|x|`, `a -: b`, `root(3)(8)` sono invece rifiutati dal parser.
- MathLive emette già `*` per `\times` e `\cdot`: le righe `xx` e `**`
  che avevo messo in tabella non servono e non sono mai emesse.

Il piano diceva «si lascia decidere al nostro parser». **Falso**: il
parser accetta ciò che la conversione ha già rovinato. Task 7 riscritto
(de99f32) con tre strati: rifiuto testuale di `+-`/`-+`; tabella di tre
righe misurate; controllo dei nomi liberi (`jme.findvars`) contro le
variabili dichiarate più le costanti di `builtinScope`. `versoJme`
acquisisce un secondo parametro `nomiNoti`. — *Perché:* la formula
quadratica è la più scritta delle superiori e sarebbe stata convertita
sbagliata in silenzio, superando verifica e salvataggio. — *Costo se
sbagliato:* lo strato 3 rifiuta anche `sin x` senza parentesi, e il
docente deve mettere le parentesi o scrivere a mano.

**Via non presa, documentata nel piano:** MathJSON (`["Sin","x"]`,
`\pm` come nodo esplicito) sarebbe strutturalmente immune invece che
immune per controllo, ma MathLive **non include** il motore di calcolo —
lo cerca su `window[Symbol.for("io.cortexjs.compute-engine")]` e senza di
esso restituisce `["Error","compute-engine-not-available"]`. Costerebbe
~2 MB caricati a mano. Porta lasciata aperta se i rifiuti dello strato 3
daranno fastidio.

### Task 1 — revisione, giro di correzioni 1

Verdetti: conformità ❌, qualità da correggere. Rapporto in `task-1-review.md`.
Il revisore ha usato la mutazione su ogni rilievo, ed è la ragione per cui
il critico è stato trovato.

Mandate in correzione: C1 (critico, la prova non sorveglia niente), C2
(fixture ambigua), C3 (sticky senza altezza massima), C4 (il campo Titolo
torna nella colonna di scrittura), C5 (commento diventato falso), C6
(nessuna prova apre la scheda), C7 (firma larga, `"use client"`, marcatore
del `<details>`).

**Ruling 5: il rilievo sull'anteprima a tre colonne dentro 420 px NON si
corregge nel Task 1, si eredita nel Task 2.** Il revisore ha ragione nel
merito — `md:grid-cols-3` in una colonna da 420 px dà tre player da ~124 px,
illeggibili proprio alla larghezza che il task ottimizza — ma il Task 2
sostituisce `Anteprima` con un player solo a linguette e quel codice
sparisce. — *Perché:* correggerlo ora è lavoro che il task successivo
butta via, e il ramo non spedisce nulla a metà. — *Costo se sbagliato:* se
il Task 2 slittasse o cambiasse forma, il ramo porterebbe un'anteprima
peggiore di prima; il puntatore nel brief del Task 2 è la difesa.

**Ruling 6: la decisione dell'implementatore sul titolo si rovescia.**
Aveva letto il commento d'interfaccia («intestazione: titolo + scheda
catalogo») come se «titolo» fosse il campo `meta.titolo`, e ne aveva
concluso che la prosa si contraddicesse. Non si contraddice:
`esercizi.redazione.titolo` è l'h1 «Redazione esercizio», `meta.titolo` è
l'etichetta del campo. La prosa enumera esplicitamente la colonna sinistra
e quella enumerazione vince. — *Perché:* la sua lettura faceva cominciare
la scrittura da «Testo», rompendo «l'ordine in cui un insegnante pensa»
che è lo scopo dichiarato del task. — *Costo se sbagliato:* un campo in
cima a una colonna invece che in una fascia; reversibile in una riga.
**Mia colpa a monte:** il commento d'interfaccia diceva «titolo» dove
avrebbe dovuto dire «l'intestazione della pagina».

Giro 1 chiuso (6b9a7db): C1, C2, C4, C5, C6, C7 verificati per mutazione
dalla ri-revisione. **C3 no.** Il ri-revisore ha montato Chromium headless
col contesto vero e misurato: colonna agganciata a 48 px dal bordo (32 di
`md:p-8` + 16 di `top-4`), ma `max-h-[calc(100vh-2rem)]` ne sottrae 32 —
il fondo cade a 1016 px su un viewport di 1000. Giro 2 mandato, solo C3.

*Nota di metodo:* i due difetti più seri di questo task — il critico del
primo giro e questo — sono stati trovati **misurando**, non leggendo: una
mutazione e un browser headless. Il codice sembrava giusto in entrambi i
casi.

Giro 2 chiuso (c11f3ef). C3 verificato per misura indipendente
dall'implementatore: 1016 px prima, 1000 px esatti dopo, stessa cifra
trovata dal ri-revisore.

**Task 1: complete** — commit 349cfc1, 6b9a7db, c11f3ef. 591/591 verdi,
eslint e tsc puliti.

*Rilievo parcheggiato:* `calc(100vh-3rem)` incorpora il padding attuale di
`<main>` in `(dashboard)/layout.tsx`. Se quel padding cambia, il valore va
ricalcolato e nessun test se ne accorge. Documentato in un commento nel
file. Non vale un test: sorvegliare una costante CSS con un browser
headless costerebbe più di quanto protegge.

## Task 2 — in corso

BASE: c11f3ef · eredita il rilievo R3 del Task 1 (Ruling 5).

### Task 2 — revisione, giro 1

Conformità ✅, qualità ❌. Sette rilievi, due critici. Verificato dal
revisore che l'affermazione dell'implementatore («12/13 rosse contro
l'implementazione vecchia») è vera.

**Il rilievo che conta: una regressione creata dal task stesso.**
`selezionato` non si riallinea quando `semeRifiuto` arriva come cambio di
prop. Docente sulla linguetta 2 preme «Controlla» → la linguetta 1
diventa rossa ma il player resta sul sorteggio 2: **il seme che ha rotto
l'esercizio non gli viene mai mostrato**, che è l'unica ragione per cui
quel meccanismo esiste. Con tre riquadri affiancati era impossibile —
erano visibili insieme. È il prezzo nascosto del passaggio a un player
solo, e nessuno l'aveva previsto: non io scrivendo il piano, non
l'implementatore, e i test esistenti partivano tutti dalla linguetta 1.

Secondo critico: il rimontaggio non è sorvegliato (stub funzione pura
delle prop → `key` costante lascia tutto verde). Comportamento giusto ma
indifeso, e sarebbe invisibile a schermo.

**Ruling 7: `sm:grid-cols-3` in `pannello-variabili.tsx` va al Task 4.**
Stessa famiglia del difetto ereditato dal Task 1, ma nella colonna di
scrittura, e il Task 4 quel file lo modifica già. — *Perché:* aprirlo qui
significherebbe far toccare al Task 2 un file fuori dal suo perimetro. —
*Costo se sbagliato:* se il Task 4 cambiasse forma, resta una griglia a
tre in una colonna stretta; il puntatore nel brief è la difesa.

Giro 1 chiuso (3066ed7). **Task 2: complete** — commit bc98696, 3066ed7.
Tutti e sei i rilievi verificati per mutazione dal ri-revisore, nessun
difetto nuovo. 191 test verdi su 14 file; l'aggiustamento della selezione
avviene durante il render (nessun `useEffect`), lint pulito.

## Task 3 — in corso

BASE: 3066ed7

### Task 3 — revisione, giro 1

Conformità ✅. Codice di produzione corretto in ogni punto mutato. Tre
buchi nella rete di test, tutti della stessa famiglia — le prove
controllano che la tabella *ci sia*, non che dica *la verità*:

- C1 critico: `semiVisibili` → `semi` lascia **77/77 verdi**.
- C2: definizioni deterministiche (`a=5`, `b=a+1`) rendono la prova 2×3
  cieca a qualunque scambio seme↔colonna; invertendo le colonne restano
  verdi tutte e quattro (invertire tre elementi lascia il centrale fermo).
- C3: un formattatore fatto a mano al posto di `tokenToDisplayString`
  passa, perché gli unici valori provati sono interi.

*Osservazione ricorrente in tutto il ramo:* tre task su tre hanno avuto
il difetto principale nella **sorveglianza**, non nel codice. Il codice
scritto dagli implementatori è stato quasi sempre giusto; ciò che mancava
era la prova che lo tenesse giusto. Vale la pena portarlo nella revisione
finale del ramo.

*Parcheggiato:* l'assegnazione multipla (`"a,b"`) non è testata ma è
irraggiungibile — `modello.ts` vincola il nome a un identificatore
singolo. Stesso gap difensivo già accettato in `verifica.ts`.

Giro 1 chiuso (dcf2441). L'implementatore ha riprodotto le mutazioni
esatte del revisore e le ha viste cadere. **Ho verificato io stesso il
critico** invece di spendere un giro di revisione su un diff di soli
test: mutato `semiVisibili` → `semi`, eseguito
`anteprima.test.tsx` → 1 rossa su 18, la prova giusta, su un valore
(`expected '330' to be '530'`). Albero ripristinato e verificato pulito.

**Task 3: complete** — commit 1b21c8b, dcf2441. 428 test verdi su 29 file.

## Task 4 — in corso

BASE: dcf2441 · eredita `sm:grid-cols-3` in `pannello-variabili.tsx`
(Ruling 7).


---

# PUNTO DI RIPRESA — 2026-09-10, limite di sessione

**Dove sono i lavori.** Worktree `.worktrees/editor-leggibile`, ramo
`feature/editor-leggibile`, HEAD `994c589`, albero pulito, niente pushato.
`main` è a `244ebed` (specifica + piano) e non ha nulla di questo ramo.

**Fatto e approvato:**
- **Task 1** (due colonne): 349cfc1, 6b9a7db, c11f3ef
- **Task 2** (anteprima a un player con linguette): bc98696, 3066ed7
- **Task 3** (tabella valori sorteggiati): 1b21c8b, dcf2441

**Fatto ma NON revisionato:**
- **Task 4** (eco del motore sui campi JME): `994c589`. L'implementatore
  riporta 523/523 verdi su 36 file, lint e tsc puliti. **La revisione è
  stata lanciata e si è interrotta a metà per il limite di sessione: va
  rifatta da capo.**

**LA PROSSIMA AZIONE, esatta:**

1. Ricostruire il pacchetto di revisione (probabilmente esiste già):
   `scripts/review-package docs/superpowers/plans/2026-09-10-editor-leggibile.md dcf2441 994c589`
2. Rilanciare la revisione del Task 4 **su Opus** con le dieci direzioni
   già scritte (sono nel prompt del revisore interrotto; le tre che
   contano: il caso `sin x` è davvero visibile a un docente? le sette
   righe di `ecoDi` cadono ciascuna per qualche mutazione? l'eco resta
   discreta col fuoco e diventa errore solo dopo il blur, verificato per
   mutazione e non leggendo le classi CSS?).
3. Poi Task 5 (LaTeX nel testo), 6 (MathLive nei campi di testo),
   7 (MathLive assistente per JME, il cancello a tre strati).

**Da verificare nella revisione del Task 4, segnalato dall'implementatore
stesso:**
- Dice che `renderLatex("sqrt()")` adesso **lancia** (controllo di
  arietà) invece di produrre `\sqrt{ undefined }` come diceva il mio
  brief — conseguenza del lavoro sull'arietà fatto in un ramo precedente.
  Ha tenuto entrambe le difese. Va confermato con `npx tsx` contro
  `packages/engine/src/index.ts`.
- Ha toccato `src/components/esercizi/player/parti/espressione.tsx` (file
  fuori dall'elenco del task) per esportare `SIMBOLI`: è un componente
  dello **studente**, va verificato che nessun comportamento cambi.
- Ha usato query di contenitore (`@container` / `@sm:grid-cols-3`) al
  posto di `sm:grid-cols-3`: verificare che Tailwind le riconosca davvero
  in questo progetto, perché un `@sm:` non riconosciuto sparisce senza
  errori e lascia la griglia a una colonna per sempre.

**Vincolo nuovo dal committente (2026-09-10):** tutti i sottoagenti su
Opus, nessuna scalata a modelli piu' piccoli. Salvato anche in memoria
come `feedback-agenti-solo-opus`.


---

## Ripresa — 2026-09-11

Il punto di ripresa qui sopra era esatto. Albero pulito a `994c589`,
niente pushato, `main` ancora a `244ebed`.

### Task 4 — revisione, giro 1 (rilanciata da capo)

Pacchetto gia' esistente: `review-dcf2441..994c589.diff`. Revisore su Opus
con le dieci direzioni del punto di ripresa, piu' la nota di metodo del
ramo (i difetti peggiori si trovano misurando, non leggendo).

### Pre-volo del Task 5 (misurato mentre girava la revisione del 4)

**Ruling 8: l'eco del Task 5 deve tradurre `\var{nome}` in
`\mathit{nome}` prima di passarlo a `Formula`.** Misurato con il katex di
questo repo: `katex.renderToString("\\var{a}")` **lancia**
(`Undefined control sequence: \var`), e `proteggiTextrm` tocca solo
`\textrm{}`, quindi non lo salva. `Formula` non lancia mai: cattura e
mostra il **sorgente grezzo in un riquadro `<code>`**. Senza la
traduzione, la richiesta del piano — «`\var{a}` in eco si mostra come `a`
in corsivo» — fallirebbe **in silenzio**, e un test che asserisce solo
«l'eco esiste» resterebbe verde. La prova deve asserire che il docente
vede `a` reso, non il sorgente. — *Perche':* e' la stessa famiglia di
difetto che ha morso i task 1-3 (la prova c'e', la verita' no), ed e' la
stessa traduzione che il Task 6 registrera' come macro MathLive
(`var: "\\mathit{#1}"`): i due restano coerenti. — *Costo se sbagliato:*
nessuno, e' misurato; al piu' una riga di sostituzione in piu'.

### Pre-volo del Task 7 (misurato, non supposto)

I due nomi che il piano cita esistono davvero (a differenza di
`treeToJME` del Ruling 3): `jme.findvars` da `evaluate.ts` e
`jme.builtinScope` da `builtins.ts`, entrambi raggiunti da
`export *` in `jme/index.ts`.

Misure contro `packages/engine/src/index.ts`:

- `builtinScope.allConstants()` → `nothing, e, pi, i, infinity, infty,
  nan`. **E' il metodo da usare** per lo strato 3: nessun elenco scritto
  a mano.
- `findvars(compile("sin x"), [], builtinScope)` → `["sin", "x"]`:
  lo strato 3 prende `sin`, come il piano promette.
- `findvars(compile("sin (x)"), [], builtinScope)` → `["x"]`: passa.
- `findvars` sulla quadratica `(-b+-sqrt(b^2-4a c))/(2a)` → `["a","b","c"]`,
  **tutti noti**: lo strato 3 NON la prende. La prende solo lo strato 1
  (rifiuto testuale di `+-`). Conferma che i tre strati servono tutti e
  tre, e che togliere lo strato 1 farebbe passare il caso peggiore.

Verdetti: conformita' ❌, qualita' da correggere. Rapporto in
`task-4-review.md`. Il revisore ha misurato invece di leggere su ogni
rilievo che contava, e per questo ha trovato il critico: con
`<Formula tex={valore}/>` al posto di `tex={esito.latex}` la suite resta
**12/12 verde** mentre il docente vedrebbe `sinx` invece di `sin×x`.
Il cuore del task non e' sorvegliato.

**Ruling 9: il tastierino esce da `margine`, resta su `valore`.** Il
brief lo riserva ai «campi di risposta attesa, dove si scrive
matematica». In una parte numerica il **valore atteso** e' matematica
(`sqrt(2)*a` e' un valore atteso plausibile); il **margine** e' una
tolleranza, un decimale: `π`, `√`, `^` non si scrivono li'. La spec
elenca il margine fra i campi che ricevono **l'eco** (riga 51), non fra
quelli che ricevono la tastiera — sono due cose diverse e il task le ha
confuse. Con il tastierino esce anche il `max-w-40 → max-w-60`, che il
revisore ha mostrato essere imposto solo dalla tastiera: due rilievi
chiusi da una sola rimozione, e sparisce un cambio di layout che nessun
test esercita. — *Perche':* l'eco sul margine serve (dice se la
tolleranza compila), la tastiera no. — *Costo se sbagliato:* un docente
che volesse scrivere una tolleranza simbolica batte i simboli a mano,
come fa oggi.

**Ruling 10: il rilievo sulla soglia `@sm` sale da Minor a rilievo del
giro di correzioni.** Il revisore l'ha graduato Minor ed e' una
graduazione difendibile guardando il solo diff — ma io ho il contesto
che lui non ha: il **Ruling 7** ha mandato qui questo difetto apposta,
come consegna del Task 4. `@sm` vale 24rem **di contenitore** (CSS
generato, misurato dal revisore col postcss vero del repo): a 384 px la
riga passa a tre colonne da ~120 px con dentro anche una formula. E'
la stessa illeggibilita' che il Ruling 7 voleva eliminare, spostata di
poco. Una consegna a meta' non e' un Minor. — *Perche':* lasciarlo
parcheggiato significherebbe che il Ruling 7 non ha prodotto nulla. —
*Costo se sbagliato:* una soglia troppo alta tiene la riga a una colonna
su schermi medi, che e' il ripiego leggibile, non un difetto.

*Nota, non un rilievo:* rapporto e revisore contano le chiavi dei
messaggi in modo diverso (1347 contro 1273). La **parita'** fra it e en
— l'unica cosa che il vincolo chiede — regge in entrambi i conteggi, e
il revisore ha verificato che gli insiemi delle chiavi sono identici.

Giro 1 mandato: sei rilievi (C1-C6). L'implementatore originale e' di
un'altra sessione e non e' risvegliabile: implementatore fresco su Opus
col brief, il rapporto e i rilievi.

Task 4: minor (differiti, per la revisione finale del ramo):
- `eco-jme.tsx:55`: la regola `/\bundefined\b/` e' codice morto in questa
  build del motore (che ora lancia) e nessuna mutazione la fa cadere.
- `campo-jme.tsx:32`: `ecoDi` senza `useMemo`; il gemello dello studente
  ce l'ha. ~0,87 ms a chiamata, ~9 ms per tasto con dieci variabili.
- `campo-jme.tsx:100-103`: l'eco non ha `min-w-0`/`overflow-x-auto` e
  deborda dalla cella `minmax(0,1fr)`.
- `campo-jme.tsx:18,98`: la prop `aiuto` non e' mai passata da nessun
  chiamante (era mandata dal brief).
- `campo-jme.test.tsx:137-139`: «le cinque voci dello studente» asserisce
  solo `toHaveLength(5)`.
- `espressione.tsx:11-18`: due JSDoc consecutivi, la spiegazione di
  `offsetCaret` non si attacca piu' al tipo.
- `SIMBOLI` esportato come array mutabile condiviso fra due superfici.
- `eco-jme.tsx` non contiene JSX (il nome era mandato dal brief).

Correzione fatta (`8fba293`, 533 test verdi, era 523). Ri-revisione
mandata su `994c589..8fba293` con l'ordine di **riprodurre da se'** le
mutazioni di C1, C2 e C4 invece di credere al rapporto, e con due
attenzioni: il file nuovo `tastiera-simboli.tsx` cambia sotto i piedi
allo **studente in produzione** (`espressione.tsx`, -78 righe) con
`espressione.test.tsx` invariato; e i due canali d'errore sotto
`definizione` dopo l'arrivo della prop `invalido`.

Giro 1 chiuso (8fba293). Tutti e sei i rilievi verificati **per mutazione
riprodotta dal ri-revisore**, non per lettura del rapporto: C1 cade con
`expected 'sinx' to be 'sin×x'` (la bugia esatta che il task esiste per
smontare), C4 cade su quattro prove dove la vecchia asserzione ne teneva
zero, C2 su due mutazioni indipendenti, C5 rimettendo il tastierino, C6
ricompilando il CSS col postcss vero (`@xl` = 36rem = ~186 px a colonna,
`@lg` sarebbe stato ~165, sotto il criterio). Il refactor della tastiera
non cambia nulla per lo studente: markup identico riga per riga dopo la
sola rinomina, `espressione.test.tsx` 8/8 col file invariato.

**Task 4: complete** — commit 994c589, 8fba293. 533 test verdi su 36 file,
tsc ed eslint puliti.

Task 4: minor (differito, aggiunto dal giro 1): `erroreDefinizione` del
pannello non e' legato al campo via `aria-describedby` — chi usa una
tecnologia assistiva sente «non valido» senza il motivo. Servirebbe una
seconda prop.

Task 4: minor (differito, fuori ambito): `espressione.test.tsx` non copre
l'inserimento **con una selezione attiva**; verificato per identita' del
codice, non per prova. Il buco preesiste al giro.

## Task 5 — in corso

BASE: 8fba293 · eredita il Ruling 8 (`\var` va tradotto in `\mathit`)

**Ruling 11: il Task 5 non scrive una terza copia della logica del
cursore; riusa `useTastieraSimboli`.** Il brief dice «il pattern corretto
e' gia' in `espressione.tsx`»: dal commit `8fba293` **non e' piu' vero**
— il Task 4 l'ha estratto in `src/components/esercizi/tastiera-simboli.tsx`
proprio perche' il rilievo C3 ha bocciato la seconda copia. Una terza
copia sarebbe lo stesso rilievo per la terza volta. Due cose vanno pero'
sistemate dall'implementatore, e sono lavoro vero, non copia:
`campoRef` e' tipato `RefObject<HTMLInputElement | null>` e il Task 5 ha
una `Textarea`; e `inserisciSimbolo` **sostituisce** la selezione
(`slice(0,inizio) + inserisci + slice(fine)`), mentre `\( \)` deve
**avvolgerla**. Come conciliarli e' scelta sua; forkare la gestione del
caret no. — *Perche':* il difetto piu' ripetuto di questo ramo e' la
duplicazione della gestione del cursore, e il brief punta a un file che
non la contiene piu'. — *Costo se sbagliato:* se la generalizzazione
dell'hook risultasse contorta, restano due funzioni di inserimento
accanto allo stesso meccanismo di caret, che e' comunque meglio di due
meccanismi di caret.

### Pre-volo del Task 6 (letto mentre girava il Task 5)

Il piano dice che i font di MathLive vanno composti col prefisso di
percorso e che «nessun test se ne accorge». **La via esiste gia' e non va
inventata:** `src/lib/base-path.ts` esporta `BASE_PATH`
(`process.env.__NEXT_ROUTER_BASEPATH || process.env.BASE_PATH || ""`,
iniettata da Next sia sul client sia sul server) e `withBasePath(path)`.
Sette file la usano gia' (`providers.tsx`, `auth/config.ts`,
`socket/client.ts`, ...). Quindi
`MathfieldElement.fontsDirectory = withBasePath("/fonts/mathlive")`, non
una composizione a mano.

Il modello del caricamento pigro e' `src/components/esercizi/player/
player-esercizio-lazy.tsx`: `next/dynamic` con `ssr: false` piu' un
wrapper `"use client"`, perche' `ssr: false` non e' ammesso da un Server
Component. Il commento in quel file spiega anche il perche' del wrapper.

Task 5 implementato: `ec18f7a` + `20646a7` (l'implementatore ha aperto e
chiuso da se' un giro di auto-revisione), DONE_WITH_CONCERNS, 587 test
verdi su 38 file. Ha generalizzato l'hook invece di copiarlo
(`useTastieraSimboli<E>` con default `HTMLInputElement`, piu'
`inserisciNelCampo(costruisci)` che passa la selezione al chiamante:
e' cio' che permette di avvolgerla invece di sostituirla) e ha riusato
`ContenutoHtml` dello studente con la forma di `versoNumbas` per l'eco,
invece di scrivere una seconda regola di divisione delle zone.

Revisione mandata su Opus con l'ordine di riprodurre le mutazioni e con
cinque rischi nominati; le tre preoccupazioni dell'implementatore vanno
giudicate una per una.

### Task 5 — revisione, giro 1

Conformita' ✅ (Ruling 8 e Ruling 11 rispettati, vincoli globali
verificati con `git diff --stat` sui file protetti: output vuoto).
Qualita' da correggere: due Important. La sorveglianza regge, per la
prima volta sul ramo: le tre mutazioni richieste cadono tutte e tre **sul
valore visto**, e l'hook generalizzato lascia guardato lo studente (2 test
su 26 cadono mutando il meccanismo condiviso).

**Ruling 12: la prop `righe` si toglie.** Il revisore l'ha etichettata
«mandata dal brief, decide l'umano». Decido: via. Non e' una prop
inutilizzata, e' una prop **inoperante** — `ui/textarea.tsx:10` porta
`field-sizing-content`, che sovrascrive `rows`: passarla non farebbe
nulla. Una prop opzionale che non fa nulla mente a chi la leggera' fra sei
mesi. La spec non la nomina (e' un dettaglio del piano, e la spec e'
l'autorita' che vincola). — *Distinzione con `aiuto` del Task 4, che
resta parcheggiata:* `aiuto` non ha chiamanti ma **funziona** se la passi;
e' YAGNI, non una bugia. — *Costo se sbagliato:* se un giorno servisse
un'altezza minima, si aggiunge una prop che agisce su `min-height`, che e'
la leva vera.

**Ruling 13: il Minor sul corsivo sale nel giro di correzioni.** Il
revisore ha misurato che traducendo `\var{a}` in una `a` **nuda** restano
19/19 verdi: la prova copre meta' del requisito («si mostra come `a`»)
e non l'altra meta' («in corsivo»). E' il Ruling 8 che resta non
sorvegliato per meta', ed e' una riga di asserzione. — *Perche':* il
corsivo e' anche cio' che tiene coerente la macro MathLive del Task 6
(`var: "\\mathit{#1}"`); se qui si perde, le due superfici divergono
senza che nulla lo dica. — *Costo se sbagliato:* un'asserzione in piu'
legata a una classe di KaTeX.

Task 5: minor (differiti): `varInCorsivo` traduce anche fuori dalle zone
matematiche (un `\var{a}` in prosa compare come il letterale
`\mathit{a}`); il blocco del tasto ricopiato tre volte in
`campo-testo-matematico.tsx:102-137` e `CLASSE_TASTO` quasi-copia della
classe dei tasti dello studente; `id` e `chiave` sono la stessa stringa
nelle quattro voci di `INSERIMENTI`; nessuna prova dei quattro
inserimenti LaTeX **con una selezione attiva**; il difetto preesistente
del `selectionStart` a zero (il ripiego `?? valore.length` e' codice
morto: su una textarea `selectionStart` non e' mai null) — riguarda anche
lo studente in produzione e va oltre questo task, ma qui la gravita'
pratica cresce: il primo `\( \)` atterra in testa a uno statement gia'
scritto.

Correzione fatta (`3eb176f`, 553 test verdi). L'implementatore ha
misurato che KaTeX emette `mord mathit` per `\mathit{a}` e
`mord mathnormal` per una `a` nuda — quindi il corsivo e' asseribile — e
ha scritto la chiave **senza graffe nel testo**, perche' le graffe sono
sintassi ICU per next-intl (precedente gia' in repo: `spiegazioneVar`).
Ri-revisione mandata su `20646a7..3eb176f`, con l'ordine di riprodurre la
mutazione di C3 e di controllare che la stringa ICU non esploda a runtime
in **entrambe** le lingue (una graffa non bilanciata lancia quando il
messaggio si formatta, non quando si scrive).

Giro 1 chiuso (3eb176f). C1, C2, C3 tutti verificati per mutazione
riprodotta dal ri-revisore. In piu' ha formattato **ogni** chiave di
`campoTesto` con `IntlMessageFormat` nelle due lingue (10 per lingua, 0
eccezioni): la stringa ICU non esplode. E ha misurato che la nota non
compare su un LaTeX davvero rotto — dove il riquadro *sarebbe* un errore
di sintassi — il che e' il comportamento giusto.

**Ruling 14: apro un giro 2 su un rilievo che il ri-revisore ha messo
fuori ambito.** Ha misurato, sullo statement vero di
`01-equazione-primo-grado`, che il riquadro grigio del sorgente mostra
`\mathit{c}` dove il docente ha scritto `\var{c}`: `varInCorsivo`
trasforma il testo **intero** prima che `ContenutoHtml` divida le zone,
quindi quando `Formula` ripiega sul sorgente mostra il sorgente
*tradotto*. Il docente legge un comando che non ha mai digitato — e la
nota appena aggiunta gli atterra sopra dicendo «il testo resta scritto
com'e'». Il ri-revisore ha fatto bene a metterlo fuori ambito (il suo
ambito e' il diff delle correzioni), ma il difetto e' del Task 5, non di
un altro: e' entrato con `ec18f7a`. — *Perche':* lo scopo dichiarato del
task e' l'eco di **come si scrive**; un'eco che mostra un comando mai
digitato lo contraddice nel caso piu' comune del corpus. E una sola
correzione — applicare `varInCorsivo` **per zona** invece che al testo
intero — chiude anche i due Minor imparentati (la traduzione fuori dalle
zone matematiche, e la nota che scatta dove non c'e' nessun riquadro da
spiegare). Tre rilievi, una riga. — *Costo se sbagliato:* un giro di
dispaccio in piu' su un task gia' verde.

Giro 2: correzione fatta (`cbd1c9e`, 556 test verdi). L'implementatore
dichiara di aver **cambiato strada** rispetto alla mia indicazione: la
sola divisione per zona non chiudeva il rilievo, perche' nello statement
di `01-equazione-primo-grado` il `\var{c}` sta *dentro* la stessa zona
del `\simplify{}` che KaTeX rifiuta — tradotta per zona o in blocco,
finiva comunque tradotta nel riquadro. Al suo posto una regola sola:
`resaDaKatex(zona)` esclude le zone col `\simplify{}`, e `haSimplify` usa
lo stesso predicato. Se l'affermazione e' vera il cambio di strada e'
giusto; ho chiesto al ri-revisore di **misurarla**, non di crederci, e di
giudicare la preoccupazione residua (`resaDaKatex` e' una regola a nome
singolo, non un tentativo di resa: una zona che fallisse per graffe
sbilanciate mostrerebbe di nuovo un sorgente tradotto).

Giro 2 chiuso (cbd1c9e). D1 chiuso su tutti e tre i casi piu' la
non-regressione; tutte e tre le mutazioni riprodotte con output identico
al dichiarato; `contenuto-html.tsx` (studente, produzione) cambiato
davvero solo nelle due parole `export`, 9/9 e 207/207.

Il ri-revisore ha **verificato l'affermazione dell'implementatore ed e'
piu' forte di come la raccontava lui**: la sola divisione per zona chiude
1 caso su 3, non 2. Il predicato `resaDaKatex` non e' ridondante — e'
l'unica cosa che separa «zona che KaTeX rendera'» da «zona che diventera'
un riquadro di sorgente». Cambio di strada approvato.

**Ruling 15: apro un giro 3 sul residuo, perche' il ri-revisore ha
misurato una via che costa meno del codice scritto per evitarla.**
Il residuo: `resaDaKatex` guarda se c'e' `\simplify{`, non se KaTeX
rendera' davvero; una zona che fallisse per altro mostra di nuovo un
sorgente tradotto (`\(\var{a}^\)` → il docente legge `\mathit{a}^`). E
non e' teorico: il pulsante `\( \)` che questo task aggiunge inserisce
**la coppia col cursore in mezzo**, quindi il delimitatore di chiusura
c'e' gia' e ogni stato intermedio della battitura e' una zona vera.
Il rapporto diceva che chiuderlo «vorrebbe dire toccare il player»: il
ri-revisore ha misurato che toccare il player costa **una riga additiva**
(`macros: { "\\var": "\\mathit{#1}" }` in `formula.tsx`), che chiude il
residuo **e** rende inutili `varInCorsivo`, `varInCorsivoNelleZone` e
`resaDaKatex` — 207/207 restano verdi, i tre test nuovi compresi. Meno
codice, non piu'. — *Il compromesso che va rispettato:* definire `\var`
come macro **globale** nasconderebbe un bug del motore, perche' un
`\var{}` che sfuggisse alla sostituzione apparirebbe allo studente come
una lettera in corsivo invece che come un riquadro rumoroso. Quindi la
macro va data solo all'eco del docente, non allo studente. — *Costo se
sbagliato:* un giro in piu' su un task gia' verde; se la via risultasse
piu' invasiva del previsto, si torna al codice di `cbd1c9e`, che funziona.

Giro 3: correzione fatta (`ac35006`, 559 test verdi, -70 righe nel
componente). L'implementatore ha misurato che il cammino temuto esiste
davvero (`ContenutoHtml → rendi → dividiTesto → dividiFormule`) e **non
l'ha attraversato**: ha dichiarato un contesto React in `formula.tsx`
consumato da `Formula`, col fornitore solo nell'eco del docente — senza
fornitore la chiave `macros` non compare affatto nelle opzioni di KaTeX.
Sua frase, che vale la pena tenere: «non serviva *un sorgente di
ripiego*, serviva *non aver mai riscritto il sorgente*».
Ri-revisione mandata con quattro rischi nominati (il valore predefinito
del contesto deve dare opzioni **identiche**, non equivalenti; il
contesto nelle dipendenze del `useMemo`; l'SSR; e se le 70 righe erano
davvero morte o se un comportamento e' sparito con loro).

Giro 3 chiuso (ac35006). E1 chiuso per misura. **Il vincolo del Ruling 15
e' stato verificato al livello giusto**: non leggendo il codice ma
spiando le opzioni passate a `katex.renderToString` — senza fornitore le
chiavi sono `["displayMode","throwOnError","strict"]` e `"macros" in
opts` e' **false** (non compare con un oggetto vuoto: non compare
affatto); otto sorgenti resi e confrontati byte per byte con le opzioni
di `cbd1c9e`, 8/8 uguali, ripiego incluso; e sei forme di `\var`
malformato dentro il player senza fornitore danno **sempre** il riquadro
grigio, **mai** un `.mathit`. `contenuto-html.tsx` non attraversato.

Il ri-revisore ha anche corretto il **meccanismo** dichiarato dal
rapporto: la prova che protegge lo studente non cade dove il rapporto
dice (`getByText` trova comunque il sorgente, perche' KaTeX emette
un'`<annotation encoding="application/x-tex">` dentro ogni resa
riuscita); cade per la riga dopo. La prova sorveglia lo stesso, ma la
spiegazione era sbagliata.

**Task 5: complete** — commit ec18f7a, 20646a7, 3eb176f, cbd1c9e,
ac35006. 559 test verdi, tsc ed eslint puliti, il componente ha **70
righe in meno** di due giri fa.

Task 5: minor (differiti, aggiunti dai giri 2-3): `formula.test.tsx:32`
asserzione debole (`getByText` e' vera anche quando KaTeX rende, per via
dell'annotazione MathML; la riga 33 fa il lavoro) — e lo stesso schema
esiste a `formula.test.tsx:23` **senza** una riga che lo copra;
l'eco e' ora piu' permissiva della vecchia regex su `\var` senza graffe
(`\var x` viene reso invece che finire nel riquadro: il motore non lo
sostituirebbe, quindi li' l'eco e' piu' ottimista della realta');
`notaSimplify` e' ancorata al nome `\simplify{` e non all'esistenza del
riquadro; `MacroFormula` ha un nome PascalCase che si legge come un
componente.

## Task 6 — in corso

BASE: ac35006

Task 6 implementato: `7032f71`, DONE_WITH_CONCERNS, 572 test verdi.
Numeri misurati che il piano chiedeva: mathlive sta da solo in un chunk
da **814 637 byte** fra i caricamenti pigri (controprova con l'import
statico costruita: le stesse ~813 KB finiscono nel primo caricamento);
20 file `.woff2`, 296 KB, in `public/fonts/mathlive/`; verifica a mano
con `BASE_PATH=/demo` e `next start` → 20/20 font `200 font/woff2` da
`/demo/fonts/mathlive/`, lo stesso file senza prefisso **404**.
`next.config.ts` non e' stato toccato: `withBasePath` bastava, come
avevo trovato in pre-volo.

Quattro preoccupazioni da giudicare in revisione, di cui due pesanti:
`MathfieldElement.macros` **statica e' deprecata** in 0.110 (il brief la
prescriveva: e' un difetto del piano, non dell'implementatore) e la
macro va per istanza; e un **alias di `mathlive` in `vitest.config.ts`**,
che e' il rischio piu' grande del diff — un alias globale toglie a tutta
la suite la vista del modulo vero, e potrebbe far misurare alla prova del
peso l'alias invece della realta'.

### Task 6 — revisione, giro 1

Conformita' ❌ per due Important; tutto il resto verificato. Il revisore
ha **escluso il caso peggiore del peso**: mathlive sta in un solo chunk
da 814 637 byte, presente solo nel `react-loadable-manifest` e **assente
dai 7 chunk eager della pagina** — quindi non «chunk a se' ma
precaricato», che sarebbe stata una vittoria finta. Quattro mutazioni
dichiarate riprodotte piu' una sua: il predicato del pulsante guarda
davvero la **posizione** del cursore, non la presenza della stringa.

Il rapporto dell'implementatore e' stato onesto su un punto che gli
costava: dichiara che la prova mandata dal brief (`\var{a}` byte per
byte) **non** sorveglia la macro, e ne aggiunge una che lo fa. Il
revisore ha verificato che e' vero.

**Il difetto del piano, confermato:** `MathfieldElement.macros` statica
e' in `DEPRECATED_OPTIONS` in 0.110 e fra gli `static` non esiste
proprio. La riga che il brief prescriveva **non avrebbe registrato
nulla** — e la formula sarebbe apparsa diversa fra eco e finestra, senza
che nessun test lo dicesse. L'implementatore ha fatto bene a disobbedire
al brief.

**Ruling 16: `soundsDirectory` sale da Minor a rilievo del giro.**
Resta il default `"./sounds"`, cioe' un 404 in produzione al primo suono
di tasto. E' una riga, nello stesso file gia' in modifica, ed e' la
**stessa famiglia** del difetto dei font che questo task esiste per
evitare: una risorsa che manca solo in produzione, dove nessun test
guarda. — *Costo se sbagliato:* una riga in piu' che disattiva un suono
che nessuno voleva.

**Ruling 17: l'output sporco dei test sale da Minor a rilievo del giro.**
`Invalid URL "/demo/fonts/mathlive"` a ogni apertura della finestra, e
il GREEN del rapporto lo taceva. La griglia di questo processo dice
esplicitamente che il rumore nell'output dei test **e' un rilievo**: e'
la cosa che nasconde il prossimo difetto vero. — *Costo se sbagliato:*
se il rumore fosse inevitabile in jsdom, la risposta accettabile e'
dirlo e motivarlo, non zittirlo.

Correzione fatta (`c1f75c3`, 573 test verdi, output dichiarato pulito).
F1 chiuso con l'effetto di impaginazione **oltre** alle tre `congeda()`
(servono entrambe le strade); F2 alias spostato sotto `test.alias` e
puntato a `mathlive.min.mjs`; F3 `soundsDirectory = null` con la
motivazione giusta (i suoni servono alla tastiera su schermo, questo e'
uno strumento da scrivania); F4 il rumore **non era inevitabile** — il
finto `document.fonts` dichiara le dodici famiglie KaTeX e MathLive salta
un caricamento che in jsdom non potrebbe comunque avvenire.

Ri-revisione mandata con un'attenzione sopra le altre: **F4 e' il rilievo
su cui e' piu' facile barare.** Se il finto `document.fonts` avesse reso
cieca la prova dei font, il rumore sarebbe sparito *insieme alla
sorveglianza*. Chiesto di riprodurre la mutazione C e di guardare
l'output integrale coi propri occhi, non la citazione nel rapporto.

Giro 1 chiuso (c1f75c3). Quattro mutazioni riprodotte dal ri-revisore piu'
una controprova. **F4 giudicato onesto, e misurato dai due lati**: ha
rimesso l'iteratore vuoto e visto riapparire il rumore nello stesso punto
(quindi la pulizia viene dall'ambiente, non da un filtro: `setup.ts` e'
una riga sola e non c'e' `silent` ne' `onConsoleLog`), e ha rieseguito la
mutazione C **col finto `document.fonts` in vigore** vedendola cadere
(quindi la sorveglianza non e' morta col rumore). Ha anche verificato nel
sorgente della libreria che `soundsDirectory = null` spegne il giro prima
del `fetch` e che la proprieta' e' statica — l'accessore d'istanza
lancia — quindi la riga scritta e' quella che funziona.

**Task 6: complete** — commit 7032f71, c1f75c3. 573 test verdi, output
immacolato verificato in modo indipendente, tsc ed eslint puliti.

Task 6: minor (differiti): la portata del congedo allo smontaggio
(l'effetto gira anche se la finestra non e' mai stata aperta e sfoca
`document.activeElement` chiunque sia — misurato innocuo perche' React
DOM ripristina il fuoco a fine commit, ma e' una dipendenza non
dichiarata da quel ripristino; rimedio a costo nullo: legare l'effetto ad
`aperta` invece che a `[]`); il JSDoc orfano in `aiuto-mathlive.ts:1-23`
(la costante `FAMIGLIE_KATEX` si e' infilata fra il commento e la
funzione che documentava); l'alias che scavalca la mappa `exports` con un
percorso interno (se mathlive rinominasse il file la suite cadrebbe in
modo **rumoroso**, non silenzioso); piu' i Minor del giro precedente.
Due imprecisioni di prosa nei rapporti: le chiamate a `congeda()` sono
due, non tre; e l'`Invalid URL` compariva una volta per **file di prova**,
non a ogni apertura.

## Task 7 — in corso

BASE: c1f75c3

**Ruling 18: il pulsante «Scrivi la formula» segue la stessa regola del
tastierino, non compare sotto ogni `CampoJme`.** Il brief del Task 7 dice
solo «`campo-jme.tsx` (il pulsante)», e messo cosi' comparirebbe anche
sotto la **definizione di una variabile** — dove `random(-9..9 except 0)`
non e' una formula e un editor visuale la distruggerebbe — e sotto il
**margine**, da cui il Ruling 9 ha appena tolto il tastierino per la
stessa ragione. La regola e' quella gia' fissata dal brief del Task 4:
compare dove si scrive matematica (risposta attesa, valore atteso), non
sulle istruzioni. Il **meccanismo** lo sceglie l'implementatore: legarlo
alla prop `tastierino` accoppia due cose che potrebbero divergere. —
*Costo se sbagliato:* un pulsante in meno su un campo dove qualcuno lo
avrebbe voluto; reversibile in una riga.

Task 7 implementato: `1a94be7`, DONE_WITH_CONCERNS, 602 test verdi sulla
superficie e 2601 sull'intera suite; build rifatta, mathlive ancora in un
chunk a se' e fuori dal primo caricamento.

**Ruling 19: la deviazione dal brief sullo strato 3 regge, ed e' il
brief a sbagliare.** L'implementatore ha rifiutato di ripassare i nomi
liberi per un filtro `allConstants()`, come il brief prescriveva.
**Misurato da me contro `packages/engine/src/index.ts`, prima di
decidere:**

```
findvars("pi*x",    [], builtinScope)  →  ["x"]        <- la costante e' gia' tolta
findvars("2*pi*r",  [], builtinScope)  →  ["r"]        <- idem
findvars("e^x",     [], builtinScope)  →  ["x"]        <- idem
findvars("i*x",     [], builtinScope)  →  ["x"]        <- idem
findvars("pi(x+1)", [], builtinScope)  →  ["x", "pi"]  <- QUI no: pi e' in posizione di funzione
```

`findvars` con `builtinScope` toglie **gia'** le costanti in posizione di
valore, tramite `scope.getConstant`. Il secondo filtro che il brief
chiedeva non sarebbe stato ridondante: sarebbe stato **sbagliato**.
Toglierebbe quel `pi` di `pi(x+1)` — l'unico caso in cui `findvars` lo
tiene, e lo tiene perche' li' `pi` e' usato come funzione — facendo
passare il cancello a una formula che il motore poi rifiuta di valutare.
Cioe' il filtro mandato dal piano avrebbe **aperto un buco** nello strato
che esiste per chiuderli. — *Perche':* il brief e' stato scritto senza
sapere che `findvars` fa gia' quel lavoro. — *Costo se sbagliato:* se un
giorno `findvars` cambiasse e smettesse di togliere le costanti,
passerebbero `pi*x` e simili; il rimedio sarebbe tre righe. Va scritto
un commento nel codice, perche' il prossimo lettore vorra' «correggere»
indietro proprio questa scelta.

### Task 7 — revisione, giro 1

Conformita' quasi piena, qualita' da correggere: tre Important, tutti
misurati. **Il caso che decide il task e' preso**, e da una prova che
cade davvero quando lo strato che lo prende sparisce (mutazione strato 1
riprodotta: 4 rosse, `expected '(-b+-sqrt(b^2-4a c))/(2a)' to be ''`).
Peso del pacchetto verificato sul build in `.next`, non sul rapporto.

**Ruling 20: la regola alternativa che avevo proposto e' SBAGLIATA, e
quella giusta e' una terza.** Avevo chiesto di misurare «rifiutare un
nome libero solo se e' il nome di una funzione conosciuta». Il revisore
ha misurato che protegge **strettamente meno**:

- **polarita' invertita**: `findvars` riporta un nome in posizione di
  funzione **se e solo se** `scope.getFunction(nome).length === 0`
  (`evaluate.ts:751`). Il mio predicato era la negazione esatta di quella
  condizione: nessun nome in posizione di funzione sarebbe mai stato
  rifiutato. `pi(x+1)`, `f(x)`, `g(x+1)` tutti accettati, e `evaluate`
  lancia su tutti e tre. Avrei riaperto il Ruling 19 e piu' largo.
- **la premessa era falsa**: `sen`, `tg`, `cotg`, `arcsen`, `lg`, `ctg`
  **non sono funzioni del motore** (`getFunction` da' 0), e MathLive le
  spezza: `\operatorname{sen}x` → `s e n x`. Con la mia regola sarebbero
  passate. E `s e n x` **non lancia nemmeno**: `e` e' Nepero, quindi
  `evaluate("s e n x", {s:1,n:1,x:1})` vale **2.718281828459045**.
  Silenziosa come la quadratica: esattamente il difetto che il task
  esiste per non commettere, reintrodotto da me.

La terza via, misurata dal revisore e che adotto: **sulla sola superficie
della risposta attesa, ammettere al piu' UN nome libero non dichiarato
che non sia una funzione.** Non e' un'invenzione: `verifica.ts:363-416`
gia' **campiona** gli identificatori liberi per le risposte a espressione,
quindi il cancello si allinea a cio' che la verifica gia' fa. Misure:
`a*n*x^(n-1)` accettato ✅ (1 libero: l'incognita), `sin x` rifiutato ✅
(2), `s e n x` rifiutato ✅ (3), `t g x` rifiutato ✅ (3). Costo: passa
anche `2 * y`, che e' innocuo. Sul **valore atteso** di una parte
numerica la regola resta stretta: li' un nome libero e' davvero un
errore, perche' il valore deve essere calcolabile dalle variabili
dichiarate. — *Perche':* il piano aveva messo in conto di rifiutare gli
errori e non si era accorto di rifiutare anche l'input corretto — 1 su 3
delle espressioni vere del corpus, e precisamente l'unica parte a
espressione. — *Costo se sbagliato:* un nome libero di troppo passa il
cancello sulla sola risposta attesa, dove la verifica a venti semi resta
comunque a valle.

Correzione fatta (`0162888`, 618 test verdi). Sei mutazioni dichiarate.
Ri-revisione mandata con l'obbligo di riprodurne almeno quattro, fra cui
G1, G3 e G4b — le tre che proteggono il caso peggiore — e di misurare da
se' i sei casi del Ruling 20, `s e n x` compreso: e' il caso che io stesso
avevo quasi introdotto per errore, e che vale `2.718...` invece di
lanciare.

Nota dell'implementatore da verificare: dice che la mutazione 3 del primo
giro **non e' piu' osservabile**, perche' `chiamataSconosciuta` ora prende
`pi(x+1)` per conto suo — quindi un filtro `allConstants()` sarebbe
codice morto e basta, non piu' dannoso. La conclusione del Ruling 19 non
cambia, ma la **ragione** si', e ha riscritto il commento nel codice. Un
commento che da' la ragione sbagliata e' peggio di nessun commento,
perche' il prossimo lettore agisce su quello: fatto verificare.

Giro 1 chiuso (0162888). Cinque mutazioni su sei riprodotte dal
ri-revisore, comprese tutte e tre le obbligatorie. Il Ruling 20 misurato
da lui in tabella: `a*n*x^(n-1)` con `a,n` dichiarati **OK**; la stessa
senza incognita ammessa **KO**; `sin x` **KO** su `sin`; `s e n x` **KO**
su `n`; `t g x` **KO** su `g`; `2 * y` **OK** (il costo accettato). E la
verifica che conta di piu': **col terzo argomento omesso il predefinito
e' il cancello severo, non quello indulgente** — quindi un chiamante
distratto sbaglia in sicurezza. La visita di G3 non rifiuta le funzioni
legittime (`sin(x)`, `sqrt(x)`, `abs(x)`, `random(1..5)`, `ln(x)`) e
ricorre negli argomenti annidati (`f(g(x))`, `sin(f(x))`,
`sqrt(1+g(x))`).

Il commento sul Ruling 19 e' stato verificato accurato nelle due meta':
il filtro sarebbe codice morto **oggi**, e sarebbe stato dannoso **prima**
di `chiamataSconosciuta`. Anche il commento gemello nel test e' stato
ripulito dalla ragione vecchia.

**Task 7: complete** — commit 1a94be7, 0162888. 618 test verdi, tsc ed
eslint puliti, chiavi 1295=1295.

Task 7: minor (differito, aggiunto dal giro 1): quarta copia di
`campoFormula` in `finestra-formula.test.tsx:54`, ridondante con
`campoFormulaAperto` esportato dal modulo che quel file **gia' importa**
(la motivazione «non e' un file di questo giro» e' una scelta di ambito,
non un vincolo tecnico).

---

# TUTTI I TASK CHIUSI — revisione finale del ramo

## Revisione finale del ramo

Nessun Critical. Quattro Important (I1 conferma a vuoto silenziosa, I2 i
font non vengono mai chiesti, I3 `id` fissi nelle parti, I4 costo per
tasto), dieci Minor, triage dei differiti. 2617 prove verdi su 208 file.
Diciassette Ruling su venti confermati giusti, tre in modo dimostrabile
(4, 15, 20).

Il rilievo che solo questa revisione poteva trovare, e che vale piu' della
somma dei suoi pezzi: il ramo ha unificato la gestione del cursore in **un
hook condiviso da tre superfici in produzione, studente compreso**, e il
comportamento «l'inserimento **sostituisce** la selezione» **non e' provato
da nessuna parte** — le prove con selezione attiva coprono solo il ramo che
*avvolge*. Un difetto li' passa tutta la suite e si vede per la prima volta
sotto le dita di uno studente. Una prova sola lo chiude per tutte e tre.

**Ruling 21: i venti file di font restano, e la nota viene corretta.** Il
revisore ha misurato che non vengono **mai** chiesti: mathlive esce prima
di leggere `fontsDirectory` se le dodici famiglie KaTeX sono gia' in
`document.fonts`, e `layout.tsx:13` importa `katex.min.css` nel **root**
layout dichiarando esattamente quelle dodici; i `.woff2` sono
md5-identici a quelli che katex gia' serve. Tolgo la tentazione di
cancellarli: toglierli renderebbe il fallimento **silenzioso** e
dipendente da un import in un file che non c'entra niente (se un giorno
il root layout smettesse di importare katex, le formule perderebbero i
font e nessun test lo direbbe). E' esattamente la classe di difetto
contro cui questo ramo ha combattuto per sette task. 296 KB sono
un'assicurazione a buon mercato. Va invece corretta la **nota di verifica
a mano**, che oggi dice di controllare che i venti woff2 non diano 404 —
una verifica che non puo' rilevare il difetto per cui esiste, perche'
quei file non verranno mai chiesti. — *Costo se sbagliato:* 296 KB di
file morti nel repository, cancellabili in un comando.

**Ruling 22: il Ruling 12 si estende alla prop `aiuto`.** Il revisore lo
chiede e ha ragione: `righe` fu tolta perche' **inoperante**, `aiuto` e'
solo inutilizzata — ma a **ramo finito** la distinzione non regge piu'.
Nessuno dei sette task le ha trovato un chiamante; e' superficie morta
in un'interfaccia che tre componenti consumano. — *Costo se sbagliato:*
si riaggiunge in una riga il giorno che serve un testo d'aiuto.

Ondata unica di correzioni fatta: `0c5f898`, `b8e85d9`, `1d8c8ef`,
`a270bc0`, `d5864da`. Suite 2629 passate su 209 file (era 2617 su 208),
chiavi 1296=1296, mathlive ancora fuori dal primo caricamento.
A3 misurato: **17,53 → 5,86 ms** nel testo e **19,28 → 5,51 ms** nella
risposta attesa (sei variabili, tre parti, mediana di 25 tasti).

**Due cose emerse nell'ondata che meritano di essere ricordate:**

- **Il rilievo A3 era impreciso e l'implementatore l'ha detto.** Il
  `useMemo` c'era gia' ed era *troppo largo*, non mancante. La correzione
  restringe la chiave e **cambia un comportamento osservabile**: un
  enunciato rotto non fa piu' sparire la tabella dei sorteggi. Una
  correzione di prestazioni che cambia un comportamento e' il modo tipico
  in cui una regressione entra in un'ondata «di rifinitura»: l'ho messo
  come cuore della ri-revisione, con l'ordine di misurare se la tabella
  mostra valori **giusti** o valori **vecchi** spacciati per attuali.
- **A2 nascondeva un difetto peggiore di quello per cui era stato
  scritto.** Lo stesso `id` fisso faceva da `name` ai radio della
  tolleranza: scegliere «margine» in una parte **spegneva la scelta
  dell'altra**. Il rilievo parlava di `aria-describedby`; sotto c'era una
  perdita di dati per il docente. E' preesistente al ramo, trovata solo
  perche' il ramo ci ha appoggiato sopra `${id}-eco`.
