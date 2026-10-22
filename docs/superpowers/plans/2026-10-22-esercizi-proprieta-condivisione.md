# Esercizi: proprietà, condivisione e commenti — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Esercizi e raccolte con proprietario, privati per default, condivisibili (esercizio / raccolta / argomento) con colleghi scelti o con tutta la scuola con ruolo editor/commentatore/visualizzatore, commenti sugli esercizi, ADMIN che vede e gestisce tutto.

**Architecture:** Un solo modulo di dominio (`src/lib/esercizi/accesso.ts`) calcola in memoria, con poche query, il ruolo di un utente su ogni esercizio e raccolta; tutte le letture/scritture docente e la pratica libera dello studente passano da lì. Le condivisioni stanno in tabelle Prisma nuove; "tutta la scuola" è una colonna `accessoScuola` su Esercizio/Contenitore e una riga con destinatario nullo per l'argomento. UI: una finestra "Condividi" unica, etichette e filtro nel catalogo, sezione Commenti.

**Tech Stack:** Next.js 16 app router, Prisma + PostgreSQL, next-intl (it/en), vitest + Testing Library (test di dominio sul DB di sviluppo con prefissi, come `src/lib/esercizi/__tests__/contenitori.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-22-esercizi-proprieta-condivisione-design.md`

## Global Constraints

- Tutto dentro la stessa installazione: nessuna chiamata al hub savint.it.
- Mai modificare una migrazione già applicata: solo migrazioni nuove (`npx prisma migrate dev --name ...`). Dopo una modifica allo schema: `npx prisma generate` PRIMA della suite, in un comando separato.
- Mai due suite insieme sul DB di sviluppo.
- Esercizi e raccolte esistenti al momento della migrazione: `accessoScuola = EDITOR` (nessuno perde niente). Ogni esercizio/raccolta creato dopo: `accessoScuola = null` (privato). Il seed (`seed.ts`) crea con `EDITOR`.
- Ruolo effettivo = il più ampio tra tutte le strade. ADMIN = PROPRIETARIO su tutto.
- Regola delle raccolte: una raccolta trasmette ai suoi membri solo gli esercizi del suo proprietario e dei suoi editor **nominati** (non "tutta la scuola: editor").
- Un esercizio/raccolta non visibile risponde "non trovato" (404), mai 403.
- Testi UI in `src/messages/it.json` e `en.json`; commenti nel codice in italiano, nello stile dei file vicini.
- Commit solo se l'utente lo chiede; lavorare su un branch `feat/esercizi-condivisione`.

## Review Focus

1. Assegnazione per argomento fatta da Rossi quando l'argomento contiene esercizi privati di Bianchi → la pesca e il conteggio "quanti corrispondono" li escludono (test in Task 4).
2. Esercizio dato a Rossi solo come visualizzatore, che Rossi mette in una sua raccolta condivisa con Verdi come editor → Verdi non lo vede né lo modifica (test in Task 2).
3. Utente nominato con un ruolo più basso di "tutta la scuola" (es. Rossi visualizzatore, scuola editor) → vale editor (test in Task 2).
4. Import JSON di un esercizio identico a uno privato di un collega → viene importato, non "già presente" (test in Task 3).
5. Studente che riapre da "esercitati di nuovo" un esercizio del suo compito diventato privato → si apre; lo stesso id senza aver avuto il compito → 404 (test in Task 5).

---

### Task 1: Schema, migrazione e seed

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_esercizi_condivisione/migration.sql` (generata, poi ritoccata)
- Modify: `src/lib/esercizi/seed.ts` (create/upsert con `accessoScuola: "EDITOR"`)
- Test: `src/lib/esercizi/__tests__/schema-condivisione.test.ts`

**Interfaces:**
- Produces (Prisma):
  - `enum RuoloEsercizi { VISUALIZZATORE COMMENTATORE EDITOR }`
  - `Esercizio.accessoScuola RuoloEsercizi?`; `Esercizio.author User? @relation(fields:[authorId], onDelete: SetNull)` (relazione nuova sul campo esistente)
  - `Contenitore.accessoScuola RuoloEsercizi?` (proprietario = `createdById`, invariato)
  - `CondivisioneEsercizio { esercizioId, userId, ruolo RuoloEsercizi, createdAt; @@id([esercizioId, userId]) }` (cascade su entrambi)
  - `CondivisioneContenitore { contenitoreId, userId, ruolo, createdAt; @@id([contenitoreId, userId]) }` (cascade)
  - `CondivisioneArgomento { id cuid, ownerId, chiave String, argomento String, userId String?, ruolo, createdAt; @@index([ownerId, chiave]) }` — `chiave` = argomento normalizzato (trim + minuscolo); `userId` null = tutta la scuola; cascade su owner e user.
  - `CommentoEsercizio { id cuid, esercizioId, autoreId, parentId String?, testo String, risoltoAt DateTime?, risoltoDaId String?, createdAt; @@index([esercizioId]) }` — cascade su esercizio, autore e parent.

- [ ] **Step 1: Test** `schema-condivisione.test.ts`: crea un utente e un esercizio senza `accessoScuola` → il campo è `null`; crea `CondivisioneEsercizio` e verifica che cancellando l'utente la riga sparisca; crea un `CommentoEsercizio` con risposta (`parentId`) e verifica che cancellando l'esercizio spariscano entrambi.
- [ ] **Step 2:** Run `npx vitest run src/lib/esercizi/__tests__/schema-condivisione.test.ts` → FAIL (modelli inesistenti).
- [ ] **Step 3:** Modifica lo schema; `npx prisma migrate dev --create-only --name esercizi_condivisione`; nella migration.sql, PRIMA di aggiungere la FK di `authorId`, aggiungi `UPDATE "Esercizio" SET "authorId" = NULL WHERE "authorId" IS NOT NULL AND "authorId" NOT IN (SELECT id FROM "User");` e DOPO le colonne `UPDATE "Esercizio" SET "accessoScuola" = 'EDITOR'; UPDATE "Contenitore" SET "accessoScuola" = 'EDITOR';`. Poi `npx prisma migrate dev`, poi (comando separato) `npx prisma generate`. In `seed.ts` imposta `accessoScuola: "EDITOR"` in create.
- [ ] **Step 4:** Run il test → PASS; `npx vitest run src/lib/esercizi/__tests__/seed.test.ts` → PASS.
- [ ] **Step 5:** Commit (se richiesto) `feat(esercizi): schema per proprietà, condivisione e commenti`.

### Task 2: Il calcolo dell'accesso

**Files:**
- Create: `src/lib/esercizi/accesso.ts`
- Test: `src/lib/esercizi/__tests__/accesso.test.ts`

**Interfaces:**
- Consumes: modelli del Task 1.
- Produces:
  - `type Ruolo = "PROPRIETARIO" | "EDITOR" | "COMMENTATORE" | "VISUALIZZATORE"`
  - `type Utente = { id: string; admin: boolean }`
  - `type Azione = "vedere" | "commentare" | "risolvere" | "modificare" | "condividere"`
  - `function puo(ruolo: Ruolo | null | undefined, azione: Azione): boolean` — vedere: tutti; commentare: COMMENTATORE+; risolvere e modificare: EDITOR+; condividere: PROPRIETARIO.
  - `function chiaveArgomento(argomento: string): string` (trim + `toLocaleLowerCase("it")`)
  - `function utenteDaSessione(session: Session): Utente` (`admin = session.user.role === "ADMIN"`)
  - `async function utenteDaId(id: string): Promise<Utente>` (legge il ruolo dal DB)
  - `async function ruoliEsercizi(chi: Utente | "scuola"): Promise<Map<string, Ruolo>>` — solo gli esercizi visibili; `"scuola"` = ciò che vede un docente qualunque senza condivisioni nominate (per la pratica libera).
  - `async function ruoloEsercizio(chi: Utente, esercizioId: string): Promise<Ruolo | null>`
  - `async function ruoliContenitori(chi: Utente): Promise<Map<string, Ruolo>>`
  - `async function ruoloContenitore(chi: Utente, contenitoreId: string): Promise<Ruolo | null>`

Algoritmo di `ruoliEsercizi` (in memoria, query fisse, non una per esercizio): carica tutti gli esercizi (`id, authorId, topic, accessoScuola`); le `CondivisioneEsercizio` dell'utente; le `CondivisioneArgomento` con `userId = utente o null`; i contenitori su cui l'utente ha un ruolo (proprietario → EDITOR-equivalente per la raccolta, condivisione nominata, `accessoScuola`) con i loro *contributori* (proprietario + nominati EDITOR) e le righe `ContenitoreEsercizio`. Per ogni esercizio prendi il massimo tra: proprietario; diretta; `accessoScuola`; argomento (stesso owner, stessa `chiave`); per ogni raccolta che lo contiene e il cui *contributore* ne è l'autore, il ruolo dell'utente sulla raccolta (proprietario della raccolta conta come EDITOR). ADMIN → ogni esercizio PROPRIETARIO, ogni raccolta PROPRIETARIO. Esercizio senza autore: mai PROPRIETARIO per un docente.

- [ ] **Step 1: Test** (un `it` per riga, utenti A/B/C con prefisso):
  - esercizio nuovo di A: `ruoloEsercizio(A)` = PROPRIETARIO, `ruoloEsercizio(B)` = null, `ruoliEsercizi("scuola")` non lo contiene;
  - diretta B=VISUALIZZATORE + `accessoScuola=EDITOR` → B ha EDITOR (Review Focus 3);
  - argomento di A "Equazioni" condiviso con B COMMENTATORE → un esercizio di A con topic " equazioni" creato DOPO è COMMENTATORE per B; un esercizio di C su "Equazioni" resta null per B;
  - raccolta di A condivisa con B EDITOR; B ci mette un suo esercizio privato → A lo vede come EDITOR; C (non membro) null;
  - Review Focus 2: esercizio di C condiviso con B VISUALIZZATORE; B lo mette nella sua raccolta condivisa con A EDITOR → `ruoloEsercizio(A)` = null;
  - raccolta con `accessoScuola=EDITOR`: D (non nominato) ci aggiunge un suo esercizio privato → B non lo vede;
  - ADMIN vede l'esercizio privato di A come PROPRIETARIO;
  - `puo`: tabella delle azioni per i quattro ruoli e `null`.
- [ ] **Step 2:** Run `npx vitest run src/lib/esercizi/__tests__/accesso.test.ts` → FAIL.
- [ ] **Step 3:** Implementa `accesso.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): calcolo del ruolo su esercizi e raccolte`.

### Task 3: Redazione e import passano dall'accesso

**Files:**
- Modify: `src/lib/esercizi/redazione.ts`, `src/lib/esercizi/importa/importa.ts`
- Modify: `src/app/api/esercizi/redazione/route.ts`, `.../redazione/[id]/route.ts`, `.../redazione/[id]/duplica/route.ts`, `.../redazione/importa/route.ts`, `.../redazione/importa/verifica/route.ts`
- Modify: pagine `dashboard/esercizi/page.tsx`, `redazione/page.tsx`, `redazione/[id]/page.tsx`, `anteprima/[id]/page.tsx`
- Test: `src/lib/esercizi/__tests__/redazione.test.ts`, `importa.test.ts`, test delle rotte in `src/app/api/esercizi/__tests__/redazione-route.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces (firme nuove):
  - `elencoRedazione(chi: Utente): Promise<VoceRedazione[]>` — solo visibili; `VoceRedazione` guadagna `ruolo: Ruolo`, `proprietarioId: string | null`, `proprietarioNome: string | null`, `accesso: "privato" | "condiviso" | "scuola"` (per le righe proprie: scuola se `accessoScuola`, condiviso se ha almeno una condivisione nominata/argomento/raccolta condivisa, altrimenti privato).
  - `caricaPerEditor(esercizioId, chi)`: `non_trovato` se non visibile; nuovo motivo `"sola_lettura"` se visibile ma senza `modificare` (rotta → 403 solo in questo caso, perché l'esistenza è già nota a chi lo vede).
  - `salvaNuovaVersione(esercizioId, input, chi)`: stessa regola.
  - `caricaPerAnteprima(esercizioId, chi)`: `non_trovato` se non visibile; `EsitoAnteprima` ok guadagna `ruolo: Ruolo`.
  - `duplicaEsercizio(esercizioId, chi)`: richiede `vedere`; la copia ha `authorId = chi.id`, `accessoScuola = null`.
  - `creaEsercizio(input, authorId)`: invariata, ma la riga nasce con `accessoScuola = null` (default).
  - `importaEsercizi(..., chi: Utente)` e la verifica: il controllo doppioni considera solo esercizi in `ruoliEsercizi(chi)`.
- Pagina panoramica: `candidati` = esercizi visibili.

- [ ] **Step 1: Test**: `elencoRedazione(B)` non contiene l'esercizio privato di A e lo contiene con `ruolo:"VISUALIZZATORE"` dopo una condivisione; `caricaPerEditor` di un VISUALIZZATORE → `sola_lettura`, di un estraneo → `non_trovato`; `salvaNuovaVersione` da VISUALIZZATORE → rifiutata e nessuna versione nuova; `duplicaEsercizio` da VISUALIZZATORE → copia con autore B e `accessoScuola` null; import di un contenuto identico a un esercizio privato di A fatto da B → stato `ok` (Review Focus 4); rotta GET `redazione/[id]` per estraneo → 404.
- [ ] **Step 2:** Run i tre file di test → FAIL.
- [ ] **Step 3:** Implementa; aggiorna i test esistenti che creano esercizi con `prisma.esercizio.create` aggiungendo `accessoScuola: "EDITOR"` dove il test presume la visibilità di oggi.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): il catalogo e l'editor rispettano proprietà e ruoli`.

