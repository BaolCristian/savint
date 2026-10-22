# Esercizi: "Nuovo compito" — una sola azione per dare un compito — design

Data: 2026-10-22

## Perché

Il docente: "non si capisce il passaggio tra il compito, la raccolta e
l'assegnazione… la logica che c'è dietro". Oggi per dare un compito ci sono
quattro strade con nomi che si confondono:

1. **Raccolte** (`Contenitore`): cartelle di esercizi.
2. **"Prepara un compito"** (`/dashboard/esercizi/batterie`, modello `Batteria`):
   una ricetta "3 da raccolta A, 2 da raccolta B" che non è data a nessuno.
3. **Compiti** (`/dashboard/esercizi/compiti`): un `<details>` "Assegna un
   compito preparato" che prende la ricetta, una classe e le date
   (`assegna`, compiti.ts).
4. **Scorciatoia** in Panoramica, "Assegna esercizi" (`AssegnaForm`,
   `assegnaDiretto`): classe + argomento + quanti, che crea dietro le quinte
   una `Batteria` automatica.

"Compito" vuol dire sia la ricetta sia il compito dato; le due strade non sono
presentate come alternative della stessa azione; non c'è un'anteprima del
compito intero come lo vede lo studente.

## Obiettivi (approvati dal docente sulla bozza visiva)

1. **"Compito" = solo il compito dato a una classe.** La ricetta diventa un
   **modello**, facoltativo.
