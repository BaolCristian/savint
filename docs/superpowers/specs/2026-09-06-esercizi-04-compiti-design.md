# Esercizi 04 — Classi, contenitori, batterie e compiti

Sotto-progetto 4 del programma SAVINT Esercizi
(`docs/superpowers/specs/2026-09-02-savint-esercizi-programma-design.md`).
Dipende dal sotto-progetto 1 (ruolo `STUDENT` e gruppi di classe letti al
login) e dal 3 (player, tentativi, ripresa). Non dipende dal 5: l'editor
arriva dopo, e finché non c'è il bacino sono gli otto esercizi già seminati.

## Contesto

Oggi un docente non ha modo di dare lavoro a qualcuno. Il player funziona e
uno studente può risolvere un esercizio, ma solo se qualcuno gli passa il link
a mano. Non esistono classi, non esiste un modo di raggruppare gli esercizi,
non esiste il concetto di compito.

Quello che invece esiste e va riusato:

- `User.classGroups` è già popolato a ogni accesso dal cancello del
  sotto-progetto 1, nella forma `[{ email, name, yearLevel }]`.
- `Esercizio`, `EsercizioVersione` e `Tentativo` esistono dal sotto-progetto 3,
  e `Tentativo.compitoId` è già nullable proprio in attesa di questo lavoro.
- Il player carica un esercizio, lo corregge lato server e riprende un
  tentativo interrotto.

## Scostamento dal programma, dichiarato

Il programma prevedeva **nessun contenitore**: un unico bacino di esercizi
etichettati per argomento, anno, tag e difficoltà, e un compito che ci pesca
dentro applicando filtri. Questa specifica adotta invece **contenitori
espliciti**, creati dal docente e riempiti a mano.