### Task 4: Raccolte, batterie e assegnazione

**Files:**
- Modify: `src/lib/esercizi/contenitori.ts`, `src/lib/esercizi/batterie.ts`, `src/lib/esercizi/compiti.ts`
- Modify: `src/app/api/esercizi/contenitori/**`, `src/app/api/esercizi/argomenti/route.ts`, `dashboard/esercizi/contenitori/page.tsx`, `contenitori/[id]/page.tsx`, `contenitori/[id]/contenitore-detail-client.tsx`, `batterie/page.tsx`
- Test: `contenitori.test.ts`, `batterie.test.ts`, `compiti.test.ts`, `assegna-diretto.test.ts`, `src/app/api/esercizi/__tests__/contenitori-route.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `elencoContenitori(chi: Utente)` → solo raccolte con ruolo; ogni voce guadagna `ruolo: Ruolo`; `esercizi` conta solo quelli visibili a `chi`.
  - `contenutoContenitore(id, chi)` → `null` se senza ruolo; `esercizi` solo visibili; voce guadagna `ruolo`.
  - `aggiungiEsercizi(contenitoreId, esercizioIds, chi)` / `togliEsercizio(contenitoreId, esercizioId, chi)` → richiedono EDITOR+ sulla raccolta e `vedere` su ogni esercizio aggiunto; altrimenti `{ ok: false, motivo: "non_trovato" | "sola_lettura" }`. Ritorno: `{ ok: true; aggiunti: number }` / `{ ok: true }`.
  - `eliminaContenitore(id, chi)` → PROPRIETARIO; motivi `non_trovato | sola_lettura | in_uso`.
  - `creaContenitore` invariata (nasce privata).
  - `bacinoRegola(regola, chi: Utente)` → interseca con `ruoliEsercizi(chi)`; per regole su raccolta senza ruolo → `[]`.
  - `argomentiDisponibili(chi: Utente, anno?: number)`, `quantiCorrispondono(f, chi)`, `verificaBatteria(id, chi)`; `assegna` e `assegnaDiretto` usano `utenteDaId(assignedById / teacherId)`.
  - `contenitori/[id]` pagina: l'elenco "disponibili" = visibili; quando la raccolta ha condivisioni (nominate o scuola) e l'esercizio scelto è proprio e privato, il client mostra prima un avviso con conferma (testo it: "Questo esercizio è privato: aggiungendolo, lo vedranno anche le persone che hanno accesso alla raccolta.").
- `elencoBatterie` resta comune (spec).

- [ ] **Step 1: Test**: `quantiCorrispondono` per B su un argomento dove A ha 2 esercizi privati e 1 condiviso con la scuola → 1 (Review Focus 1); `assegnaDiretto` di B non pesca mai gli esercizi privati di A; `aggiungiEsercizi` da VISUALIZZATORE della raccolta → `sola_lettura`; `contenutoContenitore` per un estraneo → `null`; `eliminaContenitore` da EDITOR (raccolta visibile ma non sua) → `sola_lettura`; rotta DELETE di un estraneo → 404.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementa; aggiorna i test esistenti (fixture con `accessoScuola: "EDITOR"` dove serve).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): raccolte e assegnazioni rispettano i ruoli`.

