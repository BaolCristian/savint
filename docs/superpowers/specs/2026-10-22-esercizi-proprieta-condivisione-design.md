# Esercizi: proprietà, condivisione tra colleghi e commenti — design

Data: 2026-10-22

## Perché

Oggi, su un'installazione (una scuola), ogni docente vede e modifica ogni
esercizio e ogni raccolta: `elencoRedazione()` non filtra, `salvaNuovaVersione`
non riceve l'utente, la pagina del catalogo lo dichiara ("Qualunque docente
può modificare qualunque esercizio"). `Esercizio.authorId` esiste ma è solo
un'annotazione.

Il docente (di matematica) vuole lavorare come su Google Drive:

> "creo tutta la serie di esercizi di matematica che vedo solo io. Ad un certo
> punto voglio condividerli con i miei colleghi, e posso dire: li possono
> modificare o solo vedere e in caso duplicare."

Tutto resta **dentro la scuola** (stessa installazione, stesso DB). Niente
passa dal repository nazionale savint.it (hub).

## Obiettivi

1. **Proprietà.** Ogni esercizio e ogni raccolta (`Contenitore`) ha un
   proprietario: chi l'ha creato (anche via import, IA, duplicazione).
2. **Privato per default.** Un esercizio o una raccolta nuovi li vede solo il
   proprietario.
3. **Condivisione con colleghi scelti** (detto dal docente), uno per uno,
   scelti da un elenco dei docenti della scuola (non email a mano), ciascuno
   con un **ruolo**:
   - **Visualizzatore**: vede l'anteprima, lo usa nei compiti (assegna, stampa),
     lo **duplica** (la copia è sua e privata).
   - **Commentatore**: come visualizzatore, più scrive commenti.
   - **Editor**: come commentatore, più modifica (salva nuove versioni).
