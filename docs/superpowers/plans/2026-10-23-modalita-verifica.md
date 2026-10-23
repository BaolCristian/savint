# Modalità VERIFICA online — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un docente crea dalla pagina «Nuovo compito» una verifica con punti per blocco, la avvia (pulsante o orario), la classe la svolge a schermo intero con salvataggio continuo e senza alcun feedback, gli studenti con PDP hanno le loro misure, il docente monitora, chiude, corregge, pubblica e riapre per i recuperi.

**Architecture:** Un `Compito` con `tipo = VERIFICA` e una riga `Verifica` 1:1 (durata, avvio, stati, strumenti, formulario, layout dei blocchi congelato); una `ProvaVerifica` per studente (misure PDP copiate, posizioni assegnate, consegna, recupero, pubblicazione) a cui sono legati i `Tentativo` (uno per esercizio, `provaId`) e gli `EventoVerifica` (uscite). Le regole di tempo, sottoinsieme PDP e punteggio sono funzioni pure in `verifica-regole.ts`; non c'è un job runner, quindi avvio programmato, consegna automatica alla scadenza e chiusura automatica sono **pigri**: `sincronizzaVerifica` li applica con scritture condizionate (idempotenti) all'inizio di ogni lettura o scrittura di una verifica — il polling del docente (5 s) e dello studente (20 s) basta a farli scattare puntuali, e i valori scritti sono quelli "di diritto" (inizio = orario programmato, consegna = scadenza), non l'ora della lettura. Il player dei compiti resta invariato: la prova usa un componente separato che riusa le parti del player.

**Tech Stack:** Next.js 16 app router, Prisma 6 / PostgreSQL 17, next-intl, Tailwind (token `--brand-*`), zod, vitest + Testing Library (test di dominio sul DB di sviluppo con prefissi), Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-modalita-verifica-design.md` (incluse le «Scelte mie», vincolanti).

## Global Constraints

- Migrazioni solo additive, SQL scritto a mano in una nuova `prisma/migrations/<timestamp>_<nome>/migration.sql`, applicata con `npx prisma migrate deploy` e poi `npx prisma generate` in un comando separato, prima di lanciare i test. Mai `migrate dev` (salvo `--create-only`, e mai con un DB reale come `--shadow-database-url`), mai `migrate reset`, mai `db push`; mai modificare una migrazione già applicata, nemmeno nei commenti.
- Mai due suite di test insieme sul DB di sviluppo (il lucchetto ferma la seconda: non aggirarlo).
- Fetch client verso `/api` sempre con `withBasePath` (`src/lib/base-path.ts`); `<Link>`, `router.push`, `redirect` mai avvolti.
- Le versioni di un compito/verifica si leggono sempre da `src/lib/esercizi/versioni-compito.ts` (`versioniDelloStudente`, `estrazioniDegliStudenti`); mai `drawnVersionIds` direttamente.
- Tutti i testi nuovi in `src/messages/it.json` e `en.json`, in sincronia (namespace nuovi `esercizi.verifica`, `esercizi.provaStudente`, `esercizi.misurePdp`).
- Il codice nuovo passa `npx eslint --quiet src/lib/esercizi src/app/api/esercizi src/components/esercizi "src/app/(dashboard)/dashboard/esercizi" "src/app/(student)" packages/engine` e `npx tsc --noEmit` pulito. Per questo ogni file nuovo vive sotto quei percorsi.
- I compiti esistenti si comportano esattamente come prima: `Compito.tipo` default `COMPITO`, campi nuovi di `BatteriaRegola` nulli/vuoti, nessun test esistente cambia asserzioni (solo righe aggiunte).
- Il server fa rispettare tempi, chiusura e consegna; il client non è mai l'unica difesa. Margine di grazia per i salvataggi: 30 s (`GRAZIA_MS = 30_000`).
- Nessun segnale di giusto/sbagliato, punteggio, svolgimento o risposta attesa arriva al client dello studente prima della pubblicazione dei SUOI risultati (le rotte della prova non restituiscono mai `score`, `feedback`, `advice`).
- Dati PDP: solo misure, mai diagnosi o note; leggibili/modificabili solo dai docenti della classe (e ADMIN per la classe); mai inviati ad altri studenti.
- Commenti nel codice in italiano, nello stile dei file vicini. Branch `feat/modalita-verifica`, un commit per task; push solo alla fine e solo se l'utente lo autorizza.

## Review Focus

1. **Orologio del PC sbagliato o fuso diverso** → il conto alla rovescia segue l'ora del server (scarto calcolato all'ingresso e a ogni salvataggio), e la consegna automatica del client scatta quando il server dice zero, non prima né dopo (test Task 8: `orologio-server`; Task 9: timer della pagina).
2. **Rete giù negli ultimi minuti** → le risposte in coda (memoria + localStorage) partono al ritorno della rete e il server le accetta entro scadenza + 30 s; oltre, il server risponde `tempo_scaduto`, la coda si svuota e lo studente vede «Tempo scaduto: le risposte salvate sono state consegnate», senza ritentare all'infinito (test Task 8: `coda-salvataggi`; Task 6: grazia).
3. **Due schede aperte / doppio clic su «Inizia»** → una sola `ProvaVerifica`, un solo tentativo per esercizio (vincoli unici), stessi semi in entrambe le schede; l'ultimo salvataggio vince (test Task 6: `entraNellaProva` concorrente).
4. **Salvataggio in volo mentre il docente preme «Chiudi»** → il salvataggio arrivato dopo la chiusura risponde `consegnata` e non scrive; le risposte salvate prima restano (test Task 6: salvataggio dopo `chiudiVerifica`).
5. **Studente iscritto durante la prova, o misure della classe cambiate a prova in corso** → l'iscritto tardivo entra con le misure della classe al primo ingresso e il monitoraggio lo mostra «non entrato» fino ad allora; chi aveva già la copia delle misure all'avvio non cambia (test Task 5 e Task 6).

---

### Task 1: Schema, migrazione e regole pure

**Files:**
- Modify: `prisma/schema.prisma` (Compito ~886, Tentativo ~728, BatteriaRegola ~864, User, Classe: relazioni inverse)
- Create: `prisma/migrations/20261023120000_modalita_verifica/migration.sql`
- Create: `src/lib/esercizi/verifica-regole.ts`
- Test: `src/lib/esercizi/__tests__/schema-verifica.test.ts`, `src/lib/esercizi/__tests__/verifica-regole.test.ts`

**Interfaces — Produces (Prisma):**
- `enum TipoCompito { COMPITO VERIFICA }`; `Compito.tipo TipoCompito @default(COMPITO)`; `Compito.verifica Verifica?`; `Compito.prove ProvaVerifica[]`.
- `enum ModoStrumento { NESSUNO SOLO_PDP TUTTI }`
- `model Verifica { compitoId String @id; durataMinuti Int; avvioProgrammatoAt DateTime?; avviataAt DateTime?; chiusaAt DateTime?; pubblicataAt DateTime?; minutiExtra Int @default(0); calcolatrice ModoStrumento @default(SOLO_PDP); formulario ModoStrumento @default(SOLO_PDP); formularioFile String?; layout Json; createdAt DateTime @default(now()) }` — cascade su Compito. `layout` = `LayoutBlocco[]`. `minutiExtra` = «+ minuti a tutti» (non vale per i recuperi).
- `model ProvaVerifica { id String @id @default(cuid()); compitoId String; studentId String; tempoExtraPct Int @default(0); menoEsercizi Boolean @default(false); calcolatrice Boolean @default(false); formulario Boolean @default(false); minutiExtra Int @default(0); inizioAt DateTime?; recupero Boolean @default(false); posizioni Int[] @default([]); entrataAt DateTime?; ultimoSalvataggioAt DateTime?; consegnataAt DateTime?; consegnaAutomatica Boolean @default(false); pubblicataAt DateTime?; createdAt DateTime @default(now()); tentativi Tentativo[]; eventi EventoVerifica[]; @@unique([compitoId, studentId]); @@index([studentId]) }` — cascade su Compito e User. `inizioAt` null = conta `Verifica.avviataAt`; valorizzato solo per un recupero. `posizioni` = indici (0-based) nell'estrazione dello studente, fissati al primo ingresso.
- `enum TipoEventoVerifica { USCITA RIENTRO }`, `enum MotivoUscita { SCHERMO_INTERO SCHEDA FOCUS }`; `model EventoVerifica { id String @id @default(cuid()); provaId String; tipo TipoEventoVerifica; motivo MotivoUscita?; at DateTime; durataMs Int?; @@index([provaId, at]) }` — cascade su ProvaVerifica.
- `model MisurePdp { classeId String; studentId String; tempoExtraPct Int @default(0); menoEsercizi Boolean @default(false); calcolatrice Boolean @default(false); formulario Boolean @default(false); updatedAt DateTime @updatedAt; @@id([classeId, studentId]) }` — cascade su Classe e su User separatamente (non su `ClasseStudente`: una disiscrizione temporanea di `allineaClassi` non deve cancellare le misure). Nessun campo testo libero.
- `Tentativo.provaId String?` (relazione `prova ProvaVerifica? onDelete: Cascade`), `Tentativo.puntiManuali Float?`, `@@unique([provaId, esercizioVersioneId])` (i NULL non collidono: i tentativi di oggi restano liberi).
- `BatteriaRegola.punti Float?`, `BatteriaRegola.quantiPdp Int?`, `BatteriaRegola.nonPerPdp String[] @default([])` (id di Esercizio; solo forma «scelti»).

**Interfaces — Produces (`verifica-regole.ts`, tutto puro):**
- `export const GRAZIA_MS = 30_000;`
- `export type StatoVerifica = "PREPARATA" | "IN_CORSO" | "CHIUSA" | "PUBBLICATA";`
- `export function statoVerifica(v: { avviataAt: Date | null; chiusaAt: Date | null; pubblicataAt: Date | null }): StatoVerifica` — pubblicata > chiusa > avviata > preparata.
- `export type LayoutBlocco = { quanti: number; punti: number; quantiPdp: number; scelti: boolean; nonPerPdp: string[] };` — `quanti` = quanti esercizi il blocco mette nell'estrazione di ogni studente (le posizioni del blocco k sono `[Σ quanti_<k, Σ quanti_≤k)`).
- `export function scadenzaProva(i: { inizio: Date; durataMinuti: number; tempoExtraPct: number; minutiExtra: number }): Date` — `inizio + round(durata × (1 + pct/100) × 60000) + minutiExtra × 60000`.
- `export function posizioniDellaProva(layout: LayoutBlocco[], esercizioIdPerPosizione: string[], menoEsercizi: boolean): { posizione: number; punti: number }[]` — senza meno: tutte; con meno: per un blocco casuale le prime `quantiPdp` posizioni del blocco, per un blocco scelti le posizioni il cui esercizio non è in `nonPerPdp`. Ordine crescente.
- `export function totalePieno(layout: LayoutBlocco[]): number` — `Σ quanti × punti`.
- `export function puntiCella(c: { punti: number; score: number; maxScore: number; puntiManuali: number | null }): number` — manuale se non null, altrimenti `maxScore > 0 ? score / maxScore × punti : 0`.
- `export function punteggioProva(celle: Parameters<typeof puntiCella>[0][], pieno: number): { ottenuto: number; totaleStudente: number; finale: number; percentuale: number }` — `finale = totaleStudente > 0 ? ottenuto × pieno / totaleStudente : 0`; tutto arrotondato a 2 decimali.
- `export function rispostaVuota(a: unknown): boolean` — `undefined`/`null`/stringa vuota o di soli spazi/array i cui elementi sono tutti vuoti/`false`.
- `export function haRisposta(state: QuestionState | null): boolean` — almeno una parte (o gap) con `answered` e risposta non vuota.
- `export function contenutoPerVerifica(content: unknown): unknown` — copia profonda; `advice` della domanda a `""`; in ogni parte, gap e alternativa (ricorsivo su `parts`, `gaps`, `alternatives`) toglie `distractors`, `alternativeFeedbackMessage`, `adaptiveMarkingNotUsedMessage`.

- [ ] **Step 1: Test schema** (`schema-verifica.test.ts`, prefisso `schemaverificatest-`) — un `Compito` creato senza `tipo` ha `tipo = "COMPITO"`; una `Verifica` e le sue `ProvaVerifica`/`EventoVerifica` spariscono con il compito; due `ProvaVerifica` stessa coppia ⇒ P2002; due `Tentativo` con stesso `provaId`+versione ⇒ P2002, due con `provaId` null ⇒ ok; `MisurePdp` sopravvive alla cancellazione della riga `ClasseStudente` e sparisce con la `Classe`; una `BatteriaRegola` senza i campi nuovi ha `punti = null`, `nonPerPdp = []`.
- [ ] **Step 2: Test regole** (`verifica-regole.test.ts`):
  - `scadenzaProva({ inizio: 10:00, durataMinuti: 60, tempoExtraPct: 30, minutiExtra: 5 })` = 11:23; con pct 0 e extra 0 = 11:00.
  - `posizioniDellaProva` con layout `[{quanti:3,quantiPdp:2,punti:2,scelti:false,nonPerPdp:[]},{quanti:2,quantiPdp:2,punti:1,scelti:true,nonPerPdp:["e5"]}]` ed esercizi `["e1","e2","e3","e4","e5"]`: senza meno 5 posizioni; con meno `[{0,2},{1,2},{3,1}]`.
  - `totalePieno` dello stesso layout = 8.
  - Esempio dello spec: celle che danno 12 su un totale studente 16 con pieno 20 ⇒ `finale = 15`, `percentuale = 75`; `puntiManuali = 0.75` vince sul calcolo; `maxScore = 0` ⇒ 0.
  - `statoVerifica` per le quattro combinazioni.
  - `rispostaVuota`: `""`, `"  "`, `[null, ""]`, `[[false,false]]` vuote; `"0"`, `[[false,true]]` no. `haRisposta` falso per uno stato con parti `answered: true` ma risposta `""`.
  - `contenutoPerVerifica` su un contenuto con `advice`, una parte `1_n_2` con `distractors` e un gapfill con alternative: campi tolti, l'originale non mutato, e `loadQuestion` + `submit` della stessa risposta danno lo stesso `score` sul contenuto ripulito e sull'originale.
- [ ] **Step 3:** Run `npx vitest run src/lib/esercizi/__tests__/schema-verifica.test.ts src/lib/esercizi/__tests__/verifica-regole.test.ts` → FAIL.
- [ ] **Step 4:** Schema + SQL a mano nello stile di `20261023083000_indici_nuovo_compito` (commenti `-- CreateEnum`, `-- AlterTable`, `-- CreateTable`, `-- CreateIndex`, `-- AddForeignKey`), nomi di vincoli e indici come li genera Prisma (`"Verifica_pkey"`, `"ProvaVerifica_compitoId_studentId_key"`, `"Tentativo_provaId_esercizioVersioneId_key"`, `"..._fkey"`, `"..._idx"`); `nonPerPdp TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]`, `posizioni INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[]`. Poi `npx prisma migrate deploy`; poi, in un comando separato, `npx prisma generate`. Controllo della deriva senza shadow DB: `npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script` → nessuna istruzione sulle tabelle toccate (è tollerata solo la deriva nota `PracticeRun.expiresAt`). Applicare anche a `postgresql://kahoot:kahoot@localhost:5432/savint_video` con `DATABASE_URL=... npx prisma migrate deploy`.
- [ ] **Step 5:** Implementa `verifica-regole.ts`.
- [ ] **Step 6:** Run → PASS; `npx tsc --noEmit`.
- [ ] **Step 7:** Commit `feat(esercizi): schema e regole della modalità verifica`.

