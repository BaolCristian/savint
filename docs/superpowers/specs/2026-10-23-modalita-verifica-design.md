# Modalità VERIFICA online — design

Data: 2026-10-23. Stato: bozza da approvare.

## Perché

Oggi un compito è un esercizio di allenamento: lo studente vede subito se ha
sbagliato, può aprire lo svolgimento e ricominciare quante volte vuole. Il
docente vuole anche fare **verifiche vere in aula**, online: punteggi decisi
da lui, tempo limitato, nessun aiuto durante la prova, voto dato quando ha
controllato. La «stampa come verifica» su carta esiste già e resta com'è.

Successo: un docente prepara la verifica con la stessa pagina dei compiti, la
avvia in classe, la classe la svolge a schermo intero, nessuno perde le
risposte se il computer si blocca, gli studenti con PDP hanno le loro misure
senza che gli altri se ne accorgano, e il docente pubblica i punteggi quando
ha finito di controllare.

## Obiettivi

1. Creare una verifica dalla pagina «Nuovo compito», con punti per esercizio.
2. Avvio a un orario programmato **o** con il pulsante «Avvia».
3. Durata prevista con conto alla rovescia per lo studente; allo zero la sua
   prova si consegna da sola.
4. Durante la prova: nessuna correzione, nessun suggerimento, nessuno
   svolgimento, nessuna risposta attesa, nessun «Ricomincia». Lo studente può
   tornare indietro e cambiare risposte fino alla consegna.
5. Salvataggio continuo delle risposte (anche parziali) sul server.
6. Pulsante «Consegna»; dopo, niente più modifiche.
7. Anti-copiatura per rilevamento: schermo intero, registrazione delle uscite
   (schermo intero, cambio scheda/finestra), avviso allo studente, conteggio
   visibile al docente in tempo (quasi) reale.
8. Chiusura decisa dal docente (anche prima dello zero); minuti extra a tutti o
   a un singolo studente.
9. Misure PDP per studente: tempo supplementare, meno esercizi, calcolatrice,
   formulario.
10. Correzione automatica, revisione e modifica dei punti da parte del
    docente, poi «Pubblica i risultati»: solo allora lo studente vede punti,
    risposte, correzioni e svolgimento.

## Non obiettivi

- Bloccare davvero l'uscita dal browser o dal sito: il browser non lo
  permette. Si rileva e si registra, non si impedisce.
- Webcam, microfono, sorveglianza.
- Correzione di domande aperte a mano libera (oltre alla modifica dei punti).
- Verifiche per più classi insieme: come i compiti, una verifica è per una
  classe.
- Sostituire la stampa su carta.

## Anti-obiettivi (sarebbe un fallimento anche se funziona)

- Uno studente perde risposte per un crash, un refresh o una rete instabile.
- Uno studente con PDP viene riconosciuto dai compagni (badge, tempi diversi
  mostrati agli altri, esercizi barrati).
- Durante la prova compare un qualunque segnale di giusto/sbagliato.
- Uno studente consegna o modifica risposte dopo la chiusura.
- I dati PDP sono visibili a chi non è docente della classe.

## Decisioni prese con il docente

- La verifica si costruisce come un compito: esercizi scelti a mano e/o N a
  caso da una raccolta o da un argomento; il punteggio si indica sugli
  esercizi/blocchi.
- Avvio: orario fissato oppure pulsante «Avvia».
- Durata prevista con conto alla rovescia visibile; allo zero la prova dello
  studente si chiude (consegna automatica di quanto salvato). Il docente può
  chiudere prima per tutti.
- Il punteggio lo controlla e lo pubblica il docente, quando decide.
- PDP: tempo supplementare personale, eventualmente meno esercizi,
  calcolatrice, formulario. Le misure si impostano una volta sullo studente
  e valgono in automatico per ogni verifica, modificabili per la singola
  verifica.
- Con meno esercizi il punteggio si **riproporziona** al totale della
  verifica (es. 12/16 → 15/20).
- Alla chiusura chi non ha consegnato viene consegnato in automatico.
- Lo studente vede risultati, risposte, correzioni e svolgimento solo dopo
  «Pubblica i risultati».
- Assenti: il docente può **riaprire la verifica per uno o più studenti**
  (recupero), anche dopo la chiusura, con le stesse domande; il loro tempo
  parte quando il docente avvia il recupero.
- Calcolatrice e formulario si scelgono **per verifica**: nessuno / solo chi
  ha la misura PDP / tutta la classe.

## Come funziona

### 1. Creazione (docente)

Nella pagina `/dashboard/esercizi/compiti/nuovo` compare una scelta in alto:
**Compito** / **Verifica**. Con «Verifica»:

- Ogni blocco (argomento, raccolta, scelti) ha un campo **punti per
  esercizio** (default 1, decimali a passo 0,5). Il riepilogo mostra il
  totale della verifica.
