# Esercizi — sotto-progetto 5: l'editor

**Data:** 2026-09-07
**Stato:** approvato
**Precede:** sotto-progetto 6 (contenuti da altre installazioni)
**Segue:** sotto-progetto 4 (classi, contenitori, batterie, compiti), unito in `main`

## Perché

Oggi gli esercizi esistono solo come file JSON nel repository: otto, scritti a
mano. Un docente non può aggiungerne uno senza un editor di testo, la
conoscenza del formato Numbas e un accesso al codice. Finché resta così, tutto
quello che abbiamo costruito sopra — contenitori, batterie, compiti — pesca da
un bacino che non cresce.

Questo sotto-progetto dà al docente il modo di scrivere un esercizio.

## La decisione che regge tutto

Il docente **definisce variabili casuali** e le usa nel testo e nella risposta.
Non scrive un esercizio, scrive una famiglia di esercizi: ogni studente riceve
numeri diversi, e due studenti seduti vicini non possono copiarsi la risposta.

È il motivo per cui abbiamo portato il motore Numbas invece di scrivere un
correttore nostro. Un editor che producesse esercizi statici renderebbe quel
lavoro inutile e trasformerebbe la piattaforma in un raccoglitore di schede.

Il costo è che il docente deve imparare una notazione minima. La contropartita
del costo è l'anteprima: vede subito, su tre semi diversi, cosa riceveranno
davvero i suoi studenti.

## Cosa copre la prima versione

Tre tipi di domanda, che coprono la grande maggioranza della matematica delle
superiori:

| Nel prodotto | Nel formato Numbas | Cosa scrive il docente |
|---|---|---|
| Risposta numerica | `numberentry` | un valore atteso, come espressione, più una tolleranza |
| Scelta multipla | `1_n_2` | una risposta giusta fra n |
| Espressione | `jme` | un'espressione matematica attesa, confrontata simbolicamente |

Gli altri cinque tipi che il motore sa trattare — `m_n_2`, `m_n_x`, `gapfill`,
`patternmatch` e i loro parenti — restano leggibili dal player e scrivibili a
mano nel repository. Semplicemente non hanno un modulo di redazione.

`m_n_2` («scegli tutte quelle giuste») è l'estensione più vicina e la meno
costosa: stesso modulo, matrice di correzione diversa e due campi in più. È
rinviata di proposito, non dimenticata.

## Cosa NON copre

- **L'importazione da Numbas.** File `.exam`, banche di esercizi esistenti,
  conversione dal formato originale. Appartiene al sotto-progetto 6.
- **La modifica dell'HTML grezzo.** Vedi «Il testo è testo» più sotto.
- **Le funzioni JME definite dal docente** (`functions`) e i gruppi di
  variabili (`variable_groups`). Il formato li prevede, l'editor scrive
  rispettivamente `{}` e `[]`. Un esercizio scritto a mano che li usa resta
  leggibile; l'editor, riaprendolo, lo dichiara non modificabile invece di
  cancellarglieli. Vedi «Riaprire ciò che l'editor non ha scritto».
- **La cancellazione di un esercizio.** Vedi «Perché non si cancella».

## Il cuore: la verifica prima del salvataggio

Un esercizio randomizzato ha un modo di rompersi che nessuna anteprima
singola rivela: funziona per quarantanove semi su cinquanta, e per il
cinquantesimo genera una divisione per zero, una radice di un negativo, o una
risposta attesa che non esiste. Lo studente sfortunato riceve una pagina
rotta, e il docente non ha modo di sapere perché.

Questa è la ragione principale per cui l'editor deve esistere dentro
l'applicazione e non essere un file JSON scritto a mano: **noi possediamo il
motore, quindi possiamo eseguire l'esercizio prima di salvarlo.**

Al salvataggio, l'esercizio viene caricato con **venti semi diversi**. Per
ciascuno si verifica che:

1. il caricamento non lanci — variabili risolvibili, nessun ciclo fra
   definizioni, nessun errore aritmetico;
2. il testo si sostituisca senza lasciare buchi — nessun `\var{}` di una
   variabile inesistente;
3. la risposta corretta esista e sia resa senza degenerare. In particolare
   la stringa `undefined` non deve comparire nel LaTeX prodotto: è il sintomo
   noto di `renderLatex` su un'espressione incompleta, e senza questo
   controllo passa in silenzio.

Se un seme fallisce, il salvataggio è **rifiutato** e l'errore dice quale seme
e cosa è successo. Non un avviso da ignorare: un rifiuto. Un esercizio che
fallisce un seme su venti fallirà per uno studente su venti.

Venti è un compromesso dichiarato: abbastanza da intercettare i casi degeneri
frequenti, abbastanza pochi da non far attendere il docente. Non è una prova
di correttezza e la specifica non pretende che lo sia.

## L'anteprima

Sotto il modulo, sempre visibile, l'esercizio **reso dal player vero** —
`player-esercizio`, lo stesso componente che vede lo studente, non una
riproduzione. Ciò che il docente guarda è ciò che lo studente riceverà, per
costruzione e non per diligenza.