### Task 2: Le verifiche fuori dalle letture dei compiti

**Files:**
- Modify: `src/lib/esercizi/compiti.ts` (`compitoApribile`, `compitiDellaClasse`, `compitiDelloStudente`, `consegneDelCompito`, `compitoGestibile`/`modificaDateCompito`), `src/lib/esercizi/percorso-compito.ts`, `src/lib/esercizi/statistiche.ts` (`statisticheDelCompito`, `andamentoDellaClasse`), `src/lib/esercizi/pratica.ts`, `src/lib/esercizi/tentativo.ts` (`applicaRisposta`, `completa`, `abbandona`), `src/app/(student)/studente/page.tsx` (rilettura `datiCompiti`), `src/app/(dashboard)/dashboard/esercizi/compiti/page.tsx`, `src/app/(dashboard)/dashboard/esercizi/compiti/[id]/page.tsx`
- Test: `src/lib/esercizi/__tests__/verifica-esclusa.test.ts` + esecuzione dei test esistenti dei file toccati

**Interfaces:**
- Consumes: Task 1 (schema).
- Produces:
  - `compitiDellaClasse` restituisce anche `tipo: "COMPITO" | "VERIFICA"` (tutti e due: l'elenco del docente mostra le verifiche con l'etichetta «Verifica» e link a `/dashboard/esercizi/verifiche/{id}`; la conferma di rimozione classe in `classi/page.tsx` le conta come oggi).
  - Filtro `tipo: "COMPITO"` in: `compitiDelloStudente`, `andamentoDellaClasse`, `esercizioApribileDaStudente` (entrambe le query), rilettura in `studente/page.tsx`. `compitoApribile`, `percorsoCompitoStudente`, `consegneDelCompito`, `statisticheDelCompito`, `compitoGestibile` trattano una verifica come compito inesistente (stesso ramo di `ritiratoAt`). `ritiraCompito` resta valido anche per le verifiche (usa una lettura senza filtro di tipo).
  - `esercizioApribileDaStudente`: ramo nuovo, vero se l'esercizio è fra le versioni di una `ProvaVerifica` dello studente con `pubblicataAt` non nullo (riprova in allenamento dopo la pubblicazione; la pratica apre un tentativo libero, `compitoId` null).
  - `applicaRisposta`, `completa`, `abbandona`: un tentativo con `provaId` non nullo ⇒ `{ ok: false, motivo: "non_trovato" }` (le rotte dei compiti non toccano mai una prova, e non danno feedback su una verifica).
  - `compiti/[id]/page.tsx`: un compito `tipo = VERIFICA` ⇒ `redirect("/dashboard/esercizi/verifiche/{id}")` prima di ogni altra lettura (dopo il controllo di titolo).
- Decisione registrata: gli esercizi di una verifica in corso che sono anche nel catalogo libero della scuola restano apribili in pratica libera (seme diverso, numeri diversi); uscire dallo schermo intero per farlo viene comunque registrato.

- [ ] **Step 1: Test** (`verifica-esclusa.test.ts`, prefisso `verificaesclusatest-`; verifica creata con Prisma diretto: `Compito{tipo:"VERIFICA"}` + `Verifica`) — `compitiDelloStudente` non la contiene; `compitiDellaClasse` sì con `tipo: "VERIFICA"`; `compitoApribile(verificaId, …)` ⇒ null e quindi `avviaORiprendi(…, verificaId)` apre un tentativo libero con `richiestaCompitoRifiutata: true`; `percorsoCompitoStudente` ⇒ null; `statisticheDelCompito` ⇒ `compito_non_trovato`; `andamentoDellaClasse` non conta i suoi esercizi; `modificaDateCompito` ⇒ `compito_non_trovato`; `applicaRisposta`/`completa`/`abbandona` su un tentativo con `provaId` ⇒ `non_trovato` e stato invariato; `esercizioApribileDaStudente` per un esercizio privato presente solo nella verifica ⇒ falso prima di `pubblicataAt`, vero dopo.
- [ ] **Step 2:** Run `npx vitest run src/lib/esercizi/__tests__/verifica-esclusa.test.ts` → FAIL.
- [ ] **Step 3:** Implementa.
- [ ] **Step 4:** Run → PASS, poi `npx vitest run src/lib/esercizi "src/app/(student)" "src/app/(dashboard)/dashboard/esercizi/compiti"` → tutti verdi senza asserzioni cambiate.
- [ ] **Step 5:** Commit `feat(esercizi): le verifiche non sono compiti per le letture esistenti`.

### Task 3: Misure PDP della classe