### Task 5: Pratica libera degli studenti

**Files:**
- Modify: `src/app/(student)/studente/page.tsx`, `src/app/(student)/studente/esercizio/[esercizioId]/page.tsx`
- Create: `src/lib/esercizi/pratica.ts`
- Test: `src/lib/esercizi/__tests__/pratica.test.ts`

**Interfaces:**
- Consumes: `ruoliEsercizi("scuola")`.
- Produces: `async function esercizioApribileDaStudente(studentId: string, esercizioId: string): Promise<boolean>` — vero se l'esercizio è nell'insieme "scuola" oppure compare (tramite `EsercizioVersione`) nei `drawnVersionIds` di un compito non ritirato di una classe a cui lo studente è iscritto. `async function eserciziPraticaLibera(): Promise<Set<string>>` = chiavi di `ruoliEsercizi("scuola")`.
- La home filtra l'elenco libero con `eserciziPraticaLibera()`; la pagina esercizio, quando `compitoId` è assente, chiama `esercizioApribileDaStudente` prima di `avviaORiprendi` e fa `notFound()` se falso.

- [ ] **Step 1: Test** (Review Focus 5): esercizio privato di A presente in un compito della classe dello studente → apribile; stesso esercizio, studente di un'altra classe → non apribile; esercizio condiviso con la scuola per argomento → in `eserciziPraticaLibera`; esercizio condiviso solo con B → non presente.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS, più `src/app/(student)` test esistenti.
- [ ] **Step 5:** Commit `feat(esercizi): la pratica libera mostra solo gli esercizi della scuola`.

