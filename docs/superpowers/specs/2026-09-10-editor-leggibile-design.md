# L'editor degli esercizi: renderlo leggibile, e le formule visuali

**Data:** 2026-09-10
**Stato:** approvato
**Nasce da:** «l'UI non è molto ben organizzata, tutto troppo piatto e non si
capisce bene. Possiamo usare un editor WYSIWYG per le equazioni?»

## Cosa non va, misurato sullo schermo

Non è un'impressione. A 1440×900, aprendo un esercizio del corpus:

- **Il primo schermo non contiene matematica.** Tutto il riquadro visibile è
  catalogo — la Descrizione è il blocco più grande e luminoso della pagina —
  più il testo grezzo con `\(x^2 - \var{a}^2\)` e centotrenta pixel di
  spiegazione sulla notazione. L'esercizio **renderizzato** compare a 2100
  pixel su 2574 di pagina; i pulsanti per controllare e salvare a 2469.
- **Non c'è figura e sfondo.** Trentuno etichette, trentadue campi, quattro
  aree di testo, tre tendine, quindici pulsanti: tutti con lo stesso bordo
  da un pixel, tutti trasparenti, tutti larghi 1072. Una tendina per l'anno,
  che contiene una cifra, è larga 530. Le intestazioni di sezione sono 18
  pixel contro i 14 delle etichette: quattro pixel di «gerarchia». Campo
  dentro riquadro dentro sezione significa tre bordi identici.
- **L'anteprima, che è l'elemento più informativo, è ultima** — e parla come
  se il docente fosse uno studente: «Seme: 4ucvgdur», «Punteggio: 0 / 2», un
  pulsante «Invia» per ciascuna delle tre copie che differiscono di una cifra.
- **L'ordine non è quello del docente**: catalogo, testo, suggerimento,
  variabili con lezione, domande, anteprima, pulsanti.

## La forma nuova

**Due colonne: a sinistra si scrive, a destra si vede.** La colonna destra
resta ferma mentre si scorre e mostra l'esercizio con il player vero, in
modalità locale, come già fa l'anteprima del docente.

A sinistra, nell'ordine in cui un insegnante pensa: il titolo, il testo, le
variabili, le domande. I metadati di catalogo si ripiegano in una scheda:
servono per ritrovare l'esercizio, non per scriverlo.

**Un solo player nella colonna destra**, non tre. Tre riquadri da 335 pixel
non stanno in uno schermo e mostrano la stessa cosa con una cifra diversa.
Al loro posto: tre linguette per i sorteggi, un pulsante per rigenerarli, e
— quando il salvataggio è stato rifiutato — una quarta linguetta rossa con
il seme che ha fallito, che è già oggi la cosa più utile che il sistema sa.

E una **tabella dei valori sorteggiati**: le variabili per tre semi, in
righe. Mostra che l'esercizio è una famiglia meglio di tre copie del player.

## L'eco del motore

Sotto ogni campo che contiene un'espressione JME — definizioni delle
variabili, valore atteso, margine, risposta attesa — compare **come il
motore l'ha interpretata**: la formula resa, oppure l'errore del parser in
italiano, oppure i valori nei tre sorteggi.

È il pezzo con più resa per riga scritta, e la ragione è misurata: `sin x`
**si compila come una moltiplicazione** fra una variabile chiamata `sin` e
la `x`. Oggi il docente non lo scopre mai — l'esercizio si salva, supera i
venti semi, e sbaglia in silenzio davanti alla classe. L'eco lo rende
visibile mentre si scrive.

Il pattern esiste già nel campo delle espressioni dello studente
(`espressione.tsx`): qui si estende a tutti i campi JME dell'editor.

## Le formule visuali

**MathLive**, verificato installabile: nessuna dipendenza fra pari da
risolvere, React 19 gestisce nativamente il suo elemento personalizzato.
Costa 843 KB caricati solo quando servono e venti file di font da mettere
fra le risorse pubbliche.

Ma **come assistente, non come ingresso**, e la distinzione decide il
progetto:

- **Nei campi di testo** (`\( \)` dentro consegna e suggerimento) è
  l'editor: lì il bersaglio è LaTeX, che è esattamente ciò che produce. Con
  una macro perché `\var{a}` sopravviva al giro.
- **Nei campi di risposta** è un pulsante secondario: si scrive nella
  finestrella, il risultato passa da ASCIIMath a JME, viene **compilato dal
  nostro parser** e mostrato al docente prima di essere inserito. Se non si
  compila, non si inserisce.
- **Mai per le definizioni delle variabili né per la condizione.**
  `random(-9..9 except 0)` non è una formula: è un'istruzione, e un editor
  di formule non ha modo di rappresentarla.
- **Mai dentro `\simplify{}`**, il cui contenuto è JME e non LaTeX.

Chi preferisce scrivere continua a scrivere: l'editor visuale non sostituisce
mai il campo di testo, lo affianca.

## Cosa NON si fa

- **Un editor rich-text** per il testo. Il testo del docente è testo con
  formule, non un documento; un editor di documenti aggiungerebbe marcatori
  che la specifica dell'editor ha deliberatamente vietato.
- **Un convertitore LaTeX→JME scritto da noi.** Un parser LaTeX è un
  progetto a sé. Si usa quello che MathLive già produce, si aggiusta una
  tabella corta e chiusa, e si lascia decidere al nostro parser.
- **Il controllo a venti semi a ogni tasto.** È una chiamata al server e un
  ciclo sul motore: resta legato al pulsante.
- **Altre spiegazioni.** Il giro precedente ha aggiunto cose giuste e la
  pagina è comunque diventata più difficile. Qui si toglie e si ripiega.
- **Toccare i componenti di base dei campi** per sistemare questa pagina:
  li usano decine di altre schermate.
- **Il mobile.** È uno strumento da scrivania. Sotto i 1280 pixel si torna a
  una colonna, e basta.
- **Modello, formato, motore, corpus.** Niente di ciò che l'editor produce
  cambia: questa è una ristrutturazione di ciò che si vede.

## Rischi accettati

- **MathLive porta con sé un motore di calcolo** che finisce fra le
  dipendenze installate (~43 MB) senza entrare nel pacchetto servito. È il
  prezzo della libreria; l'alternativa è scriverne una.
- **La conversione da ASCIIMath a JME non è totale.** Trentaquattro
  espressioni tipiche della matematica delle superiori sono state provate;
  la tabella degli aggiustamenti va tenuta corta, e ciò che non si compila
  viene rifiutato invece che inserito storto. In particolare `\pm` diventa
  in silenzio una sola delle due soluzioni: va rifiutato esplicitamente.
- **I font di MathLive vanno serviti da una cartella dichiarata**, e questa
  installazione ha un prefisso di percorso configurabile: se sbagliato, le
  formule appaiono senza font e nessun test se ne accorge.