**Files:**
- Create: `src/lib/esercizi/misure-pdp.ts`
- Create: `src/app/api/esercizi/classi/[id]/misure-pdp/route.ts` (GET elenco, PUT `{ studentId, misure }`)
- Create: `src/app/(dashboard)/dashboard/esercizi/classi/misure-pdp-dialog.tsx` (client, `export function MisurePdpDialog({ studentId, nome, iniziali, endpoint }: { studentId: string; nome: string; iniziali: MisurePdpValori; endpoint: string })` — `endpoint` già senza basePath, il dialogo lo avvolge in `withBasePath`)
- Modify: `src/app/(dashboard)/dashboard/esercizi/classi/page.tsx` (pulsante «Misure PDP» su ogni iscritto della card della classe)
- Modify: `src/messages/it.json`, `en.json` (`esercizi.misurePdp`)
- Test: `src/lib/esercizi/__tests__/misure-pdp.test.ts`, `src/app/api/esercizi/__tests__/misure-pdp-route.test.ts`, `src/app/(dashboard)/dashboard/esercizi/classi/__tests__/misure-pdp-dialog.test.tsx`

**Interfaces:**
- Produces:
  - `export type MisurePdpValori = { tempoExtraPct: number; menoEsercizi: boolean; calcolatrice: boolean; formulario: boolean };`
  - `export const MISURE_VUOTE: MisurePdpValori` (0, false, false, false)
  - `export const misurePdpSchema` (zod: `tempoExtraPct` intero 0–100, tre booleani)
  - `export function haMisure(m: MisurePdpValori): boolean`
  - `export async function misureDellaClasse(classeId: string, chi: Utente): Promise<Map<string, MisurePdpValori> | null>` — null se `chi` non insegna la classe e non è ADMIN; solo gli iscritti con riga.
  - `export async function salvaMisurePdp(classeId: string, studentId: string, chi: Utente, misure: MisurePdpValori): Promise<{ ok: true } | { ok: false; motivo: "non_trovata" | "non_iscritto" }>` — misure tutte vuote ⇒ cancella la riga (nessuna traccia di un PDP tolto).
  - Rotta: 404 per classe non sua (mai 403), 400 corpo non valido, `requireTeacher` + `utenteDaSessione`, rate limit `esercizi:misure-pdp:{id}` 60/min.
  - UI: dialogo con tempo supplementare (scelte 0/15/20/25/30/50 % + «altro» numerico 0–100), tre spunte; l'iscritto con misure mostra un piccolo segno solo al docente («PDP»); fetch con `withBasePath`.
- Decisione registrata: lo spec cita `/dashboard/esercizi/classi/[id]`, che non esiste; le misure si gestiscono nella card della classe in `/dashboard/esercizi/classi`, dove già sono elencati gli iscritti.

- [ ] **Step 1: Test** — dominio: un collega che non insegna la classe ⇒ null / `non_trovata` e nulla scritto; ADMIN che non insegna ⇒ può leggere e salvare; studente non iscritto ⇒ `non_iscritto`; salvare `MISURE_VUOTE` cancella la riga; `tempoExtraPct: 101` rifiutato dallo schema. Rotta: 401, 400, 404, 200 con la mappa. Dialogo: scegliere 30 % e «Calcolatrice» manda `PUT` a `withBasePath("/api/esercizi/classi/c1/misure-pdp")` con `{ studentId, misure: { tempoExtraPct: 30, menoEsercizi: false, calcolatrice: true, formulario: false } }`; «altro» con 120 ⇒ errore in pagina, nessuna richiesta.
- [ ] **Step 2:** Run i tre file → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `eslint` sui file toccati.
- [ ] **Step 5:** Commit `feat(esercizi): misure PDP per studente nella classe`.

### Task 4: Creare una verifica (dominio, rotta, formulario)

**Files:**
- Modify: `src/lib/esercizi/estrazione.ts` (`Blocco` con campi verifica; `bloccoDaRegola`, `regolaDaBlocco` li portano), `src/lib/esercizi/batterie.ts` (`RegolaInput`, `scriviBatteria`, `rifiutoRegole` per `nonPerPdp ⊆ esercizioIds` e `quantiPdp ≤ count`), `src/lib/esercizi/blocchi-corpo.ts` (schema), `src/lib/esercizi/compiti.ts` (`InputAssegna`, `assegnaCompito`)
- Create: `src/lib/esercizi/formulari.ts`
- Create: `src/app/api/esercizi/verifiche/formulari/route.ts` (POST multipart, docente)
- Modify: `src/app/api/esercizi/compiti/route.ts` (corpo con `tipo`/`verifica`), `src/app/api/uploads/[...path]/route.ts` (404 se il primo segmento è `privati`)
- Test: `src/lib/esercizi/__tests__/assegna-verifica.test.ts`, `src/app/api/esercizi/__tests__/compiti-route.test.ts` (casi nuovi), `src/app/api/esercizi/__tests__/formulari-route.test.ts`, test esistente della rotta uploads (o nuovo `src/app/api/uploads/__tests__/privati.test.ts`)

**Interfaces:**
- Consumes: Task 1 (`LayoutBlocco`, `posizioniDellaProva`).
- Produces:
  - `Blocco`: `argomento`/`raccolta` + `punti?: number; quantiPdp?: number`; `scelti` + `punti?: number; nonPerPdp?: string[]`. Schema: `punti` multiplo di 0,5 in [0,5; 100]; `quantiPdp` intero in [0; quanti]; `nonPerPdp` max 200. Un compito normale ignora questi campi.
  - `formulari.ts`: `export const NOME_FILE_FORMULARIO = /^[0-9a-f-]{36}\.(?:png|jpg|webp|pdf)$/`; `export function cartellaFormulari(): string` = `join(APP_ROOT || cwd, "public", "uploads", "privati", "formulari")` (dentro il volume Docker `savint-uploads`, ma mai servita da `/api/uploads`); `export async function salvaFormulario(file: File): Promise<{ ok: true; file: string } | { ok: false; motivo: "tipo_non_ammesso" | "troppo_grande" }>` (png/jpeg/webp/pdf, firma dei byte come `immagini/route.ts`, PDF = `%PDF-`, max 10 MB); `export async function leggiFormulario(nome: string): Promise<{ byte: Uint8Array; tipo: string } | null>`.
  - Rotta `POST /api/esercizi/verifiche/formulari` → 201 `{ file }`; 400 col motivo; rate limit 10/min.
  - `InputAssegna` + `tipo?: "COMPITO" | "VERIFICA"` + `verifica?: { durataMinuti: number; avvioProgrammatoAt?: Date; calcolatrice: ModoStrumento; formulario: ModoStrumento; formularioFile?: string }`; `MotivoAssegnaCompito` + `"verifica_non_valida" | "pdp_senza_esercizi" | "formulario_non_trovato"`.
  - `export function layoutDaBlocchi(blocchi: Blocco[], richiesti: number[]): LayoutBlocco[]` (in `compiti.ts`) — `quanti = richiesti[k]`, `punti` default 1, `quantiPdp` default `quanti` (scelti: `quanti − |nonPerPdp ∩ esercizioIds|`), `scelti`, `nonPerPdp` default `[]`.
  - `assegnaCompito` con `tipo: "VERIFICA"`: rifiuta `opensAt`/`dueAt` (le date dei compiti non esistono per una verifica), `durataMinuti` fuori da [5, 300] o `avvioProgrammatoAt` non nel futuro ⇒ `verifica_non_valida`; layout con `posizioniDellaProva(..., true)` vuoto ⇒ `pdp_senza_esercizi` (controllo sul layout, che per gli scelti usa gli id dei blocchi); `formularioFile` che non rispetta il regex o non esiste su disco ⇒ `formulario_non_trovato`. Nella stessa transazione crea `Compito{tipo:"VERIFICA", opensAt:null, dueAt:null}` e `Verifica{ layout, … }`. Il modello salvato con «Salva anche come modello» porta `punti`, `quantiPdp`, `nonPerPdp` nelle sue regole.
  - Rotta `POST /api/esercizi/compiti`: `tipo` (default `COMPITO`) e `verifica` opzionale (`avvioProgrammatoAt` ISO); 400 per i tre motivi nuovi; risposta invariata `201 { compitoId }`.

- [ ] **Step 1: Test** — `assegna-verifica.test.ts` (prefisso `assegnaverificatest-`): verifica CLASSE con un blocco raccolta `quanti 3, quantiPdp 2, punti 2` e un blocco scelti `[a,b]` con `nonPerPdp [b]`, `punti 1` ⇒ `Verifica.layout` = `[{quanti:3,punti:2,quantiPdp:2,scelti:false,nonPerPdp:[]},{quanti:2,punti:1,quantiPdp:1,scelti:true,nonPerPdp:["b"]}]`, `Compito.tipo = VERIFICA`, `opensAt`/`dueAt` null, `durataMinuti` salvata; modo STUDENTE funziona uguale (bacini congelati come oggi); `quantiPdp: 0` su tutti i blocchi e scelti tutti `nonPerPdp` ⇒ `pdp_senza_esercizi` e nessuna riga; `durataMinuti: 0` ⇒ `verifica_non_valida`; `avvioProgrammatoAt` nel passato ⇒ `verifica_non_valida`; `formularioFile` inesistente ⇒ `formulario_non_trovato`; `salvaModello` ⇒ le regole del modello hanno `punti`/`quantiPdp`/`nonPerPdp`, e `caricaModello` restituisce blocchi con quei campi; un compito normale con gli stessi blocchi ignora i campi verifica e ha `tipo = COMPITO`. Rotte: 201 con `tipo: "VERIFICA"`; 400 `verifica_non_valida`; upload di un PDF vero ⇒ 201 e file sotto `privati/formulari`; un HTML rinominato `.pdf` ⇒ 400 `tipo_non_ammesso`; `GET /api/uploads/privati/formulari/<file>` ⇒ 404.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS + `npx vitest run src/lib/esercizi/__tests__/assegna-compito.test.ts src/lib/esercizi/__tests__/batterie.test.ts src/lib/esercizi/__tests__/estrazione.test.ts src/app/api/esercizi/__tests__/compiti-route.test.ts` verdi.
- [ ] **Step 5:** Commit `feat(esercizi): creare una verifica con punti, misure PDP e formulario`.

### Task 5: Ciclo di vita della verifica (dominio e rotte del docente)