### Task 6: Dominio e API della condivisione

**Files:**
- Create: `src/lib/esercizi/condivisione.ts`
- Create: `src/app/api/esercizi/condivisione/route.ts` (GET, PUT), `src/app/api/esercizi/condivisione/proprietario/route.ts` (POST, solo ADMIN), `src/app/api/esercizi/docenti/route.ts` (GET)
- Test: `src/lib/esercizi/__tests__/condivisione.test.ts`, `src/app/api/esercizi/__tests__/condivisione-route.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `type Risorsa = { tipo: "esercizio"; id: string } | { tipo: "contenitore"; id: string } | { tipo: "argomento"; argomento: string }` (l'argomento è sempre del proprietario `chi`; per l'ADMIN serve anche `ownerId` → `{ tipo: "argomento"; argomento: string; ownerId?: string }`).
  - `type StatoCondivisione = { persone: { userId: string; nome: string; email: string; ruolo: RuoloEsercizi }[]; scuola: RuoloEsercizi | null; indiretti: { nome: string; via: "raccolta" | "argomento"; dettaglio: string; ruolo: Ruolo }[]; proprietarioNome: string | null }` (`indiretti` solo per esercizi).
  - `leggiCondivisione(risorsa, chi): Promise<StatoCondivisione | null>` — null se `chi` non può `condividere`.
  - `impostaCondivisione(risorsa, chi, nuovo: { persone: { userId: string; ruolo: RuoloEsercizi }[]; scuola: RuoloEsercizi | null }): Promise<{ ok: true } | { ok: false; motivo: "non_trovato" | "destinatario_non_valido" }>` — sostituisce in transazione; destinatari solo TEACHER/ADMIN, mai `chi` stesso né il proprietario. Per l'argomento: `accessoScuola` = riga con `userId` null.
  - `docentiDellaScuola(escludiId: string): Promise<{ id: string; nome: string; email: string }[]>` (ordine per nome).
  - `trasferisciProprieta(risorsa: { tipo: "esercizio" | "contenitore"; id: string }, nuovoProprietarioId: string, chi: Utente)` — solo `chi.admin`.
  - Rotte: GET `?tipo=&id=` / `?tipo=argomento&argomento=`; PUT con lo stesso corpo di `impostaCondivisione`; validazione zod; rate limit come le altre rotte di scrittura (30/60s); 404 quando `leggiCondivisione` dà null.

- [ ] **Step 1: Test**: proprietario imposta B EDITOR + scuola VISUALIZZATORE e `leggiCondivisione` lo rilegge; B (EDITOR) → `leggiCondivisione` null e PUT 404; condividere con uno STUDENT → `destinatario_non_valido`; argomento: imposta e verifica che `ruoloEsercizio(B)` cambi per un esercizio nuovo; `indiretti` elenca la raccolta da cui B riceve l'esercizio; ADMIN trasferisce un esercizio a C → `ruoloEsercizio(C)` = PROPRIETARIO; un TEACHER che chiama la rotta proprietario → 403.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): condivisione con colleghi e con la scuola`.