La ragione è che un docente ragiona per raccolte ("le equazioni che uso in
seconda"), non per query. Un filtro dice cosa *potrebbe* entrare; un
contenitore dice cosa *è dentro*, e il docente lo vede. Il costo è una tabella
in più e la manutenzione a carico di chi lo riempie.

Le etichette dell'esercizio (`topic`, `yearLevel`, `difficulty`, `tags`)
restano e servono a trovare gli esercizi da mettere in un contenitore. Non
governano più la pesca.

## Obiettivo

Un docente raggruppa gli esercizi in contenitori, compone una batteria come
"cinque da equazioni e tre da sistemi", la assegna a una classe con una
scadenza, e vede chi ha consegnato e con che punteggio. Uno studente entra e
trova il compito, lo risolve col player che già esiste, e lo riprende se si
interrompe.

## Decisioni prese

1. **Le classi vengono solo dai gruppi Google.** Nessuna creazione a mano,
   nessun codice d'invito. Una `Classe` nasce alla prima volta che un accesso
   la nomina, con l'email del gruppo come chiave unica, e le iscrizioni si
   allineano a ogni accesso: lo studente entra nelle classi nuove ed esce da
   quelle che non ha più. Una scuola senza Workspace non è servita da questo
   sotto-progetto.
2. **L'associazione docente-classe è esplicita.** Il docente dichiara quali
   classi insegna scegliendole fra quelle note. Non si deduce dai gruppi,
   perché non è dato che i docenti stiano nei gruppi `allievi.*`: dipende da
   come è organizzato il Workspace della scuola.
3. **I contenitori sono della scuola.** Qualunque docente li vede, li usa e li
   modifica; resta registrato chi li ha creati. Nessun permesso, nessuna
   condivisione: il dipartimento lavora sullo stesso materiale.
4. **Un esercizio può stare in più contenitori.** Toglierlo da un contenitore
   non lo cancella dal bacino.
5. **Una batteria è un modello riusabile**, non legata a una classe: si compone
   una volta e si assegna a più classi, o allo stesso gruppo l'anno dopo.
6. **La pesca è la stessa per tutta la classe**, fatta una volta al momento
   dell'assegnazione e fissata per sempre negli id delle versioni pescate.
   Il compito non cambia sotto le mani a nessuno, nemmeno se il contenitore
   cambia dopo.
   La ragione per cui non serve pescare per studente: la proprietà anti-copiatura
   ce l'ha già il seme del tentativo, che dà numeri diversi a ogni studente
   sullo stesso esercizio. Pescare esercizi diversi aggiungerebbe poco e
   toglierebbe la possibilità di discutere il compito in classe.
7. **I progressi sono solo l'essenziale**: per ogni compito, l'elenco degli
   studenti con consegnato o no e il punteggio. Nessun grafico, nessuna media
   per argomento, nessun andamento nel tempo.
8. **Un tentativo resta su un esercizio solo.** Un compito da otto esercizi
   sono otto tentativi, uno per esercizio pescato, ognuno col suo seme. Non si
   introduce `TentativoDomanda`.

## Non-obiettivi

Editor degli esercizi (sotto-progetto 5), importatore Numbas, formato SAVINT
completo, pubblicazione sull'hub (6), classi manuali con codice d'invito,
progressi per argomento e andamenti, permessi sui contenitori, pesca per
studente, valutazione con voto, notifiche e promemoria.

## Architettura

```
prisma/schema.prisma          Classe, ClasseStudente, ClasseDocente,
                              Contenitore, ContenitoreEsercizio,
                              Batteria, BatteriaRegola, Compito
                              (+ Tentativo.compitoId diventa una relazione)

src/lib/esercizi/
  classi.ts                   allineamento delle iscrizioni al login,
                              elenco delle classi di un docente
  contenitori.ts              creazione, contenuto, aggiunta e rimozione
  batterie.ts                 composizione e validazione delle regole
  compiti.ts                  assegnazione con pesca fissata, stato di consegna

src/lib/auth/gate-callbacks.ts   (modifica) chiama l'allineamento delle classi

src/app/(dashboard)/dashboard/esercizi/
  contenitori/...             elenco, dettaglio, aggiunta di esercizi
  batterie/...                composizione delle regole
  compiti/...                 assegnazione e stato di consegna
src/app/(student)/studente/    (modifica) i compiti assegnati in evidenza

src/app/api/esercizi/
  contenitori/...             creazione e contenuto
  batterie/...                composizione
  compiti/...                 assegnazione
```

### Modello dati

```prisma
model Classe {
  id               String   @id @default(cuid())
  googleGroupEmail String   @unique
  name             String
  yearLevel        Int?
  archivedAt       DateTime?
  createdAt        DateTime @default(now())
  studenti         ClasseStudente[]
  docenti          ClasseDocente[]
  compiti          Compito[]
}

model ClasseStudente {
  classeId  String
  studentId String
  joinedAt  DateTime @default(now())
  classe    Classe @relation(fields: [classeId], references: [id], onDelete: Cascade)
  studente  User   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  @@id([classeId, studentId])
}

model ClasseDocente {
  classeId  String
  teacherId String
  createdAt DateTime @default(now())
  classe    Classe @relation(fields: [classeId], references: [id], onDelete: Cascade)
  docente   User   @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  @@id([classeId, teacherId])
}

model Contenitore {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   User @relation(fields: [createdById], references: [id])
  esercizi    ContenitoreEsercizio[]
  regole      BatteriaRegola[]
}

model ContenitoreEsercizio {
  contenitoreId String
  esercizioId   String
  addedAt       DateTime @default(now())
  contenitore   Contenitore @relation(fields: [contenitoreId], references: [id], onDelete: Cascade)
  esercizio     Esercizio   @relation(fields: [esercizioId], references: [id], onDelete: Cascade)
  @@id([contenitoreId, esercizioId])
}

model Batteria {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdById String
  createdAt   DateTime @default(now())
  createdBy   User @relation(fields: [createdById], references: [id])
  regole      BatteriaRegola[]
  compiti     Compito[]
}

model BatteriaRegola {
  id            String @id @default(cuid())
  batteriaId    String
  contenitoreId String
  order         Int
  count         Int
  batteria      Batteria    @relation(fields: [batteriaId], references: [id], onDelete: Cascade)
  contenitore   Contenitore @relation(fields: [contenitoreId], references: [id], onDelete: Restrict)
  @@unique([batteriaId, order])
}

model Compito {
  id               String   @id @default(cuid())
  batteriaId       String
  classeId         String
  assignedById     String
  drawSeed         String
  drawnVersionIds  String[]
  opensAt          DateTime?
  dueAt            DateTime?
  createdAt        DateTime @default(now())
  batteria         Batteria @relation(fields: [batteriaId], references: [id], onDelete: Restrict)
  classe           Classe   @relation(fields: [classeId], references: [id], onDelete: Cascade)
  assignedBy       User     @relation(fields: [assignedById], references: [id])
  tentativi        Tentativo[]
  @@index([classeId, dueAt])
}
```

`Tentativo.compitoId`, già presente e nullable, diventa una relazione verso
`Compito`. Resta nullable: un tentativo aperto dal link diretto di un esercizio,
come funziona oggi, non appartiene a nessun compito.

Vanno aggiunti anche i lati inversi delle relazioni, altrimenti Prisma non
valida lo schema. Su `User`: `classi ClasseStudente[]`,
`classiInsegnate ClasseDocente[]`, `contenitoriCreati Contenitore[]`,
`batterieCreate Batteria[]`, `compitiAssegnati Compito[]`. Su `Esercizio`:
`contenitori ContenitoreEsercizio[]`. Sono cinque righe sul modello `User`, che
già ne ha molte: vale la pena raggrupparle sotto un commento che dica che
appartengono agli Esercizi.

`Contenitore` si cancella solo se nessuna regola lo usa (`onDelete: Restrict`
su `BatteriaRegola.contenitore`), e una batteria non si cancella se ha compiti
assegnati. Il lavoro già dato non deve sparire perché qualcuno riordina il
materiale.

### Ciclo di vita

```
accesso studente
  il cancello legge i gruppi allievi.* (sotto-progetto 1)
  -> allineaClassi(studentId, gruppi)
       crea le Classi mancanti, iscrive alle nuove, disiscrive dalle perse

il docente compone
  crea un Contenitore, ci aggiunge esercizi dal bacino
  crea una Batteria: [5 da "Equazioni", 3 da "Sistemi"]

il docente assegna
  assegna(batteriaId, classeId, opensAt?, dueAt?)
    verifica che ogni regola abbia abbastanza esercizi nel suo contenitore
    genera drawSeed, pesca count esercizi per regola, salva le VERSIONI
    -> Compito

lo studente entra
  vede i compiti della sua classe gia' aperti, con la scadenza
  apre un esercizio del compito -> avviaORiprendi con compitoId
  risolve col player esistente

il docente guarda
  per ogni studente della classe: quanti tentativi completati su quanti,
  e la somma dei punteggi
```

### Casi che vanno gestiti

- **Un contenitore ha meno esercizi di quanti la regola ne chiede.** Il docente
  lo scopre al momento dell'assegnazione, non dopo: la chiamata fallisce e dice
  quale regola e quanti esercizi mancano.
- **Il contenitore cambia dopo l'assegnazione.** Il compito non cambia: la
  pesca è fissata sulle versioni.
- **Un esercizio cambia versione dopo l'assegnazione.** Il compito resta sulla
  versione pescata, come già fa un tentativo aperto.
- **Uno studente entra nella classe dopo l'assegnazione.** Vede il compito e
  può farlo: gli esercizi sono quelli pescati, i suoi tentativi partono coi suoi
  semi.
- **Uno studente esce dalla classe.** I suoi tentativi restano; sparisce
  dall'elenco di consegna.
- **Una classe senza studenti.** L'assegnazione riesce ed è visibile al docente
  come compito senza consegne.

## Localizzazione

Nuove chiavi negli spazi `esercizi` e in uno nuovo `classi`, presenti in
entrambi `src/messages/it.json` e `en.json`.

## Test

- Unità sull'allineamento delle classi: prima iscrizione, ingresso in una
  classe nuova, uscita da una persa, gruppo che cambia nome.
- Unità sulla pesca: stessa pesca per due studenti della stessa classe, pesca
  diversa fra due compiti, fallimento dichiarato quando un contenitore non
  basta, e stabilità della pesca quando il contenitore cambia dopo.
- Unità sui contenitori: un esercizio in due contenitori, rimozione che non
  cancella l'esercizio, contenitore non cancellabile se una regola lo usa.
- Rotte: autenticazione, ruolo, e che un docente non possa assegnare a una
  classe che non insegna.
- End-to-end: il docente compone e assegna, lo studente entra e vede il
  compito, lo risolve, il docente lo vede consegnato.

## Rischi

- **La forma dei gruppi Google è un'assunzione sulla scuola.** Il cancello
  legge oggi `allievi.<classe>@dominio` e ne ricava il nome e l'anno. Una
  scuola che nomina i gruppi diversamente ha classi con nomi strani. Il
  sotto-progetto 1 ha già questo rischio; qui si eredita.
- **Chi insegna cosa non lo sa nessuno.** L'associazione docente-classe è
  dichiarata a mano e niente la verifica: un docente può dichiarare una classe
  che non insegna. Accettabile in una scuola, da rivedere se il prodotto uscirà
  da lì.

  **Aggiornamento (feature classi-e-codice-d'iscrizione).** La decisione qui
  sopra resta invariata, ma la superficie a cui si applica è cresciuta da
  quando è stata presa, e va scritta esplicitamente invece di ereditarla in
  silenzio: prima, la pagina del docente mostrava solo il **conteggio**
  degli iscritti di una classe dichiarata; ora mostra i loro **nomi**
  (`iscrittiDellaClasse`), e aggiunge un'azione che un docente può compiere
  su una classe di un altro docente — **rigenerare il codice**
  (`rigeneraCodice`), che chiude l'iscrizione col vecchio codice per
  chiunque non l'abbia ancora usata. Entrambe raggiungibili dichiarando una
  classe che non si insegna davvero, esattamente come già accadeva per
  assegnare un compito. La decisione resta comunque quella giusta: un
  docente che vede i nominativi dei ragazzi della propria scuola è
  ordinario, non un'esposizione di dati sensibili verso l'esterno — e
  un'installazione serve una scuola sola, quindi "un altro docente" è
  sempre un collega dello stesso istituto. Da rivedere insieme al resto di
  questo rischio, se il prodotto smetterà di essere un'installazione per
  scuola.
- **I contenitori sono della scuola e chiunque li modifica.** Due docenti che
  lavorano sullo stesso contenitore possono pestarsi i piedi senza accorgersene.
  È il prezzo di non avere permessi, ed è la scelta giusta per un dipartimento;
  va detto nell'interfaccia, non nascosto.

## Punti aperti

- Cosa succede a un compito scaduto: oggi resta visibile e apribile. Se debba
  chiudersi da solo si decide quando esisteranno compiti veri con scadenze
  vere.
- Il riutilizzo di una batteria sulla stessa classe due volte crea due compiti
  distinti, e va bene. Se serva impedirlo lo dirà l'uso.