- Ogni blocco ha un campo **«per PDP»**:
  - blocco a caso: «quanti per gli studenti con meno esercizi» (≤ quanti,
    default = quanti);
  - blocco scelti: per ogni esercizio una spunta «non per PDP».
- Le date «apre il / scade il» sono sostituite da:
  - **Durata** in minuti (obbligatoria);
  - **Avvio**: «quando premo Avvia» (default) oppure «a un orario» (data +
    ora).
- **Formulario** (facoltativo): carica un'immagine o un PDF.
- **Strumenti**: calcolatrice e formulario, ciascuno con la scelta «nessuno /
  solo chi ha la misura PDP / tutti» (default: solo PDP; il formulario conta
  solo se caricato).
- I modi CLASSE / STUDENTE restano disponibili (STUDENTE = domande diverse
  per studente, utile contro la copiatura).
- L'anteprima e «Salva anche come modello» funzionano come oggi; un modello
  ricorda anche punti e campi PDP.

### 2. Stati della verifica

`PREPARATA` → (Avvia o orario) → `IN_CORSO` → (Chiudi, o tutti gli studenti
hanno finito il tempo) → `CHIUSA` → (Pubblica) → `PUBBLICATA`.

- PREPARATA: lo studente vede nell'elenco «Verifica di <data/ora>» non
  apribile («Non ancora iniziata»). Il docente può modificarla o ritirarla.
- IN_CORSO: apribile. Il docente vede il monitoraggio.
- CHIUSA: nessuno può più scrivere (salvo i recuperi, sotto). Il docente
  rivede e corregge.
- PUBBLICATA: lo studente vede i risultati. Il docente può ancora modificare
  i punti (lo studente vede il valore aggiornato).
- **Recupero**: in IN_CORSO, CHIUSA o PUBBLICATA il docente seleziona uno o
  più studenti che non hanno consegnato nulla (nessuna prova o prova vuota)
  e preme «Avvia recupero». Per loro soli la verifica si apre, con le stesse
  domande che avrebbero avuto, la stessa durata e le loro misure PDP; il
  loro tempo parte da quel momento. «Chiudi recupero» li chiude prima dello
  zero. Se i risultati sono già pubblicati, quelli dei recuperati si
  pubblicano quando il docente preme di nuovo «Pubblica» per loro (fino ad
  allora vedono «Risultati non ancora pubblicati»). Gli altri studenti non
  vedono nulla di diverso.
- Ritirare una verifica funziona come per i compiti (ritiratoAt).

### 3. Tempo

- La scadenza di ogni studente è **inizio + durata × (1 + tempo extra PDP %)
  + minuti extra concessi**, dove «inizio» è l'avvio della verifica (o
  l'avvio del suo recupero). Non si conta da quando lo studente la apre: chi
  arriva tardi ha meno tempo, come in aula.
- Il conto alla rovescia dello studente usa l'ora del server (il client
  calcola lo scarto all'apertura e lo ricalcola a ogni salvataggio), così un
  orologio del PC sbagliato non conta.
- Allo zero: il client consegna da solo; il **server** rifiuta comunque ogni
  scrittura dopo la scadenza (con un margine di grazia di 30 s per i
  salvataggi in volo) e segna la prova come consegnata automaticamente.
- «Chiudi» del docente: chiude subito per tutti, anche per chi ha tempo extra
  residuo (il docente vede quanti hanno ancora tempo e lo conferma).
- «+ minuti»: a tutti o a uno studente; la scadenza si aggiorna e il client lo
  vede al salvataggio successivo o al polling.
- Una verifica IN_CORSO in cui tutti hanno consegnato o esaurito il tempo
  passa a CHIUSA da sola.

### 4. La prova (studente)

Una pagina dedicata (non il percorso esercizio-per-esercizio dei compiti):

- All'apertura: schermata «Inizia la verifica» con durata, numero di esercizi
  e la regola «resta a schermo intero». Il pulsante entra a schermo intero e
  avvia la prova.
- In alto: conto alla rovescia, stato del salvataggio («Salvato»), pulsante
  «Consegna». Per chi ha la misura: pulsante «Calcolatrice» e «Formulario».
- Navigazione: elenco numerato degli esercizi (1, 2, 3…) con indicazione
  «risposto / non risposto» (mai giusto/sbagliato); si salta liberamente
  avanti e indietro.
- Ogni esercizio usa il player esistente in una **modalità verifica**:
  - nessun feedback di correttezza, nessun punteggio, nessuno svolgimento,
    nessuna risposta attesa, nessun «Ricomincia», nessun «Riprova»;
  - il pulsante «Invia» per parte non esiste: la risposta si salva da sola
    mentre lo studente scrive (con un breve ritardo, e quando lascia il
    campo o cambia esercizio);
  - le risposte restano modificabili fino alla consegna.