**Files:**
- Create: `src/lib/esercizi/verifiche.ts`
- Create: `src/app/api/esercizi/verifiche/[id]/route.ts` (GET monitoraggio, PATCH impostazioni in PREPARATA), `src/app/api/esercizi/verifiche/[id]/azioni/route.ts` (POST), `src/app/api/esercizi/verifiche/[id]/misure/route.ts` (GET, PUT)
- Test: `src/lib/esercizi/__tests__/verifiche.test.ts`, `src/app/api/esercizi/__tests__/verifiche-route.test.ts`

**Interfaces:**
- Consumes: Task 1 (regole), Task 3 (`MisurePdpValori`, `MISURE_VUOTE`, `haMisure`), `haTitoloSulCompito` (compiti.ts), `versioniDiTuttiGliStudenti` (versioni-compito.ts).
- Produces:
  - `export type VerificaLetta = { compitoId: string; classeId: string; assignedById: string; createdAt: Date; durataMinuti: number; avvioProgrammatoAt: Date | null; avviataAt: Date | null; chiusaAt: Date | null; pubblicataAt: Date | null; minutiExtra: number; calcolatrice: ModoStrumento; formulario: ModoStrumento; formularioFile: string | null; layout: LayoutBlocco[]; stato: StatoVerifica };`
  - `export async function sincronizzaVerifica(compitoId: string, ora?: Date): Promise<VerificaLetta | null>` — null se non esiste, non è verifica o è ritirata. In ordine, ciascuno con `updateMany` condizionato (idempotente sotto concorrenza): (1) `avviataAt` null e `avvioProgrammatoAt ≤ ora` ⇒ `avviataAt = avvioProgrammatoAt` + `copiaMisureAllAvvio`; (2) ogni prova entrata, non consegnata, con `ora > scadenza + GRAZIA_MS` ⇒ `consegnaProvaTx(tx, provaId, scadenza, true)`; (3) IN_CORSO e ogni iscritto consegnato o con scadenza + grazia passata (per chi non ha riga: scadenza con le misure della classe e `minutiExtra` della verifica) ⇒ `chiusaAt` = la più tarda fra quelle scadenze (o `ora` se tutti hanno consegnato).
  - `export function scadenzaDellaProva(v: VerificaLetta, p: { inizioAt: Date | null; recupero: boolean; tempoExtraPct: number; minutiExtra: number }): Date | null` — null se non avviata; recupero: inizio = `inizioAt`, senza `v.minutiExtra`.
  - `export async function consegnaProvaTx(tx: Prisma.TransactionClient, provaId: string, quando: Date, automatica: boolean): Promise<boolean>` — `updateMany` su `consegnataAt: null` e poi tentativi `IN_PROGRESS` → `COMPLETED` con `completedAt = quando`; false se era già consegnata.
  - `export type EsitoAzione = { ok: true } | { ok: false; motivo: "non_trovata" | "stato_non_valido" | "studenti_non_validi" | "valore_non_valido" };`
  - `export async function avviaVerifica(compitoId: string, teacherId: string, ora?: Date): Promise<EsitoAzione>` — solo PREPARATA; `avviataAt = ora`; `copiaMisureAllAvvio`: per ogni iscritto con `MisurePdp` e senza `ProvaVerifica`, crea la riga con le misure copiate (le righe già create in PREPARATA dal docente restano come sono).
  - `export async function chiudiVerifica(compitoId: string, teacherId: string, ora?: Date): Promise<EsitoAzione>` — solo IN_CORSO; consegna automaticamente (`quando = ora`) ogni prova aperta, recuperi compresi, poi `chiusaAt = ora`.
  - `export async function aggiungiMinuti(compitoId: string, teacherId: string, minuti: number, studentId?: string, ora?: Date): Promise<EsitoAzione>` — `minuti` intero 1–120; senza studente ⇒ `Verifica.minutiExtra += minuti`; con studente ⇒ `ProvaVerifica.minutiExtra += minuti` (upsert con le misure della classe se manca); solo su verifica avviata e prova non consegnata.
  - `export function recuperabile(p: { consegnataAt: Date | null; recupero: boolean; inizioAt: Date | null } | null, risposte: number): boolean` — nessuna prova, o prova consegnata con zero esercizi con risposta (`haRisposta`).
  - `export async function avviaRecupero(compitoId: string, teacherId: string, studentIds: string[], ora?: Date): Promise<EsitoAzione>` — stato IN_CORSO/CHIUSA/PUBBLICATA; ogni studente iscritto e `recuperabile`, altrimenti `studenti_non_validi` e nulla scritto; upsert: `recupero true, inizioAt ora, consegnataAt null, consegnaAutomatica false, pubblicataAt null, minutiExtra 0`, misure mantenute se la riga c'era, altrimenti copiate dalla classe; `posizioni` e tentativi esistenti mantenuti (stesse domande, stessi semi; i tentativi tornano `IN_PROGRESS`).
  - `export async function chiudiRecupero(compitoId: string, teacherId: string, studentIds: string[], ora?: Date): Promise<EsitoAzione>` — consegna (`automatica true`) le prove di recupero aperte di quegli studenti.
  - `export async function modificaVerificaPreparata(compitoId: string, teacherId: string, campi: { durataMinuti?: number; avvioProgrammatoAt?: Date | null; calcolatrice?: ModoStrumento; formulario?: ModoStrumento; formularioFile?: string | null }): Promise<EsitoAzione>` — solo PREPARATA (stesse regole di creazione: durata 5–300, orario futuro, formulario esistente). Esercizi e punti non si cambiano (Scelte mie).
  - `export async function misureDellaVerifica(compitoId: string, teacherId: string): Promise<{ studentId: string; nome: string; misure: MisurePdpValori; personalizzate: boolean }[] | null>` — iscritti con misure di classe o riga di prova; `personalizzate` = c'è una `ProvaVerifica` con misure.
  - `export async function salvaMisureVerifica(compitoId: string, teacherId: string, studentId: string, misure: MisurePdpValori): Promise<EsitoAzione>` — solo PREPARATA; upsert della `ProvaVerifica` con le misure (anche tutte vuote: «niente misure per questa verifica»).
  - `export type RigaMonitoraggio = { studentId: string; nome: string; stato: "non_entrato" | "in_corso" | "consegnato" | "consegnato_auto"; recupero: boolean; risposti: number; totale: number; scadenza: Date | null; secondiResidui: number | null; tempoExtraPct: number; minutiExtra: number; uscite: number; secondiFuori: number; ultimoSalvataggioAt: Date | null; recuperabile: boolean };`
  - `export type Monitoraggio = { verifica: VerificaLetta; titolo: string; classe: string; oraServer: Date; conTempoResiduo: number; recuperiAperti: number; righe: RigaMonitoraggio[] };` — nessun punteggio. `uscite` = numero di `USCITA`; `secondiFuori` = Σ `durataMs` dei `RIENTRO` + l'eventuale uscita ancora aperta fino a `ora`.
  - `export async function monitoraggioVerifica(compitoId: string, teacherId: string, ora?: Date): Promise<Monitoraggio | null>` — chiama `sincronizzaVerifica`; null se non autorizzato (`haTitoloSulCompito`) o non trovata.
  - Rotte (tutte `requireTeacher`, 404 se non autorizzato o non verifica, rate limit `esercizi:verifiche:{teacherId}` 120/min — il polling a 5 s ne usa 12):
    - `GET /api/esercizi/verifiche/[id]` → `Monitoraggio` (date ISO).
    - `PATCH /api/esercizi/verifiche/[id]` → `modificaVerificaPreparata`.
    - `POST /api/esercizi/verifiche/[id]/azioni` body `{ azione: "avvia" } | { azione: "chiudi" } | { azione: "minuti"; minuti: number; studentId?: string } | { azione: "recupero"; studentIds: string[] } | { azione: "chiudiRecupero"; studentIds: string[] } | { azione: "pubblica"; studentIds?: string[] }` (`pubblica` collegata nel Task 11; fino ad allora 400). Stati: `non_trovata` 404, `stato_non_valido` 409, `studenti_non_validi` 400, `valore_non_valido` 400.
    - `GET/PUT /api/esercizi/verifiche/[id]/misure` → `misureDellaVerifica` / `salvaMisureVerifica` (`{ studentId, misure }`).