Tre semi affiancati, con un pulsante per rigenerarli. Tre perché uno non mostra
che l'esercizio è randomizzato e cinque non entrano in una schermata.

L'anteprima è **inerte**: risponde e mostra la correzione in locale, senza
creare tentativi, senza toccare il database. Un docente che prova il proprio
esercizio non deve comparire fra le consegne.

## Il testo è testo

I campi di testo — consegna, suggerimento, testo di una risposta — accettano
**testo semplice con formule**, non HTML. L'editor li avvolge in `<p>` e li
consegna al formato.

Due ragioni. La prima è che i docenti vogliono scrivere matematica, non
marcatori. La seconda è che il player rende quell'HTML: accettare marcatori
arbitrari da un modulo web significherebbe aprire una via di iniezione dentro
la pagina di ogni studente della scuola. Il sanificatore costruito nel
sotto-progetto 3 esiste già e regge, ma la difesa migliore è non accettare
marcatori del tutto.

Dentro il testo il docente può scrivere:

- `\( ... \)` per una formula in riga, `\[ ... \]` per una formula isolata;
- `\var{a}` per il **valore** di una variabile;
- `\simplify{ {a}x + {b} }` per un'**espressione semplificata** che usa le
  variabili — dentro `\simplify` le variabili si scrivono `{a}`, fuori
  `\var{a}`.

Quest'ultima distinzione è la cosa meno ovvia dell'intera notazione, e
l'interfaccia deve dirlo esplicitamente accanto al campo, con un esempio di
entrambe. Non basta documentarlo altrove: si sbaglia proprio mentre si scrive.

## Le variabili

Un pannello con una riga per variabile: **nome**, **definizione**,
**descrizione** (facoltativa). La definizione è un'espressione JME:
`random(2..9)`, `random(-9..9 except 0)`, `a*k + b`.

Ogni definizione è valutata mentre il docente scrive, e l'errore compare
accanto alla riga che lo causa, non in fondo alla pagina.

L'ordine di risoluzione lo calcola il motore dalle dipendenze, non il docente:
scrivere `c = a*k + b` prima di `a` funziona. Questo va detto nell'interfaccia,
perché l'aspettativa contraria è naturale.

**La condizione.** Un campo facoltativo (`variablesTest.condition`) che
impone un vincolo: `a <> b`, oppure che un discriminante sia un quadrato
perfetto. Il motore rigenera finché la condizione è soddisfatta, fino a
`maxRuns` tentativi. È lo strumento con cui un docente evita gli esercizi
degeneri, e senza di esso molte famiglie di esercizi non sono esprimibili.

Se la condizione è troppo stretta il motore esaurisce i tentativi e fallisce.
Il controllo a venti semi lo intercetta e il salvataggio è rifiutato con
quella ragione, che è esattamente il momento giusto per scoprirlo.

## La risposta attesa, per tipo

**Risposta numerica.** Il docente scrive un valore atteso, che può essere
un'espressione nelle variabili (`k`, oppure `(c-b)/a`), e una tolleranza:
*esatta*, oppure *± un margine*, oppure *a un numero di cifre decimali*. Il
formato Numbas non ha un campo «risposta»: ha `minValue` e `maxValue`, ed è
l'editor a derivarli dalla coppia valore-tolleranza. Il docente non vede mai
`minValue`.

Questa traduzione è il punto in cui è più facile sbagliare in silenzio, e va
coperta da test propri: una tolleranza *esatta* deve produrre `minValue` e
`maxValue` uguali, e un margine deve produrre un intervallo centrato.

**Scelta multipla.** Da due a sei risposte, una marcata come giusta. Le
risposte sono testo con formule, come tutto il resto. L'ordine è mescolato per
lo studente (`shuffleChoices`), il che vuol dire che il docente non deve
scrivere «nessuna delle precedenti».

**Espressione.** Il docente scrive l'espressione attesa; il motore la confronta
con quella dello studente **simbolicamente**, non come stringhe: `2x` e `x*2`
e `x+x` sono la stessa risposta. Questo è il tipo che dà più valore e va
spiegato, perché un docente che non lo sa scriverà consegne difensive del tipo
«semplifica il risultato».

## Persistenza e versioni

Il modello c'è già e non va toccato. `Esercizio` porta i metadati,
`EsercizioVersione` il contenuto, e **il tentativo di uno studente punta alla
versione, non all'esercizio**.

Ne discende la regola che rende sicura la modifica: **salvare non modifica mai
una versione esistente, ne crea una nuova** con `version + 1` e il proprio
`hashContenuto`. Un compito già assegnato continua a mostrare la versione con
cui è stato assegnato; le pescate successive prendono l'ultima.

Un docente può quindi correggere un errore in un esercizio senza cambiare
sotto i piedi il compito che trenta studenti stanno svolgendo. Era già vero
nello schema: questo sotto-progetto è il primo che lo usa.

## Perché non si cancella

