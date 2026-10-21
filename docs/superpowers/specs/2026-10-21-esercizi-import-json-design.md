# Esercizi: import da JSON generato con l'IA — design

Data: 2026-10-21

## Perché

Il docente vuole creare esercizi di matematica in serie facendoli scrivere a
un'IA (ChatGPT, Claude, …), come già fa per i quiz con la pagina "Prompt IA"
+ import Excel. Esempio concreto: "piano cartesiano — distanza tra due punti,
punto medio", con coordinate casuali. Oggi gli esercizi si creano solo a mano
nell'editor (redazione) o con lo script `scripts/seed-esercizi.ts` lato server.

Il flusso che vuole:

1. apre "Prompt IA", sceglie Esercizi, scrive argomento / classe / quanti;
2. copia il prompt, lo incolla nell'IA, ottiene un JSON;
3. in Savint carica il file (o incolla il testo), **vede l'anteprima** di ogni
   esercizio come lo vedrà lo studente;
4. preme "Importa tutti"; gli esercizi diventano esercizi suoi, normali,
   modificabili nell'editor se c'è qualcosa da sistemare.

## Obiettivi

- Scheda "Esercizi" nella pagina `/dashboard/ai-prompts` con un prompt pronto.
- Pagina di import con anteprima per esercizio ed errori leggibili.
- Gli esercizi importati sono indistinguibili da quelli creati con l'editor
  (stesso autore = il docente, stessa verifica, apribili nell'editor).

## Non-obiettivi

- **Niente grafici, figure, diagrammi, immagini** nel prompt (detto dal
  docente: "per ora nulla grafici"). Se l'IA li mettesse comunque, l'import
  non li vieta: passano o falliscono per la verifica normale.
- Niente import Excel per gli esercizi.
- Niente chiamata diretta a un'IA da Savint: il docente usa la sua IA.
- Niente import del formato interno Numbas (`content/esercizi/*.json`).
- Niente opzioni nel prompt per difficoltà o tipo di risposta: **decide l'IA**
  (detto dal docente).

## Anti-obiettivi

- Un esercizio importato che lo studente vede rotto (variabili che danno
  divisioni per zero, risposta sbagliata, ecc.): la stessa verifica su più
  semi dell'editor deve girare prima della scrittura, sempre lato server.
- Un import che fallisce "in blocco" senza dire quale esercizio e perché.

## Il formato del file (scelta mia)

L'IA scrive il **modello dell'editor** — `EsercizioEditor` in
`src/lib/esercizi/editor/modello.ts` (`meta`, `testo`, `suggerimento`,
`variabili`, `condizione`, `parti` con tipi `numerica` / `scelta` /
`sceltaMultipla` / `espressione`) — non il JSON Numbas. È più piccolo, in
italiano, è quello che l'editor sa riaprire, e passa da `versoNumbas` +
`verificaEsercizio` già esistenti.

Involucro accettato (scelta mia, tollerante perché l'IA non è precisa):

- `{ "esercizi": [ EsercizioEditor, ... ] }` — la forma che il prompt chiede;
- oppure un array nudo `[ ... ]`;
- oppure un solo oggetto `EsercizioEditor`.

Il testo incollato può essere racchiuso in un blocco ```` ```json ... ``` ````
o avere testo prima/dopo (le IA lo fanno): si estrae dal primo `{`/`[` al
corrispondente ultimo `}`/`]`. Limiti: massimo 30 esercizi per import, 1 MB.

Campi vuoti mancanti (scelta mia): le IA omettono spesso i campi vuoti. Prima
della validazione, una normalizzazione **lato server** (in entrambe le rotte,
stessa funzione, con i suoi test) aggiunge solo i valori vuoti mancanti:
`meta.descrizione: ""`, `meta.tag: []`, `suggerimento: ""`, `variabili: []`,
`condizione: ""`. Non inventa nient'altro: titolo, argomento, anno,
difficoltà, testo e parti restano obbligatori. Il prompt chiede comunque
tutti i campi.

## La pagina del prompt

`src/app/(dashboard)/dashboard/ai-prompts/page.tsx`: due schede, **Quiz**
(l'attuale, invariata) ed **Esercizi**. Campi della scheda Esercizi:
argomento (testo libero), classe (1ª–5ª superiore → `meta.anno`), quanti
esercizi (default 5, max 30). Pulsante copia come per i quiz. Nessun modello
Excel da scaricare; al suo posto un link "Importa gli esercizi" alla pagina di
import.

Il prompt (in `src/messages/it.json` / `en.json`, chiave nuova sotto `ai`)
spiega all'IA:

- l'involucro `{ "esercizi": [...] }` e i campi di `EsercizioEditor` con i
  vincoli dello schema (anno 1–5, difficoltà 1–3, punti ≥ 1, 2–6 risposte per
  `scelta`, 2–8 per `sceltaMultipla`, `indiceGiusta` 0-based, `corrette`
  allineato alle risposte, tolleranze `esatta`/`margine`/`decimali`);
- la sintassi delle variabili (JME: `random(-9..9)`, `precround(x, 2)`,
  `sqrt`, …) e come richiamarle nel testo/consegna (`\var{nome}` e
  `\(\var{nome}\)`, formule tra `\( \)`) — la stessa sintassi che usa
  l'editor oggi;
- la `condizione` per escludere sorteggi degeneri (es. A ≠ B);
- di scegliere da sé difficoltà e tipo di parte;
- di non usare grafici/figure/immagini;
- un **esempio completo** (distanza tra due punti con condizione, e punto
  medio con due parti numeriche).

L'esempio del prompt deve essere coperto da un test: estratto dal messaggio,
deve passare schema + `verificaEsercizio`. Se qualcuno cambia lo schema e
rompe l'esempio, il test lo dice.

## La pagina di import

Percorso: `/dashboard/esercizi/redazione/importa`, raggiunta da un pulsante
"Importa da file" accanto a "Nuovo esercizio" nell'elenco della redazione, e
dal link nella pagina del prompt. Solo docenti (`redirectUnlessTeacher`).

1. **Carica**: un campo file (`.json`) **oppure** un'area dove incollare il
   testo (scelta mia: dall'IA si copia più facilmente di quanto si scarichi).
   Pulsante "Controlla".
2. **Controllo**: il client estrae ed esegue il parse; poi chiama
   `POST /api/esercizi/redazione/importa/verifica` con l'array grezzo. Il
   server, per ogni elemento, rende:
   - `ok` → più il `content` Numbas (da `versoNumbas`) per l'anteprima;
   - `invalid_body` → con l'elenco dei problemi di zod, ciascuno con il
     percorso del campo e il messaggio (es. `parti.1.indiceGiusta: indiceGiusta
     deve indicare una risposta fra quelle elencate`). Non `cosaManca`, che
     dice solo dove ("parte N", "altro") e non cosa: l'IA deve poter
     correggere leggendo l'errore (scelta mia);
   - `verifica_fallita` → con il dettaglio della verifica (seme, fase,
     messaggio).
3. **Elenco**: una scheda per esercizio con titolo, argomento, anno,
   difficoltà, stato. Per gli `ok` l'anteprima con `PlayerEsercizioLazy` in
   `soloLocale` (come `anteprima-docente-client.tsx`), un sorteggio alla
   volta e pulsante "Altri numeri". Per gli errori: il messaggio in chiaro e
   un pulsante "Copia l'errore per l'IA" che copia un testo tipo
   "L'esercizio N «titolo» non è valido: … Correggilo e restituisci di nuovo
   tutto il JSON."
4. **Importa**: pulsante "Importa N esercizi" (solo quelli `ok`; quelli con
   errori sono saltati e il pulsante lo dice). Chiama
   `POST /api/esercizi/redazione/importa` con gli esercizi validi. Il server
   **rifà** schema + verifica (non si fida del client) e crea ciascuno con
   `creaEsercizio(input, teacherId)`. Ognuno nella sua transazione: un
   fallimento non annulla gli altri; la risposta dice per ciascuno
   `esercizioId` o il motivo. Poi si torna all'elenco della redazione con un
   avviso "N esercizi importati" (e gli eventuali falliti elencati).

**Doppioni** (deciso dal docente). Oggi gli esercizi non si possono cancellare
e l'elenco della redazione è comune a tutti i docenti, quindi l'import deve
evitare di creare copie. Un esercizio è "già presente" quando
`hashContenuto(versoNumbas(input))` coincide con l'`hash` di una
`EsercizioVersione` esistente (qualunque esercizio, qualunque versione —
scelta mia), oppure con quello di un esercizio precedente nello stesso file.
La verifica lo segnala con lo stato `gia_presente` (con il titolo
dell'esercizio esistente). In anteprima compare come "già importato" e non
viene contato in "Importa N esercizi". La rotta di import rifà il controllo
e lo salta anche lato server. Basta un solo carattere diverso per avere un
esercizio diverso: è voluto, e l'anteprima permette di accorgersene.
Il confronto è una sola query `findMany({ where: { hash: { in: [...] } } })`.
Su `hash` non c'è un indice, ma le tabelle sono piccole: **nessuna
migrazione** in questo lavoro (scelta mia).

La **cancellazione degli esercizi** (pulsante "Elimina") è stata richiesta
anch'essa, ma è un **progetto separato**, con un suo design: cosa succede
agli esercizi usati in compiti con tentativi collegati, e chi può cancellare.
Non fa parte di questo lavoro.

## API

Entrambe le rotte: `requireTeacher`, rate limit dedicato
(`esercizi:redazione-importa:<id>`, poche chiamate al minuto, perché ognuna
fa fino a 30 verifiche), corpo `{ esercizi: unknown[] }` con `max(30)`,
validazione per elemento con `esercizioEditorSchema` (non sul corpo intero:
un elemento sbagliato non deve rifiutare gli altri). Mappatura degli esiti
coerente con `src/app/api/esercizi/redazione/route.ts`.

## Testi

Tutte le stringhe nuove in `it.json` e `en.json`, come il resto della
dashboard.

## Test

- unità: estrazione del JSON dal testo incollato (blocco ```json, testo
  attorno, array nudo, oggetto singolo, testo non JSON);
- l'esempio del prompt passa schema + verifica;
- rotte: docente/studente/anonimo, elemento valido + elemento rotto nello
  stesso corpo (esiti separati), oltre 30 rifiutato, l'import crea con
  `authorId` del docente;
- pagina di import: errore mostrato e copiabile, pulsante che conta solo i
  validi.

## Lasciato a chi costruisce

- Layout e stile delle schede (seguire `--brand-*` e i componenti esistenti).
- Il testo esatto del prompt, purché copra i punti sopra e l'esempio passi il
  test.
- Se l'anteprima rende il `content` lato client da `versoNumbas` o lo prende
  dalla risposta della verifica (preferibile la risposta: una sola fonte).