- «Consegna»: conferma con il numero di parti senza risposta; poi schermata
  «Verifica consegnata» e uscita dallo schermo intero.
- Crash/refresh: riaprendo, la prova riparte dallo stato salvato sul server,
  con lo stesso seme e le stesse domande.
- Salvataggio non riuscito (rete giù): avviso visibile «Non salvato, ritento»,
  coda locale in memoria e in localStorage, nuovi tentativi automatici. Le
  risposte in coda partono appena torna la rete, se non è scaduto il tempo
  (con il margine di grazia).

### 5. Anti-copiatura (rilevamento)

- Eventi registrati sul server con ora: uscita dallo schermo intero, scheda o
  finestra non visibile (`visibilitychange`), perdita del focus della
  finestra (`blur`) oltre 2 secondi, rientro.
- Allo studente: sovrapposizione «Sei uscito dallo schermo intero — rientra»
  con pulsante che rientra; la prova non si blocca.
- Al docente: numero di uscite e durata totale fuori, per studente, nel
  monitoraggio e nei risultati, con il dettaglio orario.
- Disattivati dentro la prova: menu contestuale e copia del testo delle
  domande. Incollare nei campi di risposta resta permesso (non si distingue
  il testo scritto dallo studente da quello incollato).
- **Limite noto da dichiarare:** il motore gira nel browser, quindi il
  contenuto dell'esercizio arriva al client. In modalità verifica il server
  **toglie** dal contenuto inviato lo svolgimento (`advice`) e i testi di
  feedback, ma i dati per calcolare la risposta corretta restano: uno
  studente esperto con gli strumenti di sviluppo potrebbe ricavarla. Aprire
  gli strumenti di sviluppo in genere fa perdere il focus o lo schermo
  intero, quindi viene registrato. Non si fa correzione lato server senza
  contenuto nel client (riscrittura del motore: fuori portata).

### 6. Monitoraggio (docente, durante la prova)

Nella pagina della verifica:

- Pulsanti: **Avvia** (se PREPARATA), **Chiudi**, **+ minuti a tutti**.
- Tabella studenti: stato (non entrato / in corso / consegnato / consegnato
  automaticamente), esercizi con risposta su totale, tempo residuo (con
  il suo extra), uscite dallo schermo, ultimo salvataggio, pulsante
  «+ minuti» per riga.
- Aggiornamento con polling ogni 5 secondi (nessun socket: le API non possono
  emettere eventi oggi e il polling basta per una classe).
- Nessun punteggio visibile durante la prova (scelta per non distrarre; è
  comunque calcolato).

### 7. Correzione e pubblicazione

- La correzione automatica usa il motore come oggi (`ricalcola`): per ogni
  esercizio la frazione `score / maxScore` del tentativo, moltiplicata per i
  punti dell'esercizio nella verifica. Nessuna risposta = 0.
- Studente con meno esercizi: totale riproporzionato al totale pieno della
  verifica (somma ottenuta × totale pieno / totale dei suoi esercizi).