L'editor non cancella esercizi. `EsercizioVersione` è in cascata su
`Esercizio`, e `Tentativo.versione` è in cascata sulla versione: cancellare un
esercizio cancellerebbe il lavoro svolto dagli studenti su di esso.

La revisione finale del sotto-progetto 4 ha già segnalato che i due lettori di
`drawnVersionIds` divergono quando una versione sparisce — corretto lì, ma il
difetto esisteva perché nessuno poteva ancora cancellare. Aprire quella via
adesso significherebbe riaprirlo.

Se serve togliere un esercizio dalla circolazione, lo si toglie dai
contenitori. Un vero archivio (`archivedAt`, già presente e mai scritto)
appartiene a un altro giro.

## Riaprire ciò che l'editor non ha scritto

Gli otto esercizi esistenti, e qualunque esercizio scritto a mano, usano
costrutti che l'editor non genera: tipi di parte non coperti, funzioni,
gruppi di variabili, parti multiple.

Riaprendo un esercizio l'editor **riconosce se sa rappresentarlo per intero**.
Se non sa, lo dichiara di sola lettura e lo dice: *«questo esercizio usa
costrutti che l'editor non sa modificare; puoi duplicarlo o modificarlo nel
repository»*. Non ne offre una modifica parziale.

Questa è la regola che protegge dal danno peggiore che l'editor può fare:
aprire un esercizio ricco, mostrarne la metà che capisce, e salvarne una
versione con l'altra metà cancellata. Un salvataggio con perdita silenziosa è
peggio di un rifiuto.

## Duplicare

Da qualunque esercizio, anche di sola lettura, si crea una copia modificabile.
È il modo con cui un docente parte da qualcosa che funziona invece che dal
foglio bianco, ed è il percorso che ci aspettiamo sia il più battuto.

La copia è un `Esercizio` nuovo con la sua prima versione, non un legame:
modificarla non tocca l'originale.

## Chi può fare cosa

**Qualunque docente può creare, duplicare e modificare qualunque esercizio.**

È la stessa governance scelta per i contenitori nel sotto-progetto 4: un
dipartimento di matematica di una scuola, non un sistema di permessi. La
specifica precedente ha già accettato il rischio corrispondente e ha
richiesto che sia detto nell'interfaccia invece che nascosto; qui vale lo
stesso e la stessa riga va scritta.

`Esercizio.authorId` esiste ed è oggi non scritto. L'editor lo valorizza alla
creazione, così esiste una provenienza. Non è un permesso: non viene
controllato per decidere chi può modificare. Serve a rispondere a «chi l'ha
scritto», che è una domanda che un dipartimento si fa.

## Le pagine

| Percorso | Cosa |
|---|---|
| `/dashboard/esercizi/redazione` | elenco degli esercizi, con stato modificabile o di sola lettura, e il pulsante per crearne uno |
| `/dashboard/esercizi/redazione/nuovo` | l'editor, vuoto |
| `/dashboard/esercizi/redazione/[id]` | l'editor su un esercizio esistente |

Tutte dietro `redirectUnlessTeacher()`, come il resto del cruscotto.

Le rotte seguono la forma già stabilita nel sotto-progetto 4: cancello
d'autorizzazione, tetto di frequenza per docente, validazione dello scafo,
dominio in fondo, e i rifiuti del dominio mappati su codici di stato invece
che appiattiti in un errore generico.

## Rischi accettati

- **Un docente può scrivere un esercizio matematicamente sbagliato.** Il
  controllo a venti semi verifica che l'esercizio *funzioni*, non che sia
  *giusto*: se la risposta attesa è `(c+b)/a` invece di `(c-b)/a`, tutto gira
  e tutti gli studenti sbagliano. Nessuna verifica automatica può chiudere
  questo, ed è giusto che sia il docente a rispondere della matematica. Ciò
  che possiamo fare è l'anteprima con la correzione visibile, così il docente
  vede la propria risposta attesa risolta prima di salvare.

- **Venti semi non sono una prova.** Una famiglia che degenera per un caso su
  mille passerà. Il rifiuto al salvataggio riduce il problema, non lo elimina.

- **Due docenti che modificano lo stesso esercizio** creano due versioni
  successive, e vince l'ultima senza che il primo lo sappia. Nel sotto-progetto
  4 la stessa situazione sui contenitori è risultata non distruttiva perché il
  client manda differenze; qui manda un documento intero, quindi la perdita è
  possibile. È accettata per un dipartimento piccolo, e va detta
  nell'interfaccia mostrando autore e data dell'ultima versione.

## Punti aperti

- Se il docente debba poter **provare l'esercizio come studente** creando un
  tentativo vero, invece dell'anteprima inerte. Utile, ma sporcherebbe le
  statistiche; si decide quando ci saranno statistiche che valga la pena non
  sporcare.
- Se l'elenco degli esercizi debba mostrare **quanti compiti usano** ciascuno,
  prima di modificarlo. Utile e non gratuito: si decide se qualcuno modifica
  per sbaglio un esercizio molto usato.