- [ ] **Step 1: Test** (`verifiche.test.ts`, prefisso `verifichetest-`, verifica creata con `assegnaCompito` del Task 4, `ora` passata esplicitamente):
  - avvio programmato: `sincronizzaVerifica(id, programmato + 1 min)` ⇒ `avviataAt = programmato` (non l'ora della lettura) e stato IN_CORSO; due chiamate concorrenti (`Promise.all`) ⇒ una sola copia delle misure.
  - `avviaVerifica` copia le misure dei soli iscritti con `MisurePdp`; una riga creata in PREPARATA con `salvaMisureVerifica(... MISURE_VUOTE)` resta vuota anche se la classe ha misure; modificare `MisurePdp` dopo l'avvio non cambia la prova (Review Focus 5).
  - scadenza: durata 60, prova con 30 %, `minutiExtra` verifica 5 ⇒ avvio + 83 min; recupero avviato alle 12:00 ⇒ 13:18 (senza i 5 di tutti).
  - consegna pigra: prova entrata, `ora = scadenza + 29 s` ⇒ ancora aperta; `ora = scadenza + 31 s` ⇒ `consegnataAt = scadenza`, `consegnaAutomatica`, tentativi `COMPLETED`.
  - chiusura automatica: tutti consegnati ⇒ CHIUSA; un iscritto mai entrato senza misure ⇒ CHIUSA solo dopo avvio + durata + grazia.
  - `chiudiVerifica` consegna anche chi ha tempo extra residuo; `conTempoResiduo` lo contava prima.
  - `aggiungiMinuti` a uno studente sposta solo la sua scadenza; a tutti tutte (non i recuperi); su prova consegnata ⇒ `stato_non_valido`.
  - recupero: studente con prova consegnata e zero risposte ⇒ riaperto con stesse `posizioni` e stessi semi; studente con una risposta ⇒ `studenti_non_validi`; `chiudiRecupero` lo riconsegna; in PREPARATA ⇒ `stato_non_valido`.
  - `modificaVerificaPreparata` dopo l'avvio ⇒ `stato_non_valido`.
  - monitoraggio: iscritto senza riga ⇒ `non_entrato`; un'uscita aperta da 40 s conta 40 in `secondiFuori`; nessun campo `score` nell'oggetto; un docente estraneo ⇒ null.
  - Rotte: 401, 404 per docente estraneo, 409 `stato_non_valido`, corpo `azioni` non valido ⇒ 400, `GET` serializza le date in ISO.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): avvio, chiusura, minuti e recuperi di una verifica`.

### Task 6: La prova dello studente lato server

**Files:**
- Create: `src/lib/esercizi/prova-verifica.ts`
- Create: `src/lib/esercizi/stato-schema.ts` (lo schema zod di `QuestionState` spostato da `tentativi/[id]/risposta/route.ts`, che lo importa: nessun cambio di comportamento)
- Create: `src/app/api/esercizi/verifiche/[id]/prova/route.ts` (POST entra, GET tempo), `.../prova/risposte/route.ts` (PUT), `.../prova/consegna/route.ts` (POST), `.../prova/eventi/route.ts` (POST), `src/app/api/esercizi/verifiche/[id]/formulario/route.ts` (GET, docente o studente)
- Test: `src/lib/esercizi/__tests__/prova-verifica.test.ts`, `src/app/api/esercizi/__tests__/prova-verifica-route.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 3, Task 5 (`sincronizzaVerifica`, `scadenzaDellaProva`, `consegnaProvaTx`), `versioniDelloStudente` (versioni-compito.ts), `ricalcola` (marking.ts), `leggiFormulario` (Task 4).
- Produces:
  - `export type StatoProvaStudente = "non_iniziata" | "aperta" | "consegnata" | "chiusa" | "risultati";`
  - `export type IntroProva = { compitoId: string; quando: Date /* avvioProgrammatoAt ?? avviataAt ?? createdAt */; durataMinuti: number; esercizi: number; stato: StatoProvaStudente; giaEntrato: boolean };` — nessuna misura PDP esposta (la durata mostrata è quella della verifica).
  - `export async function introProva(compitoId: string, studentId: string, ora?: Date): Promise<IntroProva | null>` — nessuna scrittura oltre a `sincronizzaVerifica`; null se non iscritto/ritirata/non verifica. `esercizi` = quanti ne avrà lui (con «meno esercizi» il numero ridotto: lo vede solo lui).
  - `export async function verificheDelloStudente(studentId: string, ora?: Date): Promise<{ id: string; quando: Date; stato: StatoProvaStudente }[]>` — verifiche non ritirate delle sue classi, più recenti prima. `non_iniziata` in PREPARATA; `aperta` se può entrare (IN_CORSO senza consegna, o recupero aperto); `consegnata` se la sua prova è consegnata e non pubblicata; `chiusa` se la verifica è chiusa e lui non l'ha mai svolta; `risultati` se la sua prova ha `pubblicataAt`.
  - `export type EsercizioProva = { tentativoId: string; numero: number; seed: string; content: unknown /* contenutoPerVerifica */; state: QuestionState | null };`
  - `export type ProvaAperta = { esercizi: EsercizioProva[]; scadenza: Date; oraServer: Date; calcolatrice: boolean; formulario: boolean; formularioTipo: "immagine" | "pdf" | null };` — `calcolatrice` = modo `TUTTI` o (`SOLO_PDP` e misura); `formulario` uguale, e solo con `formularioFile`.
  - `export type MotivoProva = "non_trovata" | "non_iniziata" | "chiusa" | "consegnata" | "tempo_scaduto" | "invalid_state";`
  - `export async function entraNellaProva(compitoId: string, studentId: string, ora?: Date): Promise<{ ok: true; prova: ProvaAperta } | { ok: false; motivo: MotivoProva }>` — PREPARATA ⇒ `non_iniziata`; senza riga e verifica CHIUSA/PUBBLICATA ⇒ `chiusa`; consegnata ⇒ `consegnata`. Upsert della `ProvaVerifica` (misure copiate da `MisurePdp` della classe se la riga non c'è); al primo ingresso (`entrataAt` null) fissa `posizioni = posizioniDellaProva(layout, esercizi, menoEsercizi).map(p => p.posizione)` con le versioni da `versioniDelloStudente`, crea i tentativi con `createMany({ skipDuplicates: true })` (`compitoId` = la verifica, `provaId`, `seed: randomUUID()`) e rilegge: due ingressi concorrenti danno gli stessi tentativi. Idempotente: le volte successive restituisce lo stato salvato.
  - `export async function salvaRisposta(compitoId: string, studentId: string, tentativoId: string, state: QuestionState, ora?: Date): Promise<{ ok: true; salvatoAt: Date; scadenza: Date } | { ok: false; motivo: MotivoProva }>` — tentativo della SUA prova di QUESTA verifica, altrimenti `non_trovata`; `ora > scadenza + GRAZIA_MS` ⇒ `tempo_scaduto` (e consegna automatica via sincronizza); `ricalcola` sul contenuto originale (eccezione ⇒ `invalid_state`); scrittura con `updateMany({ where: { id, status: "IN_PROGRESS" } })` — conteggio 0 ⇒ `consegnata` (guardia atomica contro «Chiudi» e «Consegna» in volo); aggiorna `ultimoSalvataggioAt`. Nessun punteggio in uscita.
  - `export async function consegnaProva(compitoId: string, studentId: string, ora?: Date): Promise<{ ok: true } | { ok: false; motivo: MotivoProva }>` — idempotente (già consegnata ⇒ ok); `consegnaProvaTx(tx, id, ora, false)`.
  - `export type EventoInput = { tipo: "USCITA" | "RIENTRO"; motivo?: "SCHERMO_INTERO" | "SCHEDA" | "FOCUS"; at: string /* ISO, ora server stimata dal client */; durataMs?: number };`
  - `export async function registraEventi(compitoId: string, studentId: string, eventi: EventoInput[], ora?: Date): Promise<{ ok: true } | { ok: false; motivo: MotivoProva }>` — max 50 per chiamata; `at` limitato a [entrata, ora]; `durataMs` limitato a [0, ora − entrata]; accettati anche dopo la consegna (un rientro arriva spesso dopo), mai prima dell'ingresso.
  - `export async function tempoProva(compitoId: string, studentId: string, ora?: Date): Promise<{ scadenza: Date; oraServer: Date; consegnata: boolean } | null>`
  - `export async function puoVedereFormulario(compitoId: string, utente: { id: string; role: string }, ora?: Date): Promise<boolean>` — docente con titolo sempre; studente solo se la sua prova è aperta (non consegnata, entro scadenza + grazia) e `formulario` gli spetta.
  - Rotte studente (`requireStudent`, rate limit `esercizi:prova:{studentId}` 300/min — il salvataggio automatico è fitto; eventi 60/min a parte): `POST .../prova` → 200 `ProvaAperta`; `GET .../prova` → tempo; `PUT .../prova/risposte` body `{ tentativoId, state }` (schema da `stato-schema.ts`) → 200 `{ salvatoAt, scadenza, oraServer }`; `POST .../prova/consegna` → 200 `{ ok: true }`; `POST .../prova/eventi` → 204. Stati: `non_trovata` 404, `invalid_state` 400, gli altri 409 con `{ error: motivo, oraServer }`. `GET .../formulario` → il file con `Content-Type` giusto, `Content-Disposition: inline`, `Cache-Control: private, no-store`; 404 altrimenti.

- [ ] **Step 1: Test** (`prova-verifica.test.ts`, prefisso `provaverificatest-`, esercizi di prova con un contenuto che ha `advice` e due parti):
  - PREPARATA ⇒ `non_iniziata`; dopo `avviaVerifica` ⇒ prova con N esercizi numerati 1..N, `content` senza `advice`; seconda chiamata ⇒ stessi `tentativoId` e semi; due chiamate concorrenti ⇒ una `ProvaVerifica`, N tentativi (Review Focus 3).
  - studente con «meno esercizi» (layout del Task 4) ⇒ esercizi numerati 1..3 senza buchi, `posizioni = [0,1,3]`.
  - iscritto dopo l'avvio con misure di classe 50 % ⇒ entra e la sua scadenza usa il 50 % (Review Focus 5).
  - `salvaRisposta` ⇒ `state`, `score`, `maxScore` scritti sul tentativo, risultato senza `score`; tentativo di un altro studente ⇒ `non_trovata`; dopo `chiudiVerifica` ⇒ `consegnata` e lo stato precedente resta (Review Focus 4); a `scadenza + 20 s` ⇒ ok; a `scadenza + 31 s` ⇒ `tempo_scaduto` e prova consegnata automaticamente; stato con un `seed` falso ⇒ il seme del tentativo vince.
  - `consegnaProva` due volte ⇒ ok entrambe, tentativi `COMPLETED`, `consegnaAutomatica` false; poi `salvaRisposta` ⇒ `consegnata`.
  - verifica CHIUSA, studente senza prova ⇒ `chiusa`; con recupero avviato ⇒ entra.
  - `registraEventi` con `at` prima dell'ingresso ⇒ riportato all'ingresso; 51 eventi ⇒ rifiutato.
  - `puoVedereFormulario`: studente senza misura con modo `SOLO_PDP` ⇒ falso; con modo `TUTTI` ⇒ vero; dopo la consegna ⇒ falso; docente ⇒ vero.
  - `verificheDelloStudente`: PREPARATA ⇒ `non_iniziata`; non compare in `compitiDelloStudente`.
  - Rotte: corpo `risposte` con `state.parts: [null]` ⇒ 400; risposta 200 di `risposte` non contiene le chiavi `score`, `maxScore`, `feedback`; 409 porta `oraServer`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa (prima lo spostamento dello schema in `stato-schema.ts` e `npx vitest run src/app/api/esercizi/__tests__/route.test.ts` verde). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): la prova dello studente sul server`.

### Task 7: «Nuovo compito» con l'opzione Verifica

**Files:**
- Modify: `src/app/(dashboard)/dashboard/esercizi/compiti/nuovo/nuovo-compito-client.tsx`, `page.tsx` (precompila `?tipo=verifica`), `src/messages/it.json`, `en.json` (`esercizi.verifica.creazione`)
- Modify: `src/app/(dashboard)/dashboard/esercizi/compiti/page.tsx` (etichetta «Verifica» e link alla pagina della verifica, dal `tipo` del Task 2)
- Test: `src/app/(dashboard)/dashboard/esercizi/compiti/nuovo/__tests__/nuovo-compito-client.test.tsx` (casi nuovi), `compiti/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: Task 4 (corpo di `POST /api/esercizi/compiti`, `POST /api/esercizi/verifiche/formulari`, campi `Blocco`), `caricaModello` (porta i campi verifica).
- Produces (UI):
  - In cima alla pagina un interruttore **Compito / Verifica** (default Compito; i compiti restano identici: nessun campo nuovo visibile in modo Compito).
  - In modo Verifica, su ogni blocco: «Punti per esercizio» (numero, passo 0,5, min 0,5, default 1); blocco casuale: «Quanti per gli studenti con meno esercizi» (0..quanti, default = quanti, segue `quanti` finché il docente non lo tocca); blocco scelti: per ogni esercizio una spunta «non per PDP».
  - Zona date: al posto di «apre il / scade il» «Durata (minuti)» obbligatoria (5–300) e «Avvio»: «quando premo Avvia» (default) / «a un orario» (`datetime-local`, mandato come ISO).
  - «Formulario (facoltativo)»: input file (png, jpg, webp, pdf) caricato subito su `withBasePath("/api/esercizi/verifiche/formulari")`, con nome del file e «Togli»; «Strumenti»: calcolatrice e formulario, ciascuno «Nessuno / Solo chi ha la misura PDP / Tutti» (default Solo PDP; il formulario disabilitato finché non c'è un file).
  - Riepilogo: «Totale della verifica: X punti» (`Σ richiesti × punti`) e «Con meno esercizi: Y esercizi»; Y = 0 ⇒ avviso e «Crea la verifica» disabilitato.
  - Pulsante «Crea la verifica per {classe}»; successo ⇒ `router.push("/dashboard/esercizi/verifiche/{id}")`. Errori `verifica_non_valida`, `pdp_senza_esercizi`, `formulario_non_trovato` con un messaggio tradotto ciascuno.

- [ ] **Step 1: Test** — in modo Verifica i campi data spariscono e compare «Durata»; Crea disabilitato senza durata; il corpo inviato contiene `tipo: "VERIFICA"`, `verifica: { durataMinuti: 50, calcolatrice: "SOLO_PDP", formulario: "NESSUNO" }` e blocchi con `punti: 2, quantiPdp: 3`; spunta «non per PDP» ⇒ `nonPerPdp: ["e2"]`; «a un orario» ⇒ `avvioProgrammatoAt` ISO; upload formulario ⇒ `formularioFile` nel corpo e select del formulario abilitato; totale punti mostrato «Totale della verifica: 10 punti» per 5 esercizi × 2; in modo Compito il corpo è identico a prima (nessuna chiave `tipo`/`verifica`/`punti`); `?modello=` con regole che hanno `punti` ⇒ i campi precompilati; l'elenco compiti mostra «Verifica» con link `/dashboard/esercizi/verifiche/{id}`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `eslint`, `tsc`.
- [ ] **Step 5:** Commit `feat(esercizi): creare una verifica dalla pagina Nuovo compito`.

### Task 8: Componenti della prova

**Files:**
- Create: `src/components/esercizi/player/risposte.ts` (sposta da `player-esercizio.tsx`, che li importa: `rispostaDaStato`, `preparaRispostaPerMotore`, `trovaStato`), e esporta `VoceFeedback` e `SpiegazioneParte` da `player-esercizio.tsx` senza cambiarli
- Create: `src/components/esercizi/verifica/esercizio-verifica.tsx`, `coda-salvataggi.ts`, `orologio-server.ts`, `calcolatrice.ts`, `calcolatrice-pannello.tsx`, `formulario-pannello.tsx`
- Test: `src/components/esercizi/verifica/__tests__/esercizio-verifica.test.tsx`, `coda-salvataggi.test.ts`, `orologio-server.test.ts`, `calcolatrice.test.ts`, `calcolatrice-pannello.test.tsx`; `src/components/esercizi/player/__tests__/player-esercizio.test.tsx` invariato e verde

**Interfaces:**
- Consumes: Task 6 (forma di `EsercizioProva`, rotta `PUT .../prova/risposte`, codici 409).
- Produces:
  - `EsercizioVerifica` props `{ esercizio: EsercizioProva; locale: "it" | "en"; disabilitato: boolean; onStato: (tentativoId: string, state: QuestionState, risposto: boolean) => void; onUscitaCampo: () => void }`. Carica la domanda come il player (`restoreQuestion`/`loadQuestion` + `opzioniMotore`), mostra testo e `InputParte`; **nessun** pulsante Invia/Riprova/Ricomincia, nessun `VoceFeedback`, nessuna soluzione, nessun punteggio. Traduzione nel `state` del motore: a ogni cambio (debounce 700 ms) e al `blur` di un campo, per la parte toccata `parteEngine.submit(preparaRispostaPerMotore(parte, valore))` sulla domanda locale (il risultato si scarta) e `onStato(id, q.toState(), haRisposta(q.toState()))`; se `submit` lancia (risposta non interpretabile, es. campo svuotato) lo stato della parte resta quello precedente e il campo conta come «non risposto» finché non diventa valido. Il contenitore del testo ha `onCopy`/`onContextMenu` con `preventDefault` e `select-none`; i campi di risposta no (incollare resta permesso).
  - `coda-salvataggi.ts`: `export class CodaSalvataggi { constructor(o: { compitoId: string; studentId: string; invia: (tentativoId: string, state: QuestionState) => Promise<{ ok: true; oraServer: string; scadenza: string } | { ok: false; definitivo: boolean; motivo?: string; oraServer?: string }>; storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">; onCambio: (s: StatoCoda) => void; ritardi?: number[] }); metti(tentativoId: string, state: QuestionState): void; svuota(): Promise<void>; pendenti(): Map<string, QuestionState>; ferma(): void }` con `export type StatoCoda = { fase: "salvato" | "in_salvataggio" | "non_salvato" | "chiuso"; motivo?: string; ultimoSalvataggio?: Date; oraServer?: string; scadenza?: string }`. Per tentativo vince l'ultimo stato; chiave localStorage `savint:verifica:{compitoId}:{studentId}`; nuovi tentativi con ritardi `[1000, 2000, 4000, 8000, 15000]` (poi 15 s fissi) e subito all'evento `online`; un esito `definitivo` (409 `tempo_scaduto`/`consegnata`/`chiusa`, 404) svuota la coda e il localStorage e passa a `chiuso` col motivo; il localStorage si legge in costruzione (sopravvive a un refresh) e si scrive a ogni `metti`, protetto da try/catch (storage negato ⇒ resta in memoria).
  - `orologio-server.ts`: `export function scarto(oraServerIso: string, oraLocale: number): number`; `export function millisecondiResidui(scadenzaIso: string, scartoMs: number, oraLocale: number): number` (mai negativo); `export function formattaResiduo(ms: number): string` («mm:ss», «h:mm:ss» oltre l'ora).
  - `calcolatrice.ts`: `export function valuta(espressione: string): { ok: true; valore: number } | { ok: false }` — parser proprio (niente `eval`/`Function`): numeri con virgola o punto, `+ − × ÷ * /`, parentesi, `^`, `√` prefisso, `%` postfisso (= /100), meno unario; divisione per zero e risultati non finiti ⇒ `{ ok: false }`.
  - `CalcolatricePannello` props `{ aperto: boolean; onChiudi: () => void }`: pannello sovrapposto `fixed` (dentro lo schermo intero), tasti e campo, risultato con la virgola in it.
  - `FormularioPannello` props `{ src: string /* già withBasePath */; tipo: "immagine" | "pdf"; aperto: boolean; onChiudi: () => void }`: pannello laterale; immagine con `<img>`, PDF con `<iframe>` della stessa origine.

- [ ] **Step 1: Test**:
  - `esercizio-verifica.test.tsx`: con un contenuto a due parti nessun `button` con nome «Invia», «Riprova», «Ricomincia», nessun testo «Risposta corretta»/«Risposta sbagliata» né `role="status"` di feedback dopo aver scritto; scrivere e attendere 700 ms (fake timers) ⇒ `onStato` una volta con uno `state` la cui parte ha `answer` = il testo e `risposto: true`; `blur` prima dei 700 ms ⇒ `onStato` subito; `copy` sul testo della domanda ⇒ `defaultPrevented`.
  - `coda-salvataggi.test.ts`: due `metti` sullo stesso tentativo ⇒ un solo invio con l'ultimo stato; invio che fallisce (rete) ⇒ fase `non_salvato`, ritenta dopo 1 s, poi `salvato`; esito definitivo `tempo_scaduto` ⇒ fase `chiuso`, coda e storage vuoti, nessun altro invio (Review Focus 2); una nuova `CodaSalvataggi` con lo stesso storage trova i pendenti; storage che lancia ⇒ funziona in memoria.
  - `orologio-server.test.ts`: server avanti di 10 min rispetto al PC ⇒ `millisecondiResidui` calcolato sull'ora del server (Review Focus 1); scadenza passata ⇒ 0; `formattaResiduo(65_000) = "01:05"`, `formattaResiduo(3_725_000) = "1:02:05"`.
  - `calcolatrice.test.ts`: `"2+3×4" = 14`, `"(2+3)×4" = 20`, `"2^3^2" = 512`, `"√16+1" = 5`, `"50%×80" = 40`, `"-3+5" = 2`, `"3,5×2" = 7`, `"1/0"` ⇒ `ok: false`, `"alert(1)"` ⇒ `ok: false`.
  - `calcolatrice-pannello.test.tsx`: premere «7», «×», «6», «=» mostra «42».
- [ ] **Step 2:** Run `npx vitest run src/components/esercizi` → i nuovi FAIL.
- [ ] **Step 3:** Implementa (prima lo spostamento in `risposte.ts`, poi `npx vitest run src/components/esercizi/player` verde).
- [ ] **Step 4:** Run → PASS; `eslint src/components/esercizi`.
- [ ] **Step 5:** Commit `feat(esercizi): componenti della prova di verifica`.

### Task 9: Pagina della prova e home dello studente

**Files:**
- Create: `src/app/(student)/studente/verifica/[id]/page.tsx` (server: `introProva`; i risultati pubblicati arrivano nel Task 11), `src/app/(student)/studente/verifica/[id]/prova-verifica-client.tsx`, `src/components/esercizi/verifica/usa-sorveglianza.ts`
- Modify: `src/app/(student)/studente/page.tsx` (sezione «Verifiche» da `verificheDelloStudente`, sopra i compiti), `src/messages/it.json`, `en.json` (`esercizi.provaStudente`)
- Test: `src/app/(student)/studente/verifica/__tests__/prova-verifica-client.test.tsx`, `src/components/esercizi/verifica/__tests__/usa-sorveglianza.test.ts`, `src/app/(student)/studente/__tests__/page.test.tsx` (casi nuovi)

**Interfaces:**
- Consumes: Task 6 (rotte e tipi `IntroProva`, `ProvaAperta`, `verificheDelloStudente`), Task 8 (tutti i componenti).
- Produces:
  - `usaSorveglianza({ attiva: boolean; scartoMs: number; onEvento: (e: EventoInput) => void }): { fuori: boolean; rientra: () => Promise<void> }` — un **episodio** di uscita inizia alla prima fra: `fullscreenchange` senza `document.fullscreenElement` (motivo `SCHERMO_INTERO`), `visibilitychange` a `hidden` (`SCHEDA`), `blur` della finestra che dura oltre 2 s (`FOCUS`, con `at` = inizio del blur); finisce quando schermo intero, visibile e focus sono tutti di nuovo veri ⇒ `RIENTRO` con `durataMs`. Un solo `USCITA` per episodio. `at` in ISO sull'ora del server (`Date.now() + scartoMs`). Gli eventi si inviano a lotti (`POST .../prova/eventi`, ritentati come la coda; un lotto perso non blocca nulla).
  - `ProvaVerificaClient` props `{ compitoId: string; studentId: string; intro: IntroProva; locale: "it" | "en" }`. Fasi:
    1. **Intro**: durata, numero di esercizi, regola «resta a schermo intero»; pulsante «Inizia la verifica» (o «Riprendi la verifica» se `giaEntrato`) ⇒ `document.documentElement.requestFullscreen()` (un rifiuto non blocca: la prova parte e l'uscita è registrata) e `POST .../prova`. `non_iniziata` ⇒ «Non ancora iniziata» con «Riprova»; `chiusa`/`consegnata` ⇒ schermata finale.
    2. **Prova**: overlay `fixed inset-0` sopra l'header dello studente. In alto conto alla rovescia (`orologio-server`, scarto ricalcolato a ogni risposta delle rotte), stato del salvataggio («Salvato» / «Salvataggio…» / «Non salvato, ritento»), «Calcolatrice» e «Formulario» solo se `ProvaAperta` li concede, «Consegna». Navigazione numerata 1..N con «risposto / non risposto» (mai giusto/sbagliato), avanti/indietro liberi; cambiare esercizio forza `coda.svuota()`. Tutti gli `EsercizioVerifica` restano montati (nascosti quelli non correnti) così lo stato locale non si perde. Al montaggio gli stati pendenti della coda (localStorage) sostituiscono quelli del server per i rispettivi tentativi e partono subito. Polling `GET .../prova` ogni 20 s (scadenza aggiornata da «+ minuti», consegna del docente ⇒ schermata finale).
    3. **Sovrapposizione** quando `fuori`: «Sei uscito dallo schermo intero — rientra» con pulsante che chiama `rientra()`; la prova sotto resta attiva.
    4. **Consegna**: dialogo «Ci sono {n} parti senza risposta. Consegnare?» (n contato sulle parti locali senza risposta); conferma ⇒ `coda.svuota()` poi `POST .../prova/consegna` ⇒ «Verifica consegnata», `document.exitFullscreen()`. Allo zero dell'orologio: la stessa sequenza senza dialogo («Tempo scaduto: la verifica è stata consegnata»). Coda `chiuso` ⇒ stessa schermata finale col motivo.
  - Home: sezione «Verifiche» con una riga per verifica «Verifica del {data, ora}» e lo stato (Non ancora iniziata — non cliccabile / In corso — «Apri la verifica» → `/studente/verifica/{id}` / Consegnata / Risultati pubblicati — «Vedi i risultati»); assente se non ci sono verifiche. Nessun indizio delle misure PDP.

- [ ] **Step 1: Test** — client (fetch e `requestFullscreen` mockati, fake timers): «Inizia» chiama `requestFullscreen` e `POST withBasePath("/api/esercizi/verifiche/v1/prova")`; con `ProvaAperta` di 3 esercizi mostra «1 2 3», nessuna calcolatrice se `calcolatrice: false`, il pulsante se `true`; scrivere una risposta ⇒ dopo 700 ms `PUT .../prova/risposte` e «Salvato», la casella 1 diventa «risposto»; risposta 500 ⇒ «Non salvato, ritento»; con `oraServer` 10 minuti avanti e scadenza a +5 min server il timer mostra «05:00» (Review Focus 1); timer a zero ⇒ `POST .../prova/consegna` senza dialogo; «Consegna» con una parte vuota ⇒ dialogo con «1 parti senza risposta»; 409 `consegnata` al polling ⇒ schermata «Verifica consegnata»; nessun testo «Risposta corretta», «Punteggio», «Come si risolve» in nessuna fase. `usa-sorveglianza`: `visibilitychange` hidden poi visible ⇒ un `USCITA(SCHEDA)` e un `RIENTRO` con `durataMs`; blur di 1 s ⇒ nessun evento; blur di 3 s ⇒ `USCITA(FOCUS)` con `at` all'inizio del blur; uscita da schermo intero e cambio scheda insieme ⇒ un solo `USCITA`. Home: una verifica PREPARATA ⇒ «Non ancora iniziata» senza link; IN_CORSO ⇒ link `/studente/verifica/{id}`; nessuna verifica ⇒ nessuna sezione.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `eslint "src/app/(student)" src/components/esercizi`; `tsc`.
- [ ] **Step 5:** Verifica visiva: copia del repo nello scratchpad (il `.next/dev/lock` impedisce un secondo server nel repo), porta 3200, DB di sviluppo `quizlive` (mai `savint_video`: è il DB dei video e non va sporcato); una verifica avviata con Prisma; screenshot 1280 e 390 di intro, prova, sovrapposizione, consegna; spegnere e cancellare la copia.
- [ ] **Step 6:** Commit `feat(esercizi): la pagina della verifica per lo studente`.

### Task 10: Pagina della verifica per il docente (preparazione e monitoraggio)

**Files:**
- Create: `src/app/(dashboard)/dashboard/esercizi/verifiche/[id]/page.tsx` (server: `monitoraggioVerifica` come controllo di titolo ⇒ `notFound()`), `verifica-docente-client.tsx`, `impostazioni-verifica.tsx`, `monitoraggio-verifica.tsx`
- Modify: `src/messages/it.json`, `en.json` (`esercizi.verifica.docente`)
- Test: `src/app/(dashboard)/dashboard/esercizi/verifiche/__tests__/verifica-docente-client.test.tsx`, `__tests__/page.test.tsx`

**Interfaces:**
- Consumes: Task 5 (rotte `GET/PATCH /api/esercizi/verifiche/[id]`, `POST .../azioni`, `GET/PUT .../misure`, tipi `Monitoraggio`, `RigaMonitoraggio`), Task 3 (`MisurePdpDialog` riusato con `endpoint = /api/esercizi/verifiche/{id}/misure`), Task 6 (`GET .../formulario` per l'anteprima del docente).
- Produces (UI, token `--brand-*`):
  - Intestazione: titolo, classe, stato («Preparata», «In corso», «Chiusa», «Risultati pubblicati»), avvio previsto, durata, link al formulario.
  - **PREPARATA**: modulo `ImpostazioniVerifica` (durata, avvio, strumenti, sostituisci/togli formulario) ⇒ `PATCH`; elenco «Studenti con misure PDP» (`GET .../misure`) con «Modifica per questa verifica»; pulsante **Avvia** con conferma ⇒ `azioni {avvia}`; «Ritira la verifica» come per i compiti (`DELETE /api/esercizi/compiti/[id]`).
  - **IN_CORSO** (e in CHIUSA/PUBBLICATA sopra i risultati): tabella `MonitoraggioVerifica` con stato, «risposti / totale», tempo residuo (con «+{pct}%» e «+{min} min» se presenti, visibili solo al docente), uscite e minuti fuori, ultimo salvataggio, «+ minuti» per riga (5/10/15 o valore); pulsanti **+ minuti a tutti** e **Chiudi** (dialogo: «{n} studenti hanno ancora tempo. Chiudere per tutti?» con `conTempoResiduo`). Nessun punteggio.
  - Recupero: casella di selezione sulle righe `recuperabile` ⇒ «Avvia recupero ({n})» ⇒ `azioni {recupero}`; righe `recupero` aperte ⇒ «Chiudi recupero».
  - Polling `GET` ogni 5 s quando lo stato è IN_CORSO o `recuperiAperti > 0`, fermo quando la scheda è nascosta, e subito dopo ogni azione; in PREPARATA con avvio programmato, un solo polling al momento dell'avvio previsto.
  - In CHIUSA/PUBBLICATA lo spazio dei risultati è riempito dal Task 11 (qui un segnaposto «Risultati» per montare il componente).

- [ ] **Step 1: Test** — pagina: docente estraneo ⇒ `notFound`; client con monitoraggio IN_CORSO: righe con «non entrato», «2 / 5», «12:30», «3 uscite»; dopo 5 s (fake timers) un secondo `GET` con `withBasePath`; «Chiudi» apre il dialogo con «2 studenti hanno ancora tempo» e conferma ⇒ `POST .../azioni` `{ azione: "chiudi" }`; «+ minuti» su una riga ⇒ `{ azione: "minuti", minuti: 10, studentId }`; in PREPARATA compaiono Avvia e le impostazioni, non la tabella; selezionare due assenti e «Avvia recupero (2)» ⇒ `{ azione: "recupero", studentIds: [...] }`; in CHIUSA senza recuperi aperti nessun polling; nessun testo «punti» nella tabella di monitoraggio.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `eslint`, `tsc`.
- [ ] **Step 5:** Commit `feat(esercizi): monitoraggio della verifica per il docente`.

### Task 11: Correzione, pubblicazione e risultati dello studente

**Files:**
- Create: `src/lib/esercizi/risultati-verifica.ts`
- Create: `src/app/api/esercizi/verifiche/[id]/risultati/route.ts` (GET), `src/app/api/esercizi/verifiche/[id]/punti/route.ts` (PUT)
- Modify: `src/app/api/esercizi/verifiche/[id]/azioni/route.ts` (azione `pubblica`)
- Create: `src/components/esercizi/verifica/revisione-esercizio.tsx`, `src/app/(dashboard)/dashboard/esercizi/verifiche/[id]/risultati-verifica.tsx`, `src/app/(student)/studente/verifica/[id]/risultati-studente.tsx`
- Modify: `verifica-docente-client.tsx` (monta i risultati), `src/app/(student)/studente/verifica/[id]/page.tsx` (risultati quando pubblicati), `src/messages/it.json`, `en.json` (`esercizi.verifica.risultati`)
- Test: `src/lib/esercizi/__tests__/risultati-verifica.test.ts`, `src/app/api/esercizi/__tests__/risultati-verifica-route.test.ts`, `src/components/esercizi/verifica/__tests__/revisione-esercizio.test.tsx`, test dei due componenti di pagina

**Interfaces:**
- Consumes: Task 1 (`puntiCella`, `punteggioProva`, `totalePieno`), Task 5 (`sincronizzaVerifica`, `haTitoloSulCompito`), Task 8 (`risposte.ts`, `VoceFeedback`, `SpiegazioneParte`, `RispostaAttesa`).
- Produces:
  - `export type CellaRisultato = { posizione: number; tentativoId: string; esercizioId: string; titolo: string; punti: number; puntiMax: number; manuale: boolean };`
  - `export type RigaRisultato = { studentId: string; nome: string; stato: "assente" | "in_corso" | "consegnato" | "consegnato_auto"; recupero: boolean; menoEsercizi: boolean; celle: (CellaRisultato | null)[] /* lunghezza = posizioni del layout pieno; null = posizione non assegnata */; ottenuto: number; totaleStudente: number; finale: number; percentuale: number; uscite: number; secondiFuori: number; eventi: { tipo: "USCITA" | "RIENTRO"; motivo: string | null; at: Date; durataMs: number | null }[]; pubblicata: boolean };`
  - `export type Risultati = { stato: StatoVerifica; totalePieno: number; colonne: { posizione: number; punti: number }[]; righe: RigaRisultato[] };` — colonne per posizione («Esercizio 1..N»), così i modi CLASSE e STUDENTE hanno la stessa tabella; righe `in_corso` (recupero aperto) senza punti (celle null, totali 0).
  - `export async function risultatiVerifica(compitoId: string, teacherId: string, ora?: Date): Promise<{ ok: true; risultati: Risultati } | { ok: false; motivo: "non_trovata" | "stato_non_valido" }>` — solo CHIUSA/PUBBLICATA (durante la prova nessun punteggio, neanche al docente).
  - `export async function dettaglioRisposta(compitoId: string, teacherId: string, tentativoId: string): Promise<{ seed: string; content: unknown /* originale */; state: QuestionState | null; punti: number; puntiMax: number; manuale: boolean } | null>`
  - `export async function modificaPunti(compitoId: string, teacherId: string, tentativoId: string, punti: number | null): Promise<{ ok: true } | { ok: false; motivo: "non_trovata" | "stato_non_valido" | "valore_non_valido" }>` — `null` torna al calcolo automatico; valore in [0, punti della posizione], multiplo di 0,25; solo prova consegnata e verifica CHIUSA/PUBBLICATA (dopo la pubblicazione lo studente vede il valore aggiornato).
  - `export async function pubblicaRisultati(compitoId: string, teacherId: string, studentIds?: string[], ora?: Date): Promise<EsitoAzione>` — solo CHIUSA/PUBBLICATA; `Verifica.pubblicataAt ??= ora`; `ProvaVerifica.pubblicataAt = ora` per le prove consegnate non ancora pubblicate (tutte, o quelle degli `studentIds`). Così un secondo «Pubblica» pubblica i recuperi consegnati dopo.
  - `export async function risultatiDelloStudente(compitoId: string, studentId: string): Promise<{ finale: number; totalePieno: number; percentuale: number; esercizi: { numero: number; esercizioId: string; titolo: string; punti: number; puntiMax: number; seed: string; content: unknown; state: QuestionState | null }[] } | null>` — null se la sua prova non ha `pubblicataAt`. Niente eventi di uscita, niente cenno a misure o riproporzionamento (solo il totale finale su `totalePieno`).
  - `RevisioneEsercizio` props `{ seed: string; content: unknown; state: QuestionState | null; locale: "it" | "en" }` — sola lettura: domanda ricostruita dallo stato, risposte dello studente nei campi disabilitati, `VoceFeedback` per parte, risposta attesa e svolgimento visibili senza clic.
  - Rotte: `GET .../risultati` (docente) → `Risultati`, con `?tentativo={id}` → `dettaglioRisposta`; `PUT .../punti` `{ tentativoId, punti: number | null }`; `azioni {pubblica, studentIds?}`. 404 / 409 / 400 come nel Task 5.
  - UI docente: tabella studenti × esercizi con punti (le celle manuali evidenziate con un bordo `--brand-orange` e un'etichetta «modificato»), colonne Totale, %, Uscite; clic su una cella ⇒ pannello con `RevisioneEsercizio` e campo punti (passo 0,25) + «Torna al calcolo automatico»; clic sulle uscite ⇒ dettaglio orario; pulsante **Pubblica i risultati** (in PUBBLICATA: «Pubblica i nuovi» se ci sono prove consegnate non pubblicate). Nessun CSV (decisione: le statistiche degli esercizi non hanno un'esportazione CSV oggi).
  - UI studente: totale «{finale} / {totalePieno} punti ({percentuale}%)», poi per ogni esercizio «Esercizio {numero} — {punti}/{puntiMax}», `RevisioneEsercizio` e link «Esercitati di nuovo» → `/studente/esercizio/{esercizioId}` (pratica libera, nessun effetto sulla verifica). Prima della pubblicazione: «Risultati non ancora pubblicati».

- [ ] **Step 1: Test** — dominio (prefisso `risultativerificatest-`): IN_CORSO ⇒ `stato_non_valido`; dopo chiusura, uno studente con tutto giusto su un layout da 20 punti ⇒ `finale = 20`; uno studente con meno esercizi che fa 12 su 16 ⇒ `finale = 15`, `percentuale = 75`, celle null sulle posizioni escluse; assente ⇒ riga `assente`, totali 0, `recuperabile`; `modificaPunti(…, 1.3)` ⇒ `valore_non_valido`; `1.25` ⇒ cella `manuale`, totale aggiornato; `null` ⇒ di nuovo automatico; `risultatiDelloStudente` null prima di `pubblicaRisultati`, poi con `content` che contiene `advice`; dopo `avviaRecupero` + consegna in PUBBLICATA lo studente recuperato vede null finché un secondo `pubblicaRisultati` non lo pubblica, e gli altri restano pubblicati; il recuperato pubblicato può aprire l'esercizio in pratica (`esercizioApribileDaStudente`). Rotte: docente estraneo 404; `PUT punti` corpo non valido 400. Componenti: `RevisioneEsercizio` mostra la risposta dello studente nel campo disabilitato e la risposta attesa; la tabella evidenzia una cella `manuale`; il salvataggio dei punti manda `PUT withBasePath(".../punti")` con `{ tentativoId, punti: 1.25 }`; la vista studente non contiene «uscite» né «PDP».
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `eslint`, `tsc`.
- [ ] **Step 5:** Commit `feat(esercizi): correzione e pubblicazione dei risultati della verifica`.

### Task 12: Prova end-to-end e verifica finale

**Files:**
- Create: `tests/e2e/esercizi-verifica.spec.ts`

**Interfaces:**
- Consumes: tutto. Helper `login`, `cambiaAttore`, `gotoStabile`, `reloadStabile` copiati da `tests/e2e/esercizi-compiti.spec.ts`; scaffolding con Prisma e `RUN_ID` come lì (classe, raccolta con due esercizi, docente `docente@scuola.it`, uno studente); pulizia per riga in `afterAll`.

- [ ] **Step 1: Scrivi la prova** — docente: «Nuovo compito» `?raccolta=`, Verifica, blocco «prendi 2» a 2 punti, durata 10, «quando premo Avvia», Crea ⇒ pagina della verifica «Preparata»; Avvia. Studente: home mostra «In corso»; apre, «Inizia la verifica»; risponde al primo esercizio; attende «Salvato»; nessun testo «Risposta corretta»/«Punteggio» nella pagina; `reloadStabile` ⇒ «Riprendi», la risposta è ancora nel campo. Docente: il monitoraggio mostra «1 / 2» entro 10 s; «Chiudi» e conferma. Studente: ricaricando vede «Verifica consegnata». Docente: tabella risultati con un totale; «Pubblica i risultati». Studente: «Vedi i risultati» mostra «/ 4 punti».
- [ ] **Step 2:** Run `npx playwright test tests/e2e/esercizi-verifica.spec.ts` (server di prova su una porta libera, es. 3200, avviato da una copia nello scratchpad sul DB `quizlive`: i server già attivi sulla 3100 non si toccano; nessuna suite vitest in corso) → PASS; correggi ciò che fallisce nel task che possiede il codice.
- [ ] **Step 3:** `npx prisma generate` (se serve, comando a parte), poi la suite completa `npx vitest run` → verde.
- [ ] **Step 4:** `npx tsc --noEmit` pulito; `npx eslint --quiet src/lib/esercizi src/app/api/esercizi src/components/esercizi "src/app/(dashboard)/dashboard/esercizi" "src/app/(student)" packages/engine` senza errori.
- [ ] **Step 5:** Commit `test(e2e): ciclo intero di una verifica`. Push su main e attesa della CI solo con l'autorizzazione dell'utente.