- Pagina risultati (dopo CHIUSA): tabella studenti × esercizi con punti; per
  ogni cella si apre la risposta dello studente (in sola lettura, con
  correzione e risposta attesa) e si può **modificare il punteggio** a mano
  (valore tra 0 e i punti dell'esercizio, passo 0,25). Le modifiche manuali
  sono evidenziate.
- Colonne: totale, percentuale, uscite dallo schermo. Esportazione CSV come
  le altre statistiche, se già esiste un pattern; altrimenti fuori portata.
- **Pubblica i risultati**: lo studente vede punti per esercizio e totale,
  le sue risposte con la correzione, risposta attesa e svolgimento. Non vede
  le uscite dallo schermo registrate.
- Dopo la pubblicazione lo studente può rifare liberamente ciascun esercizio
  in allenamento (come «Riprova» oggi), senza effetti sulla verifica.

### 8. Misure PDP

- Nella pagina della classe (`/dashboard/esercizi/classi/[id]`), per ogni
  studente: pulsante «Misure PDP» con
  - tempo supplementare: 0 / 15 / 20 / 25 / 30 / 50 % o valore libero
    (0–100);
  - meno esercizi (sì/no);
  - calcolatrice (sì/no);
  - formulario (sì/no).
- Si salvano per **studente in quella classe** (non sull'account: uno
  studente può avere misure diverse in classi diverse, es. materie diverse).
- Si registrano solo le misure, **mai** diagnosi o note: sono dati
  delicati. Le vedono e modificano solo i docenti della classe e l'ADMIN.
- Nella verifica, al momento dell'**avvio** le misure vengono copiate sulla
  prova di ogni studente (così modifiche successive alla classe non cambiano
  una verifica in corso). Prima dell'avvio, nella pagina della verifica il
  docente vede l'elenco degli studenti con misure e può modificarle per quella
  verifica.
- Meno esercizi: lo studente riceve, per ogni blocco a caso, `quantiPdp`
  esercizi invece di `quanti`, e salta gli esercizi scelti marcati «non per
  PDP». Lo vede come una verifica normale, numerata 1..N senza buchi.
- Calcolatrice: calcolatrice scientifica semplice integrata nella pagina
  (4 operazioni, parentesi, potenze, radice, percentuale), in un pannello
  sovrapposto: nessuna uscita dallo schermo intero. La vede chi ha la misura
  se la verifica dice «solo PDP», tutti se dice «tutti».
- Formulario: pannello laterale con l'immagine o il PDF caricati nella
  verifica, con la stessa regola della calcolatrice, solo durante la prova
  (il docente lo vede sempre). Servito da una route autenticata, non dalla
  cartella pubblica degli upload.
- Agli altri studenti non compare nulla che riveli le misure.

## Vincoli

- Stack esistente: Next.js 16 app router, Prisma 6 / PostgreSQL 17,
  next-intl (it/en: tutti i testi nuovi in entrambe le lingue), vitest,
  Playwright.
- Migrazioni solo **additive**, scritte a mano e applicate con
  `prisma migrate deploy`. Mai modificare una migrazione applicata; mai
  `migrate reset`, `db push`, né un DB reale come shadow database.
- I compiti esistenti continuano a funzionare identici (un compito senza tipo
  è un compito normale).
- Fetch client verso `/api` sempre con `withBasePath`; `<Link>`,
  `router.push`, `redirect` no.
- Le versioni di un compito si leggono sempre da
  `src/lib/esercizi/versioni-compito.ts`.
- Il lint bloccante in CI copre le cartelle esercizi e studente: il nuovo
  codice ci deve passare.
- Il server deve far rispettare tempi, chiusura e consegna: il client non è
  mai l'unica difesa.

## Lasciato al costruttore

- Nomi di modelli, campi, route e componenti; forma esatta della migrazione
  (es. un campo `tipo` su Compito più una tabella per la prova dello studente
  e una per le misure PDP, o altro equivalente).
- Come fare la «modalità verifica» del player (prop, componente separato che
  riusa le parti) purché il player dei compiti resti invariato.
- Ritmo esatto del salvataggio automatico, purché nessuna risposta resti non
  salvata più di ~2 s in condizioni normali.
- Come tradurre risposta-per-risposta il salvataggio continuo nel `state` del
  motore (oggi si salva su «Invia»).
- Layout delle pagine, nel rispetto dello stile esistente (token `--brand-*`).
- Il formato del PDF del formulario (anteprima incorporata o apertura in
  pannello), purché resti dentro lo schermo intero.

## Scelte mie (da confermare leggendo)

- In PREPARATA il docente può cambiare solo durata, avvio, formulario e
  misure PDP. Per cambiare esercizi o punti si ritira la verifica e se ne
  crea una nuova (come per i compiti: le domande sono estratte e fissate alla
  creazione).
- Una verifica **non** compare nelle pagine dei compiti come compito:
  - studente: sezione «Verifiche» separata nella home, con stato (non
    iniziata / in corso / consegnata / risultati pubblicati);
  - docente: nell'elenco compiti con l'etichetta «Verifica», e la sua pagina è
    quella della verifica (monitoraggio/risultati), non quella del compito;
  - i tentativi di una verifica sono esclusi da statistiche dei compiti,
    andamento della classe e storico di allenamento. Ogni lettura esistente
    di `Tentativo` per compito va filtrata di conseguenza.
- «Meno esercizi» non cambia l'estrazione: lo studente riceve i **primi**
  `quantiPdp` esercizi di ciascun blocco della sua estrazione (in CLASSE le
  stesse domande dei compagni, solo meno; in STUDENTE i primi della sua
  estrazione già fissata). L'estrazione salvata non si modifica mai.
- La riga «prova dello studente» si crea quando lo studente apre la verifica.
  All'avvio si copiano le misure PDP degli iscritti; chi si iscrive durante la
  prova può entrare e riceve le misure della classe al primo ingresso. Il
  monitoraggio mostra «non entrato» per gli iscritti senza riga.

- Il tempo si conta dall'avvio della verifica, non dall'ingresso dello
  studente.
- Punti per esercizio a livello di blocco (tutti gli esercizi di un blocco
  valgono uguale).
- Nessun voto in decimi automatico: punti e percentuale. Il voto lo mette il
  docente nel registro.
- Monitoraggio con polling ogni 5 s invece di socket.
- Misure PDP legate a studente+classe; solo misure, niente diagnosi.
- La verifica in corso non mostra punteggi neanche al docente.
- Dopo la pubblicazione lo studente può riprovare gli esercizi in
  allenamento.