2. **Una sola pagina "Nuovo compito"** con tre zone numerate e colorate, una
   sotto l'altra (variante A della bozza, consigliata e accettata):
   1. **Per chi** — classe, si apre, scade.
   2. **Cosa** — uno o più **blocchi** da cui pescare:
      - da un **argomento** (con l'anno della classe), "prendi N a caso";
      - da una **raccolta**, "prendi N a caso" (detto dal docente: "10 domande
        random da una raccolta");
      - **esercizi scelti a mano**, tutti.
   3. **Riepilogo** — dice in chiaro cosa succede ("Ogni studente riceverà 7
     esercizi…"), contiene la scelta di estrazione, l'**anteprima come la
     vedono i ragazzi**, "Estrai di nuovo", "Salva anche come modello",
     e il pulsante **Assegna**.
3. **Ci si arriva da ovunque**: Panoramica, pagina Compiti, una raccolta
   ("Assegna questa raccolta"), un gruppo-argomento del catalogo ("Assegna
   questo argomento"), un modello ("Usa questo modello"), un esercizio
   ("Assegna questo esercizio").
4. **Due modi di estrarre** (detto dal docente: "possiamo fare entrambi?"),
   scelti nel riepilogo:
   - **Stesse domande per tutta la classe** (come oggi; default): l'anteprima
     mostra proprio le domande che verranno assegnate; "Estrai di nuovo" le
     cambia; **si assegna esattamente quello che si è visto**.
   - **Domande diverse per ogni studente**: ogni studente ha la sua
     estrazione; l'anteprima prima di assegnare è **un esempio**; sul compito
     assegnato il docente può vedere l'anteprima di **uno studente preciso**.
5. **Anteprima del compito come la vedono i ragazzi**: gli esercizi uno dopo
   l'altro nel player dello studente, senza salvare nulla. Disponibile prima di
   assegnare e anche dopo, nella pagina del compito assegnato.
6. **Raccolte = solo cartelle** per tenere in ordine gli esercizi (nessun
   cambiamento al loro funzionamento, solo alla loro presentazione).
7. **Modelli**: un compito salvato (i blocchi, non la classe né le date) per
   ridarlo a un'altra classe. Il vecchio "compito preparato" diventa un modello.

## Non-obiettivi

- La modalità **Verifica** online (tempo, punteggi, niente feedback) — richiesta
  successiva, a parte.
- Assegnare lo stesso compito a più classi in un colpo (si usa il modello).
- Cambiare come lo studente svolge un esercizio, il player, la correzione.
- Cambiare i permessi su esercizi/raccolte (vale tutto il modello di accesso
  di `accesso.ts`: si pesca solo tra gli esercizi visibili a chi assegna,
  sempre "come docente", `comeDocente`).

## Anti-obiettivi

- Un compito già assegnato (oggi o prima di questo lavoro) che cambia esercizi
  o smette di funzionare: tutti i `Compito` esistenti restano "stesse domande
  per tutta la classe" con il loro `drawnVersionIds`.
- Si assegna qualcosa di diverso da quello che il docente ha visto in
  anteprima (modo "stesse domande") **senza dirglielo**.
- Uno studente che vede gli esercizi della sua estrazione cambiare tra una
  visita e l'altra (modo "diverse per studente").
- Il docente che non capisce perché un compito ha meno esercizi di quanti ne
  ha chiesti.

## Comportamento

### Blocchi ed estrazione

- Un blocco "argomento" pesca tra gli esercizi visibili di quell'argomento
  (stessa regola di oggi: `topic` esatto, anno della classe) e opzionalmente
  `difficoltaMax` (come oggi nella scorciatoia).
- Un blocco "raccolta" pesca tra gli esercizi visibili di quella raccolta.
- Un blocco "scelti a mano" contiene esercizi precisi, tutti assegnati
  (`count` = quanti ne sono stati scelti).
- I blocchi si pescano **in ordine**; un esercizio già preso da un blocco
  precedente non viene ripreso (come oggi in `assegna`: vincono i blocchi
  precedenti). L'ordine degli esercizi nel compito è quello dei blocchi.
- **Gli esercizi scelti a mano vincono sempre**: prima di pescare, sono tolti
  dai bacini dei blocchi a caso, così un blocco "scelti" non diventa mai
  insufficiente per colpa del seme; restano **nell'ordine in cui il docente li
  ha scelti**.
- Se un blocco non ha abbastanza esercizi, il **riepilogo lo dice per quel
  blocco** ("Equazioni: ne chiedi 5, ce ne sono 3") e "Assegna" è disabilitato
  finché non si corregge (stesso motivo `esercizi_insufficienti` di oggi).

### Modo "stesse domande" — si assegna ciò che si è visto

- L'anteprima chiede al server un'estrazione con un seme (`drawSeed`); il
  server restituisce gli esercizi estratti (id esercizio, id versione, titolo,
  contenuto).
- "Estrai di nuovo" = nuovo seme.
- "Assegna" manda i blocchi, il seme e la lista degli id versione visti. Il
  server **rifà l'estrazione con quel seme**: se coincide, crea il compito con
  quelle versioni; se nel frattempo il bacino è cambiato e l'estrazione non
  coincide, risponde `estrazione_cambiata` e la pagina mostra la nuova
  estrazione in anteprima con un avviso ("Gli esercizi disponibili sono
  cambiati: controlla l'anteprima e premi di nuovo Assegna").
- Se il docente preme "Assegna" senza aver mai aperto l'anteprima, vale lo
  stesso: l'estrazione è già calcolata dal riepilogo (vedi sotto) e si
  assegna quella.

### Modo "diverse per studente"

- Il compito memorizza i blocchi (tramite il suo modello/batteria) e un seme;
  ogni studente ha la propria estrazione, **calcolata la prima volta che
  serve** (prima apertura dello studente, oppure il docente che apre
  l'anteprima di quello studente, la stampa o le consegne) con seme derivato
  `${drawSeed}:${studentId}` e il bacino visibile a chi ha assegnato, e
  **memorizzata** da quel momento (non cambia più).
- Al momento di assegnare, il server calcola subito e memorizza l'estrazione
  di tutti gli studenti già iscritti (così gli esercizi sono fissati da
  subito); per chi si iscrive dopo si calcola alla prima necessità.
- Le estrazioni per studente pescano da un bacino congelato al momento di
  assegnare (vedi Decisioni, punto 4).

### Il riepilogo (zona 3)

- Si aggiorna mentre il docente cambia blocchi o modo: mostra il totale per
  studente, eventuali blocchi insufficienti, ed esercizi tolti perché
  duplicati tra blocchi ("1 esercizio era già in un blocco precedente").
- Frase fissa per il modo:
  - stesse: "Gli esercizi sono gli stessi per tutta la classe, estratti
    adesso; i numeri cambiano da studente a studente."
  - diverse: "Ogni studente riceve la sua estrazione; i numeri cambiano da
    studente a studente."
- Pulsanti: "Anteprima come la vedono i ragazzi", "Estrai di nuovo",
  casella "Salva anche come modello" (con campo nome, precompilato), "Assegna
  a {classe}".

### Anteprima del compito

- Una vista "anteprima compito": gli esercizi in sequenza ("Esercizio 2 di 7")
  con il player dello studente in modalità locale (`soloLocale`, nessun dato
  salvato), avanti/indietro tra gli esercizi. Per i numeri usa un seme
  qualunque: lo studente avrà i suoi (i semi per studente sono per tentativo,
  come oggi).
- Prima di assegnare: dalla pagina Nuovo compito, sugli esercizi
  dell'estrazione corrente (modo stesse) o di un'estrazione d'esempio (modo
  diverse, con la scritta "Esempio: ogni studente avrà la sua estrazione").
- Dopo: dalla pagina del compito assegnato; nel modo diverse con un menu
  "Anteprima di: [studente]".

### Modelli

- "Salva anche come modello" salva i blocchi con un nome (una `Batteria` non
  automatica). I compiti assegnati senza salvare restano su una `Batteria`
  automatica (come la scorciatoia di oggi), invisibile nell'elenco modelli.
- Pagina **Modelli**: elenco (nome, blocchi in breve, quante volte usato),
  "Usa questo modello" (apre Nuovo compito con i blocchi precompilati),
  "Elimina" (rifiutato se usato da compiti, come oggi `in_uso`).
- I "compiti preparati" esistenti compaiono come modelli.

### Pagine e navigazione

- Nuova pagina **Nuovo compito**; parametri d'ingresso per precompilare:
  classe, raccolta, argomento, modello, esercizio.
- **Panoramica**: la carta "Assegna esercizi" (form) è sostituita da un grande
  pulsante "Nuovo compito" con una riga che spiega le tre zone; restano i
  compiti recenti e i link.
- **Compiti**: in alto "Nuovo compito"; sparisce il `<details>` "Assegna un
  compito preparato".
- **Raccolte**: il link "Prepara un compito" diventa "Assegna questa raccolta"
  (sulla pagina della raccolta) e la pagina elenco spiega "Le raccolte sono
  cartelle per tenere in ordine gli esercizi".
- **Catalogo**: "Assegna questo argomento" nell'intestazione del gruppo e
  "Assegna" su ogni esercizio visibile.
- **Compito assegnato**: aggiunge "Anteprima come la vedono i ragazzi" e
  mostra il modo di estrazione; nel modo diverse, le consegne mostrano per
  ciascuno quanti esercizi ha.
- La scheda "Raccolte" della barra resta; si aggiunge "Modelli". La vecchia
  pagina "Prepara un compito" diventa la pagina Modelli (il vecchio indirizzo
  porta lì).
- Le vecchie strade (`AssegnaForm`, `CompitoForm`, rotta `compiti/diretto`,
  creazione di batterie da sola) spariscono dall'interfaccia; le rotte API non
  più usate si tolgono insieme ai loro test.

### Stampa, statistiche, consegne, studente

- Tutto ciò che oggi legge `Compito.drawnVersionIds` passa da **un'unica
  funzione** "le versioni di questo compito per questo studente" (per il modo
  stesse è `drawnVersionIds`, per il modo diverse l'estrazione memorizzata
  dello studente). Punti noti: `compitoApribile`, `compitiDelloStudente`,
  `consegneDelCompito`, `percorsoCompitoStudente`, `esercizioApribileDaStudente`
  (pratica.ts), la home studente, `statistiche.ts`, `stampa.ts`.
- **Stampa**, modo diverse: "versioni A, B…" non disponibili (si spiega
  perché); "una per studente" stampa per ciascuno le sue domande.
- **Statistiche**, modo diverse: una riga per ogni esercizio estratto ad
  almeno uno studente, con "assegnato a N studenti".
- **Consegne**: `totali` per studente = esercizi della sua estrazione.

## Vincoli

- Mai modificare una migrazione già applicata; dopo una modifica allo schema
  `prisma generate` prima della suite, in un comando separato; `prisma migrate
  dev` si blocca su un prompt per la deriva nota di `PracticeRun.expiresAt`:
  usare `--create-only` + `migrate deploy`. Applicare anche al DB di prova
  `savint_video`.
- Mai due suite di test insieme sul DB di sviluppo.
- Testi in `src/messages/it.json` e `en.json`; commenti nel codice in
  italiano nello stile dei file vicini.
- Il modello di accesso resta quello di `accesso.ts`; estrazioni e conteggi
  sempre "come docente".

## Decisioni prese da chi ha scritto il documento (il docente ha chiesto di non essere interpellato)

1. **Modelli condivisi nella scuola.** Come oggi le batterie, i modelli sono
   visibili e utilizzabili da tutti i docenti; l'elenco mostra "di {autore}" e
   un filtro Miei/Tutti. **Eliminare** un modello: solo chi l'ha creato (o un
   ADMIN); per gli altri il pulsante non c'è e la rotta risponde 404.
2. **Ogni compito ha la sua copia dei blocchi.** Assegnare crea sempre una
   `Batteria` automatica propria del compito (come fa oggi la scorciatoia);
   il modello è un oggetto separato. "Salva anche come modello" crea un
   **nuovo** modello (copia dei blocchi), non ne sovrascrive uno esistente; i
   modelli **non si modificano** (si usa un modello, si cambia, si salva come
   nuovo). Il compito ricorda da quale modello viene (riferimento facoltativo,
   azzerato se il modello è eliminato) per contare "usato N volte".
   Eliminare un modello è sempre possibile, i compiti restano intatti. Per i
   vecchi "compiti preparati" a cui puntano direttamente dei compiti, eliminare
   il modello lo **nasconde** dall'elenco (diventa automatico) invece di
   cancellarlo.
3. **Esercizi scelti a mano non più disponibili** (resi privati, senza
   versione): il blocco conta come insufficiente ("ne hai scelti 3, ne sono
   disponibili 2: {titolo} non è più disponibile"), "Assegna" disabilitato
   finché il docente non toglie quell'esercizio. Si assegna l'ultima versione.
4. **Modo "diverse per studente": bacino congelato.** Al momento di assegnare,
   per ogni blocco si fissa l'elenco delle **versioni** candidate (visibili a
   chi assegna, ultima versione di ciascun esercizio) e lo si memorizza sul
   compito. Le estrazioni per studente — subito per gli iscritti, alla prima
   necessità per chi arriva dopo — pescano **solo da quel bacino congelato**
   con seme `${drawSeed}:${studentId}`: niente dipende più da chi ha assegnato
   né dalle modifiche successive agli esercizi, e il caso "studente con meno
   esercizi" non può più capitare (il riepilogo ha già verificato i numeri).
5. **Video tutorial**: rientrano nel lavoro. Gli script in
   `scripts/video-tutorial` che usano le strade tolte (01, 04, 05, 06, 08 e
   gli altri che le toccano) vanno aggiornati al nuovo flusso e i video
   rigirati sul DB di prova `savint_video` (porta 3100), con un nuovo video
   "Nuovo compito" che mostri le tre zone, l'anteprima e i due modi di
   estrazione.

## Lasciato a chi costruisce

- Lo schema esatto: il modo di estrazione sul `Compito`, la tabella delle
  estrazioni per studente, la forma "scelti a mano" su `BatteriaRegola`.
- Nomi di rotte e componenti; come la pagina chiede l'estrazione al server
  (una rotta "estrai" senza scrittura).
- Layout fine delle tre zone (seguire la bozza:
  `.superpowers/brainstorm/*/content/assegna-compito-v2.html`).