4. **Condivisione con tutta la scuola** (detto dal docente: "esercizi pubblici
   per tutti" = tutti i docenti della scuola), anch'essa con un ruolo.
5. **Tre cose si condividono** (detto dal docente: "vanno bene tutte"):
   - un **esercizio**;
   - una **raccolta**;
   - un **argomento** ("i miei esercizi di Equazioni").
6. **Condivisioni vive** (detto dal docente): chi ha accesso a una raccolta
   vede anche gli esercizi aggiunti dopo; "così come Rossi mette un esercizio
   in quel contenitore anche io lo vedo". Lo stesso per l'argomento: gli
   esercizi che il proprietario scrive dopo su quell'argomento sono subito
   condivisi.
7. **Commenti** (detto dal docente): una sezione Commenti accanto
   all'esercizio, per segnalazioni come "mi sembra ci sia un errore" o "non è
   troppo chiaro".

## Non-obiettivi

- Niente condivisione con altre scuole né passaggio dal hub savint.it.
- Niente email o notifiche push per condivisioni e commenti.
- Niente cambiamenti a classi, compiti già assegnati, tentativi degli studenti.
- Niente cancellazione di esercizi (oggi non esiste e non la si introduce).
- Le **batterie** non cambiano modello di visibilità (vedi "Batterie" sotto).
- Non si sistema qui la condivisione dei quiz (difetto noto: VIEW/DUPLICATE/
  EDIT di `QuizShare` sono quasi ignorati) — lavoro separato.

## Anti-obiettivi

- **Il giorno dell'aggiornamento nessuno perde niente**: ogni esercizio e
  raccolta esistente resta visibile e modificabile da tutti come oggi.
- Un compito già assegnato che si rompe o sparisce perché un esercizio è
  diventato privato.
- Un esercizio privato che compare a un collega per una strada laterale
  (assegnazione per argomento, conteggi, controllo doppioni all'import,
  pratica libera degli studenti, URL diretto all'anteprima o all'editor).
- Un collega che ottiene su un esercizio **più** di quanto il proprietario gli
  abbia dato, ripassandolo attraverso una propria raccolta (vedi "Regola delle
  raccolte").

## Il modello di accesso

### Chi ha quale ruolo su un esercizio

Il ruolo effettivo di un docente D su un esercizio E è il **più ampio** tra
(scelta mia, "vale il permesso più ampio"):

1. **Proprietario** se D è il proprietario di E (tutti i poteri, vedi sotto).
2. Una condivisione **diretta** di E con D, o di E con tutta la scuola.
3. Una condivisione **per argomento** del proprietario di E, con D o con tutta
   la scuola, il cui argomento coincide con quello di E.
   Coincidenza come nei gruppi del catalogo: senza differenza di maiuscole e
   spazi ai lati (scelta mia). L'argomento vale per tutti gli anni (scelta mia).
4. Una **raccolta** R che contiene E e su cui D ha un ruolo (proprietario di R
   = editor), **secondo la regola delle raccolte**.

Nessuna di queste → D non vede E: non compare nel catalogo, nei conteggi, nelle
scelte di assegnazione, e gli URL di anteprima/editor rispondono "non trovato"
(non "vietato", per non rivelarne l'esistenza — scelta mia).

### Regola delle raccolte (scelta mia, per l'anti-obiettivo sull'escalation)

Una raccolta condivide con i suoi membri **solo gli esercizi che il loro
autore ci ha messo personalmente, quando l'autore è il proprietario della
raccolta o uno dei suoi editor nominati uno per uno**. Chi aggiunge un
esercizio altrui a una raccolta lo rende visibile solo a chi lo vede già per
un'altra strada (per questo ogni legame raccolta–esercizio ricorda chi l'ha
aggiunto). Un ruolo dato a
"tutta la scuola" fa *ricevere* gli esercizi della raccolta, ma non fa
*contribuire*: altrimenti ogni raccolta esistente (migrata a "tutta la scuola:
editor") renderebbe modificabile da tutti qualunque esercizio ci venga messo.
Così:

- Rossi, editor della mia raccolta, ci mette un suo esercizio → io (e tutti i
  membri) lo vediamo con il ruolo che abbiamo sulla raccolta. È il caso detto
  dal docente.
- Bianchi mi ha condiviso un esercizio come visualizzatore; io lo metto nella
  mia raccolta condivisa con Rossi come editor → Rossi **non** ottiene niente
  da quella raccolta su quell'esercizio di Bianchi (né vederlo né modificarlo).
  Lo vede solo se ha accesso per un'altra strada. Nella raccolta, per Rossi,
  quell'esercizio non compare.
- Se un editor perde il ruolo, i suoi esercizi smettono di essere condivisi
  attraverso la raccolta.

Quando si aggiunge a una raccolta condivisa un esercizio proprio e privato,
la UI avvisa che diventerà visibile ai membri della raccolta (detto in chat e
accettato dal docente).

### Cosa può fare ciascun ruolo

| | Visualizzatore | Commentatore | Editor | Proprietario |
|---|---|---|---|---|
| Vedere, anteprima, usare nei compiti e nella stampa | sì | sì | sì | sì |
| Duplicare (la copia è privata e sua) | sì | sì | sì | sì |
| Leggere i commenti | sì | sì | sì | sì |
| Scrivere commenti e risposte | — | sì | sì | sì |
| Segnare un commento come risolto | — | — | sì | sì |
| Modificare l'esercizio (nuova versione) | — | — | sì | sì |
| Raccolta: aggiungere/togliere esercizi | — | — | sì | sì |
| Condividere, cambiare o togliere condivisioni | — | — | — | sì |
| Eliminare la raccolta | — | — | — | sì |

Scelte mie dentro la tabella: i visualizzatori leggono i commenti (così
vedono "c'è un errore" prima di assegnare); chi scrive un commento può
cancellare il proprio, il proprietario può cancellare qualunque commento
sui suoi esercizi; solo il proprietario ricondivide (come i viewer di Drive
che non possono ricondividere).

Un editor di una raccolta che toglie dalla raccolta un esercizio non suo:
consentito (togliere da una raccolta non tocca l'esercizio).

### L'amministratore (deciso dal docente: "conosco i miei polli")

Un utente ADMIN **vede e gestisce tutto**: su ogni esercizio e ogni raccolta
ha gli stessi poteri del proprietario (vedere, modificare, condividere,
togliere condivisioni, eliminare raccolte), anche su quelli privati. Serve,
tra l'altro, quando un docente lascia la scuola. Scelta mia, coerente con
questo: l'ADMIN può anche **trasferire la proprietà** di un esercizio o di una
raccolta a un altro docente, e può gestire la condivisione degli esercizi
senza proprietario. Nel catalogo l'ADMIN vede tutto, con il filtro "Di chi"
che aggiunge "Di altri" (scelta mia).

### Esercizi senza proprietario

Gli esercizi caricati di partenza (`seed`, `authorId` nullo) non hanno
proprietario. Restano "tutta la scuola: editor" e solo l'ADMIN può cambiarne la
condivisione o assegnar loro un proprietario (scelta mia). Chiunque può duplicarli per averne una copia
propria.

## Il passaggio (migrazione)

- Esercizio esistente: proprietario = `authorId` (se l'utente esiste,
  altrimenti nessuno) + condivisione "tutta la scuola: editor".
- Raccolta esistente: proprietario = `createdById` + "tutta la scuola: editor".
- Da quel momento, ogni esercizio/raccolta **nuovo** nasce privato:
  creazione nell'editor, import JSON, duplicazione, generazione IA.
- Ricordare la regola del progetto: mai modificare una migrazione già
  applicata; la migrazione dei dati è una migrazione nuova.

## Dove cambia l'applicazione (inventario per chi costruisce)

Ogni lettura o scrittura di esercizi/raccolte lato docente deve passare dalla
regola di accesso. I punti oggi noti:

- `src/lib/esercizi/redazione.ts`: `elencoRedazione` (filtrare e dare il ruolo
  per riga), `caricaPerEditor`/`salvaNuovaVersione` (editor o proprietario),
  `caricaPerAnteprima` (almeno visualizzatore), `duplicaEsercizio` (almeno
  visualizzatore; la copia nasce privata), `creaEsercizio` (privato).
- `src/lib/esercizi/contenitori.ts`: elenco, contenuto, aggiungi/togli,
  elimina; `contenitori/[id]/page.tsx` (l'elenco degli esercizi "disponibili"
  da aggiungere = quelli visibili al docente).
- `src/lib/esercizi/batterie.ts`: `bacinoRegola` (per argomento e per raccolta:
  solo esercizi visibili al docente **che assegna**), `argomentiDisponibili`;
  `compiti.ts` `quantiCorrispondono`; la rotta `api/esercizi/argomenti`.
- `src/lib/esercizi/importa/importa.ts`: il controllo doppioni confronta solo
  con esercizi visibili all'importatore (scelta mia: altrimenti "già presente"
  rivela un esercizio privato altrui e impedisce di importarlo).
- Pannello "Assegna" della panoramica (`dashboard/esercizi/page.tsx`,
  `candidati`).
- Tutte le rotte `api/esercizi/redazione/**` e `api/esercizi/contenitori/**`.
- **Pratica libera degli studenti** (`app/(student)/studente/page.tsx` elenca
  oggi *tutti* gli esercizi; la stessa rotta `/studente/esercizio/[id]` serve
  anche "esercitati di nuovo"). Scelte mie:
  - l'elenco mostra solo gli esercizi che "tutta la scuola" vede per una
    strada qualunque (condivisione diretta, argomento o raccolta con la regola
    delle raccolte): un esercizio privato o condiviso con pochi è lavoro in
    corso, non va agli studenti;
  - in più lo studente può sempre riaprire un esercizio che ha avuto in un
    compito (anche se nel frattempo è diventato privato), così "esercitati di
    nuovo" non si rompe.

**Compiti, consegne, statistiche, stampa** non cambiano: lavorano sulle
versioni già estratte (`drawnVersionIds`) e sul titolo del docente sul compito
(`haTitoloSulCompito`), non sul catalogo. Un compito assegnato resta intatto
anche se dopo l'esercizio torna privato.

### Batterie

Le batterie oggi sono comuni a tutti e non cambiano. Ciò che conta è che
l'estrazione al momento dell'assegnazione usi solo esercizi visibili a chi
assegna (vedi `bacinoRegola`). Una regola di batteria su una raccolta a cui
il docente non ha accesso estrae zero esercizi da quella regola, con lo stesso
messaggio di oggi per un bacino insufficiente.

## Interfaccia

### Condividi (scelta mia: come Google Drive)

Un'unica finestra "Condividi", aperta da:
- la riga di un esercizio nel catalogo e la pagina dell'esercizio;
- la pagina di una raccolta;
- l'intestazione di un gruppo-argomento nel catalogo ("Condividi argomento":
  riguarda solo gli esercizi **propri** di quell'argomento).

Contenuto della finestra:
- "Aggiungi colleghi": elenco a ricerca dei docenti della scuola
  (utenti TEACHER/ADMIN, escluso sé stessi) + scelta del ruolo.
- Elenco delle persone con accesso, ciascuna con il suo ruolo modificabile e
  "Rimuovi".
- "Accesso generale": **Solo le persone aggiunte** / **Tutta la scuola** con
  ruolo.
- Per un esercizio, una riga informativa sugli accessi che arrivano da
  raccolte o argomento ("Rossi lo vede anche tramite la raccolta Equazioni"),
  così il proprietario capisce perché togliere la condivisione diretta non
  basta (scelta mia).

Solo il proprietario vede il pulsante Condividi.

### Catalogo

Mantiene il raggruppamento per argomento appena fatto. In più (scelte mie):
- su ogni riga un'etichetta: "Tuo" (con "Privato" / "Condiviso" / "Tutta la
  scuola") oppure il ruolo che hai ("Editor", "Commentatore",
  "Visualizzatore") e il nome del proprietario;
- un filtro "Di chi": Tutti / Miei / Condivisi con me;
- "Apri" (editor) solo con ruolo editor o proprietario; per gli altri
  "Anteprima" e "Duplica";
- la scritta "Qualunque docente può modificare qualunque esercizio" sparisce;
- sui propri esercizi, un contatore dei **commenti aperti**.

### Commenti

- Sezione "Commenti" accanto all'esercizio nella pagina di anteprima e
  nell'editor.
- Commento: autore, data, testo semplice (scelta mia: niente formule,
  niente allegati); risposte a un livello sotto il commento.
- "Risolto": nasconde il commento in un gruppo "Risolti" richiudibile.
- Il commento riguarda l'esercizio, non una versione (scelta mia).

## Lasciato a chi costruisce

- Lo schema dati esatto (una tabella di condivisioni con tipo di risorsa e
  destinatario nullo = tutta la scuola, oppure tabelle separate), gli indici e
  il modo di calcolare in poche query l'insieme degli esercizi visibili con
  il ruolo.
- Nomi di rotte e componenti, testi it/en (seguire i namespace esistenti).
- Limiti di lunghezza e rate limit dei commenti, sul modello delle altre
  rotte di scrittura dell'area.