### Task 7: Finestra "Condividi" e catalogo

**Files:**
- Create: `src/components/esercizi/condivisione/condividi-dialog.tsx` (client)
- Modify: `redazione/page.tsx`, `redazione/redazione-elenco-client.tsx`, `contenitori/[id]/page.tsx` + client, `dashboard/esercizi/redazione/[id]/page.tsx`, `anteprima/[id]/page.tsx`
- Modify: `src/messages/it.json`, `en.json` (namespace nuovo `esercizi.condivisione`, chiavi catalogo in `teacherExercisesUi.catalog`)
- Test: `src/components/esercizi/condivisione/__tests__/condividi-dialog.test.tsx`, `redazione/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: rotte del Task 6, `VoceRedazione` del Task 3.
- Produces: `<CondividiDialog risorsa={Risorsa} titolo={string} testi={...} />` — bottone "Condividi" che apre il dialog (stesso componente dialog già usato da `src/components/quiz/share-dialog.tsx`): ricerca tra `GET /api/esercizi/docenti`, ruolo per persona con "Rimuovi", "Accesso generale" (Solo le persone aggiunte / Tutta la scuola + ruolo), per gli esercizi l'elenco `indiretti` ("Rossi lo vede anche tramite la raccolta Equazioni"), "Salva" → PUT.
- Catalogo:
  - riga: etichetta "Tuo · Privato/Condiviso/Tutta la scuola" o ruolo + "di {proprietario}"; "Apri" solo con `modificare`; "Condividi" solo con `condividere`;
  - filtro "Di chi": Tutti / Miei / Condivisi con me (+ "Di altri" per ADMIN, cioè visibili solo perché admin: ruolo PROPRIETARIO e `proprietarioId !== chi.id`);
  - intestazione del gruppo-argomento: "Condividi argomento" se l'utente ha almeno un esercizio proprio in quel gruppo;
  - rimuovi la riga `chiunquePuoModificare` dalla pagina.
- ADMIN: nel dialog, campo "Proprietario" con select dei docenti → POST proprietario.

- [ ] **Step 1: Test**: dialog con fetch mockato carica lo stato, aggiunge un docente come Editor, imposta "Tutta la scuola: Visualizzatore" e invia il PUT con `{ persone:[{userId, ruolo:"EDITOR"}], scuola:"VISUALIZZATORE" }`; catalogo: riga VISUALIZZATORE senza link "apri" e senza "Condividi"; filtro "Miei" nasconde le righe con ruolo diverso da PROPRIETARIO; la scritta `chiunquePuoModificare` non c'è più.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `npx tsc --noEmit`; `npx eslint` sui file toccati.
- [ ] **Step 5:** Verifica visiva sul server di prova (porta 3100, DB `savint_video`): screenshot del catalogo e del dialog, desktop e 390px.
- [ ] **Step 6:** Commit `feat(esercizi): finestra Condividi e ruoli nel catalogo`.

### Task 8: Commenti

**Files:**
- Create: `src/lib/esercizi/commenti.ts`, `src/app/api/esercizi/redazione/[id]/commenti/route.ts` (GET, POST), `src/app/api/esercizi/commenti/[id]/route.ts` (PATCH risolvi/riapri, DELETE), `src/components/esercizi/commenti/commenti-esercizio.tsx` (client)
- Modify: `anteprima/[id]/page.tsx`, `redazione/[id]/page.tsx` (sezione accanto all'esercizio), `redazione.ts` (`VoceRedazione.commentiAperti: number`, solo per righe con `condividere`, altrimenti 0), `redazione-elenco-client.tsx` (contatore), messaggi it/en (`esercizi.commenti`)
- Test: `src/lib/esercizi/__tests__/commenti.test.ts`, `src/components/esercizi/commenti/__tests__/commenti-esercizio.test.tsx`

**Interfaces:**
- Consumes: Task 2 (`puo`, `ruoloEsercizio`).
- Produces:
  - `type Commento = { id: string; autoreNome: string; testo: string; createdAt: Date; risolto: boolean; mio: boolean; risposte: Omit<Commento, "risposte" | "risolto">[] }`
  - `elencoCommenti(esercizioId, chi): Promise<Commento[] | null>` (null se non visibile; più recenti prima)
  - `scriviCommento(esercizioId, chi, testo: string, parentId?: string)` — richiede `commentare`; testo trim, 1..2000 caratteri; risposta solo a un commento di primo livello dello stesso esercizio.
  - `risolviCommento(id, chi, risolto: boolean)` — richiede `risolvere`; solo primo livello.
  - `eliminaCommento(id, chi)` — autore del commento o `condividere`.
  - Esiti `{ ok: false, motivo: "non_trovato" | "non_permesso" | "testo_non_valido" }` → 404 / 403 / 422.
  - UI: elenco aperti, gruppo "Risolti (n)" richiudibile, campo "Scrivi un commento" solo se `commentare`, "Rispondi", "Segna come risolto" solo se `risolvere`, "Elimina" sui propri o se proprietario.

- [ ] **Step 1: Test**: VISUALIZZATORE legge ma `scriviCommento` → `non_permesso`; COMMENTATORE scrive e risponde; COMMENTATORE non risolve, EDITOR sì; estraneo → `elencoCommenti` null; `commentiAperti` del proprietario conta solo i non risolti di primo livello; componente: senza permesso di commentare il campo non c'è.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): commenti sugli esercizi`.

### Task 9: Verifica finale

- [ ] **Step 1:** `npx prisma generate` (se non fatto), poi in un comando separato la suite completa `npx vitest run` → tutti verdi.
- [ ] **Step 2:** `npx tsc --noEmit` pulito; `npx eslint` sui file toccati senza errori nuovi.
- [ ] **Step 3:** Prova manuale sul server di prova con due docenti (A crea privato → B non lo vede; A condivide argomento con B come Commentatore → B commenta; A risolve) e uno studente (pratica libera).
- [ ] **Step 4:** Aggiorna la memoria di progetto e, se richiesto, commit/push.
