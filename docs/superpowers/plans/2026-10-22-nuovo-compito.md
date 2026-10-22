# Nuovo compito — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola pagina "Nuovo compito" (Per chi / Cosa a blocchi / Riepilogo con anteprima), due modi di estrazione (stesse domande per la classe, diverse per studente), modelli al posto dei "compiti preparati", e tutto il resto dell'app che legge le versioni di un compito per studente.

**Architecture:** Un modulo di dominio `src/lib/esercizi/estrazione.ts` risolve i blocchi in bacini (riusando `bacinoRegola` e le regole di accesso) e fa l'estrazione deterministica con un seme; `assegnaCompito` crea sempre una `Batteria` automatica come copia dei blocchi. Un'unica funzione `versioniDelloStudente` sostituisce ogni lettura diretta di `Compito.drawnVersionIds`. L'interfaccia è una pagina client con tre zone che chiede il riepilogo a una rotta senza scrittura.

**Tech Stack:** Next.js 16 app router, Prisma + PostgreSQL, next-intl, Tailwind, vitest + Testing Library (test di dominio sul DB di sviluppo con prefissi), Playwright per i video.

**Spec:** `docs/superpowers/specs/2026-10-22-nuovo-compito-design.md` (incluse le "Decisioni" in fondo, vincolanti).

## Global Constraints

- I `Compito` esistenti restano modo CLASSE con il loro `drawnVersionIds`: nessun compito già assegnato cambia esercizi.
- Estrazioni e conteggi sempre "come docente": `comeDocente(...)` + `ruoliEsercizi` di `src/lib/esercizi/accesso.ts`.
- Modo CLASSE: si assegna esattamente l'estrazione vista (stesso seme ⇒ stessa estrazione); se il bacino è cambiato ⇒ `estrazione_cambiata`.
- Modo STUDENTE: bacino di versioni congelato sul compito al momento di assegnare; estrazione per studente con seme `${drawSeed}:${studentId}`, memorizzata alla prima necessità e mai più cambiata.
- Blocchi pescati in ordine; un esercizio già preso da un blocco precedente non si riprende.
- Ogni compito ha la sua `Batteria` automatica; "Salva anche come modello" crea una `Batteria` non automatica nuova; i modelli non si modificano; eliminare un modello: solo il creatore o ADMIN (altrimenti 404); un modello a cui puntano compiti legacy si nasconde (`automatica = true`) invece di cancellarsi.
- Mai modificare una migrazione applicata; `prisma migrate dev --create-only` + `prisma migrate deploy` (il `migrate dev` interattivo si blocca sulla deriva nota `PracticeRun.expiresAt`); `prisma generate` in un comando separato prima della suite; applicare anche a `postgresql://kahoot:kahoot@localhost:5432/savint_video`.
- Mai due suite di test insieme sul DB di sviluppo.
- Testi in `src/messages/it.json` e `en.json` (in sincronia); commenti nel codice in italiano, nello stile dei file vicini.
- Commit per task sul branch `feat/nuovo-compito`; push solo alla fine (autorizzato dall'utente).

## Review Focus

1. Docente che preme "Assegna" dopo che un collega ha reso privato un esercizio del bacino → `estrazione_cambiata` e nuova anteprima, mai un compito diverso in silenzio (test Task 3).
2. Studente che si iscrive alla classe dopo l'assegnazione in modo STUDENTE → riceve un'estrazione dal bacino congelato, stabile tra due visite (test Task 4).
3. Blocco "scelti a mano" con un esercizio non più visibile → insufficiente con il titolo mancante, non un compito più corto (test Task 2).
4. Compito legacy (modo CLASSE, creato prima) → consegne, statistiche, stampa, percorso studente identici a prima (test Task 4).
5. Docente che elimina il modello di un collega → 404, nulla cancellato (test Task 5).

---

### Task 1: Schema e migrazione

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_nuovo_compito/migration.sql`
- Test: `src/lib/esercizi/__tests__/schema-nuovo-compito.test.ts`

**Interfaces — Produces (Prisma):**
- `enum ModoEstrazione { CLASSE STUDENTE }`
- `Compito.modo ModoEstrazione @default(CLASSE)`
- `Compito.bacini Json?` — solo modo STUDENTE: `{ count: number; versionIds: string[] }[]` nell'ordine dei blocchi.
- `Compito.modelloId String?` → relazione `modello Batteria? @relation("CompitiDaModello", onDelete: SetNull)` (la relazione esistente `batteria` resta quella della copia automatica).
- `model EstrazioneStudente { compitoId String; studentId String; versionIds String[]; createdAt DateTime @default(now()); @@id([compitoId, studentId]) }` con cascade su compito e studente (User).
- `BatteriaRegola.esercizioIds String[] @default([])` — forma "scelti a mano" (con `contenitoreId` e `argomento` nulli; `count` = numero di esercizi scelti).

- [ ] **Step 1: Test** — un `Compito` creato senza `modo` ha `modo = "CLASSE"`, `bacini = null`, `modelloId = null`; una `EstrazioneStudente` si cancella con il compito; cancellando la `Batteria` modello, `Compito.modelloId` diventa null; una `BatteriaRegola` con `esercizioIds: ["a","b"]` si rilegge uguale.
- [ ] **Step 2:** Run `npx vitest run src/lib/esercizi/__tests__/schema-nuovo-compito.test.ts` → FAIL.
- [ ] **Step 3:** Schema + migrazione (`--create-only`, controllare l'SQL, `migrate deploy`, poi `prisma generate`; poi `DATABASE_URL=...savint_video npx prisma migrate deploy`).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): schema per il nuovo compito`.

### Task 2: Blocchi, riepilogo ed estrazione

**Files:**
- Create: `src/lib/esercizi/estrazione.ts`
- Modify: `src/lib/esercizi/batterie.ts` (`formaRegola` e `bacinoRegola` riconoscono la forma "scelti"; `creaBatteria` accetta `esercizioIds`)
- Test: `src/lib/esercizi/__tests__/estrazione.test.ts`, `batterie.test.ts`

**Interfaces:**
- Consumes: `bacinoRegola(regola, chi, visibili?)`, `idsConVersione`, `ruoliEsercizi`, `comeDocente` (accesso.ts).
- Produces:
  - `type Blocco = { tipo: "argomento"; argomento: string; anno: number; difficoltaMax?: number; quanti: number } | { tipo: "raccolta"; contenitoreId: string; quanti: number } | { tipo: "scelti"; esercizioIds: string[] }`
  - `type EsercizioEstratto = { esercizioId: string; versioneId: string; titolo: string; content: unknown }`
  - `type RiepilogoBlocco = { etichetta: string; richiesti: number; disponibili: number; nonDisponibili: string[] /* titoli degli scelti a mano non più disponibili */ }`
  - `type Riepilogo = { blocchi: RiepilogoBlocco[]; duplicatiTolti: number; totale: number; sufficiente: boolean; esercizi: EsercizioEstratto[] /* vuoto se !sufficiente */ }`
  - `async function baciniDeiBlocchi(blocchi: Blocco[], chi: Utente): Promise<{ etichetta: string; candidati: string[] /* esercizioIds con versione, visibili */; richiesti: number; nonDisponibili: string[] }[]>`
  - `function estraiDaBacini(bacini: { candidati: string[]; richiesti: number }[], seme: string): string[] | null` — pura: seedrandom(seme), blocchi in ordine, esclusione dei già presi, Fisher–Yates come `assegna` oggi; null se un blocco è insufficiente dopo l'esclusione.
  - `async function riepilogoEstrazione(blocchi: Blocco[], chi: Utente, seme: string): Promise<Riepilogo>` — usa le ultime versioni.
  - `function bloccoDaRegola(regola) : Blocco` e `function regolaDaBlocco(b: Blocco): RegolaInput` (per modelli e copie).

- [ ] **Step 1: Test** — stesso seme ⇒ stessa estrazione, seme diverso ⇒ (con bacino ≥ 3) in generale diversa; blocco raccolta "prendi 10" con 6 esercizi ⇒ `sufficiente: false`, `disponibili: 6`; due blocchi che condividono esercizi ⇒ nessun duplicato e `duplicatiTolti` corretto; blocco "scelti" con un esercizio privato di un collega ⇒ `nonDisponibili` contiene il suo titolo **solo se il docente può vederlo**, altrimenti il titolo generico "Esercizio non disponibile" (mai il titolo di un esercizio invisibile), `sufficiente: false` (Review Focus 3); un ADMIN pesca come docente (esercizio privato di un collega escluso); `bacinoRegola` con forma scelti restituisce solo gli scelti visibili.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): blocchi e riepilogo dell'estrazione`.

### Task 3: Assegnare un compito

**Files:**
- Modify: `src/lib/esercizi/compiti.ts` (nuova `assegnaCompito`; `assegna` e `assegnaDiretto` diventano interne o vengono tolte se non più usate dopo il Task 7)
- Create: `src/app/api/esercizi/compiti/estrai/route.ts` (POST, nessuna scrittura)
- Modify: `src/app/api/esercizi/compiti/route.ts` (POST con il nuovo corpo)
- Test: `src/lib/esercizi/__tests__/assegna-compito.test.ts`, `src/app/api/esercizi/__tests__/compiti-route.test.ts`, `compiti-estrai-route.test.ts`

**Interfaces:**
- Consumes: Task 2.
- Produces:
  - `type InputAssegna = { classeId: string; teacherId: string; blocchi: Blocco[]; modo: "CLASSE" | "STUDENTE"; seme: string; versioniViste?: string[]; opensAt?: Date; dueAt?: Date; salvaModello?: { nome: string }; modelloId?: string }`
  - `async function assegnaCompito(i: InputAssegna): Promise<{ ok: true; compitoId: string } | { ok: false; motivo: "classe_non_trovata" | "non_insegni_questa_classe" | "esercizi_insufficienti" | "estrazione_cambiata" | "date_non_valide" | "modello_non_trovato" | "blocchi_non_validi"; riepilogo?: Riepilogo }>`
    - controlli di oggi su date e classe (stessi motivi);
    - crea la `Batteria` automatica copia dei blocchi (nome = titolo leggibile, es. "Equazioni (3) + Percentuali 2ª (2)");
    - CLASSE: `riepilogoEstrazione(blocchi, comeDocente, seme)`; se `versioniViste` è dato e diverso ⇒ `estrazione_cambiata` con il nuovo riepilogo; altrimenti `drawSeed = seme`, `drawnVersionIds` = versioni estratte;
    - STUDENTE: `bacini` = per blocco `{ count, versionIds }` (ultime versioni dei candidati, dopo l'esclusione dei duplicati fatta come nell'estrazione: un esercizio appartiene al primo blocco che lo contiene); `drawnVersionIds = []`; crea subito `EstrazioneStudente` per ogni studente iscritto (Task 4 `estrazioneDelloStudente`);
    - `salvaModello` ⇒ crea anche una `Batteria` non automatica con gli stessi blocchi e imposta `modelloId`; `modelloId` dato ⇒ deve esistere ed essere non automatica, si imposta;
    - tutto in una transazione dove possibile; in caso di rifiuto nessuna riga resta (come oggi `assegnaDiretto` pulisce la batteria).
  - Rotta `POST /api/esercizi/compiti/estrai` body `{ classeId, blocchi, seme }` → `Riepilogo` (classe del docente, anno dalla classe come oggi `compiti/diretto`); 404 classe non sua.
  - Rotta `POST /api/esercizi/compiti` body `{ classeId, blocchi, modo, seme, versioniViste?, opensAt?, dueAt?, salvaModello?, modelloId? }` → 201 `{ compitoId }`; 409 `{ error: "estrazione_cambiata", riepilogo }`; 409 `esercizi_insufficienti` con riepilogo; 404/400 come oggi. Rate limit come oggi.

- [ ] **Step 1: Test** — CLASSE con `versioniViste` = estrazione del riepilogo ⇒ compito con esattamente quelle versioni e `drawSeed = seme`; un esercizio del bacino reso privato tra riepilogo e assegnazione ⇒ `estrazione_cambiata` e nessuna riga creata (Review Focus 1); STUDENTE ⇒ `bacini` salvato, `drawnVersionIds` vuoto, una `EstrazioneStudente` per iscritto, ciascuna di lunghezza = totale; `salvaModello` ⇒ due batterie (una automatica) e `modelloId` sul compito; insufficiente ⇒ `esercizi_insufficienti` e nessuna riga; rotte: 409 con riepilogo, 404 classe altrui, 201.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): assegnare un compito a blocchi, nei due modi`.

### Task 4: Le versioni di un compito per ogni studente

**Files:**
- Create: `src/lib/esercizi/versioni-compito.ts`
- Modify: `src/lib/esercizi/compiti.ts` (`compitoApribile`, `compitiDelloStudente`, `consegneDelCompito`, `compitiDellaClasse`), `percorso-compito.ts`, `pratica.ts`, `statistiche.ts`, `stampa.ts`, `src/app/(student)/studente/page.tsx`, `src/app/(stampa)/stampa/compito/[id]/page.tsx`
- Test: `src/lib/esercizi/__tests__/versioni-compito.test.ts` + aggiornamenti dei test esistenti dei file toccati

**Interfaces:**
- Consumes: Task 1, Task 2 (`estraiDaBacini`).
- Produces:
  - `async function estrazioneDelloStudente(compito: { id: string; modo: ModoEstrazione; drawSeed: string; bacini: unknown }, studentId: string): Promise<string[]>` — STUDENTE: legge `EstrazioneStudente`, se manca la calcola da `bacini` con seme `${drawSeed}:${studentId}` e la memorizza (upsert che non sovrascrive: due richieste concorrenti danno lo stesso risultato); CLASSE: `drawnVersionIds`.
  - `async function versioniDelloStudente(compitoId: string, studentId: string): Promise<string[] | null>` (null se il compito non esiste).
  - `async function versioniDiTuttiGliStudenti(compitoId: string): Promise<Map<string, string[]>>` (per consegne/statistiche/stampa: gli iscritti, calcolando chi manca).
- Regole: ogni punto elencato in Files usa queste funzioni invece di `drawnVersionIds`. `compitiDellaClasse.esercizi` = somma dei `count` dei blocchi per STUDENTE, `drawnVersionIds.length` per CLASSE. Statistiche STUDENTE: una riga per ogni versione estratta ad almeno uno studente, con campo nuovo `assegnatoA: number` (per CLASSE = iscritti). Stampa STUDENTE: `fogliDiStampa` con scelta "file" non disponibile (la pagina mostra solo "una per studente" e una riga che spiega perché), ogni foglio con le versioni del suo studente (`DatiStampa.esercizi` diventa per foglio nel modo STUDENTE).

- [ ] **Step 1: Test** — STUDENTE: stessa estrazione a due chiamate (Review Focus 2), studente iscritto dopo ⇒ estrazione dal bacino congelato anche se nel frattempo un esercizio del bacino è diventato privato; due studenti ⇒ in generale estrazioni diverse; CLASSE legacy ⇒ `versioniDelloStudente` = `drawnVersionIds` e consegne/statistiche/percorso invariati sui test esistenti (Review Focus 4); `compitoApribile` STUDENTE apre solo le versioni dello studente; `esercizioApribileDaStudente` con l'eccezione compito usa le versioni dello studente; statistiche STUDENTE con `assegnatoA`; stampa STUDENTE un foglio per studente con le sue versioni.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS + tutti i test dei file toccati.
- [ ] **Step 5:** Commit `feat(esercizi): versioni del compito per studente`.

### Task 5: Modelli

**Files:**
- Modify: `src/lib/esercizi/batterie.ts` (`elencoModelli`, `eliminaModello`, `caricaModello`)
- Create: `src/app/(dashboard)/dashboard/esercizi/modelli/page.tsx` + client; `src/app/api/esercizi/modelli/[id]/route.ts` (DELETE)
- Modify: `src/app/(dashboard)/dashboard/esercizi/batterie/page.tsx` → `redirect("/dashboard/esercizi/modelli")`; rimuovere `batterie-client.tsx` e la rotta `api/esercizi/batterie` POST se non più usata (con i loro test)
- Test: `batterie.test.ts`, `src/app/api/esercizi/__tests__/modelli-route.test.ts`, test della pagina

**Interfaces:**
- Produces:
  - `async function elencoModelli(chi: Utente): Promise<{ id: string; nome: string; autoreNome: string | null; mio: boolean; blocchi: { etichetta: string; quanti: number }[]; usato: number /* compiti con modelloId = id, più compiti legacy con batteriaId = id */ }[]>` (tutti i non automatici della scuola)
  - `async function caricaModello(id: string): Promise<{ id: string; nome: string; blocchi: Blocco[] } | null>` (blocchi tramite `bloccoDaRegola`; per una regola "argomento" senza anno usa l'anno della classe scelta nella pagina)
  - `async function eliminaModello(id: string, chi: Utente): Promise<{ ok: true } | { ok: false; motivo: "non_trovato" }>` — solo creatore o ADMIN (altrimenti `non_trovato`); se dei compiti hanno `batteriaId = id` (legacy) ⇒ `automatica = true` invece di cancellare; altrimenti cancella (i `modelloId` vanno a null).
  - Pagina Modelli: elenco con "di {autore}", filtro Miei/Tutti, "Usa questo modello" → `/dashboard/esercizi/compiti/nuovo?modello={id}`, "Elimina" solo se `mio` o ADMIN.

- [ ] **Step 1: Test** — elenco con autore e `usato`; eliminazione da un altro docente ⇒ `non_trovato` e nulla cancellato (Review Focus 5); eliminazione di un modello legacy usato ⇒ nascosto, compiti intatti; eliminazione di un modello nuovo usato ⇒ cancellato, `modelloId` null, compiti intatti; `/batterie` reindirizza.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(esercizi): modelli al posto dei compiti preparati`.

### Task 6: Pagina "Nuovo compito" e anteprima del compito

**Files:**
- Create: `src/app/(dashboard)/dashboard/esercizi/compiti/nuovo/page.tsx` (server: classi del docente, raccolte visibili, argomenti, precompilazione da `?classe=&raccolta=&argomento=&modello=&esercizio=`), `nuovo-compito-client.tsx`
- Create: `src/components/esercizi/compito/anteprima-compito.tsx` (client: sequenza di esercizi nel player `soloLocale`, "Esercizio i di n", avanti/indietro)
- Create: `src/app/(dashboard)/dashboard/esercizi/compiti/[id]/anteprima/page.tsx` (`?studente=` per il modo STUDENTE, con menu degli iscritti)
- Modify: `src/app/(dashboard)/dashboard/esercizi/compiti/[id]/page.tsx` (link "Anteprima come la vedono i ragazzi", modo di estrazione, consegne con "ha N esercizi" nel modo STUDENTE)
- Modify: `src/messages/it.json`, `en.json` (namespace nuovo `esercizi.nuovoCompito`)
- Test: test della pagina e del client (fetch mockato), test di `anteprima-compito`

**Interfaces:**
- Consumes: rotte del Task 3, `caricaModello` (Task 5), `versioniDelloStudente` (Task 4), `PlayerEsercizioLazy` (`soloLocale`, come `anteprima-docente-client.tsx`).
- Produces: UI secondo la bozza `.superpowers/brainstorm/37834-1792699345/content/assegna-compito-v2.html` e lo spec:
  - zona 1 bordo blu "1 · Per chi", zona 2 bordo arancio "2 · Cosa", zona 3 bordo verde "3 · Riepilogo" (token brand esistenti, non colori a mano);
  - blocchi: "+ Aggiungi da un argomento" (menu argomenti con quanti disponibili), "+ da una raccolta", "+ scegli esercizi" (ricerca nel catalogo visibile), ognuno con "prendi N a caso" (scelti: "tutti e N") e ✕;
  - riepilogo che chiama `/estrai` (debounce ~400 ms) a ogni cambio: totale, righe per blocco insufficiente ("Equazioni: ne chiedi 5, ce ne sono 3"; scelti: "{titolo} non è più disponibile"), duplicati tolti, frase del modo, scelta "Stesse domande per tutta la classe" / "Domande diverse per ogni studente", "Anteprima come la vedono i ragazzi" (apre `AnteprimaCompito` sugli esercizi del riepilogo; nel modo STUDENTE con la scritta "Esempio: ogni studente avrà la sua estrazione"), "Estrai di nuovo" (nuovo seme), "Salva anche come modello" + nome, "Assegna a {classe}" (disabilitato se insufficiente o senza classe);
  - su 409 `estrazione_cambiata`: aggiorna il riepilogo con quello ricevuto e mostra "Gli esercizi disponibili sono cambiati: controlla l'anteprima e premi di nuovo Assegna";
  - dopo l'assegnazione: vai alla pagina del compito.

- [ ] **Step 1: Test** — precompilazione da `?raccolta=` crea un blocco raccolta; cambio blocchi ⇒ POST `/estrai` con i blocchi; Assegna invia `versioniViste` = esercizi del riepilogo nel modo CLASSE e non le invia nel modo STUDENTE; 409 `estrazione_cambiata` ⇒ messaggio e riepilogo nuovo; blocco insufficiente ⇒ Assegna disabilitato; `AnteprimaCompito` mostra "Esercizio 1 di 3" e avanza.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa. **Step 4:** Run → PASS; `tsc`, `eslint` sui file toccati.
- [ ] **Step 5:** Verifica visiva: copia del repo nello scratchpad (il `.next/dev/lock` impedisce un secondo server nel repo), porta 3200, DB `savint_video`, login "Entra come docente"; screenshot 1280 e 390 della pagina con 2 blocchi, del riepilogo insufficiente, dell'anteprima; correggere ciò che non va; spegnere e cancellare la copia.
- [ ] **Step 6:** Commit `feat(esercizi): pagina Nuovo compito e anteprima del compito`.

### Task 7: Ingressi, navigazione e pulizia delle vecchie strade

**Files:**
- Modify: `dashboard/esercizi/page.tsx` (carta "Nuovo compito" al posto di `AssegnaForm`), `compiti/page.tsx` (pulsante "Nuovo compito", via il `<details>` con `CompitoForm`), `contenitori/page.tsx` (testo "Le raccolte sono cartelle per tenere in ordine gli esercizi", via "Prepara un compito"), `contenitori/[id]` ("Assegna questa raccolta"), `redazione/redazione-elenco-client.tsx` ("Assegna questo argomento" nel gruppo, "Assegna" su ogni riga), `teacher-exercises-nav.tsx` (scheda "Modelli"), `src/components/dashboard/sidebar.tsx` (voce "Nuovo compito" nella sezione Esercizi)
- Delete: `assegna-form.tsx`, `compiti/compito-form.tsx`, `src/app/api/esercizi/compiti/diretto/route.ts` e i loro test; `assegnaDiretto` se non più usata; chiavi i18n non più usate
- Test: test delle pagine toccate

- [ ] **Step 1: Test** — ogni ingresso porta a `/dashboard/esercizi/compiti/nuovo` con il parametro giusto (`raccolta`, `argomento`, `esercizio`, `classe`); la Panoramica non contiene più il form; la nav mostra "Modelli".
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implementa e rimuovi. **Step 4:** Run → PASS; suite completa; `tsc`; `eslint`.
- [ ] **Step 5:** Commit `feat(esercizi): un solo ingresso per dare un compito`.

### Task 8: Video tutorial

**Files:**
- Modify: `scripts/video-tutorial/01-panoramica.ts`, `04-raccolte.ts`, `05-assegna-veloce.ts` (diventa "Nuovo compito in un minuto"), `06-compito-preparato.ts` (diventa "Modelli: ridare un compito"), `08-verifica-compiti.ts`, `15-stampa-verifica.ts` e ogni altro script che usa `AssegnaForm`, `/batterie` o il `<details>` dei compiti (grep), `gira-tutti.sh`, `prepara.ts`/`db.ts` se servono dati nuovi
- Create: `scripts/video-tutorial/16-nuovo-compito.ts` (le tre zone, un blocco da raccolta "prendi 10 a caso", anteprima, i due modi, assegnazione)
- Output: `~/Documents/Savint - Video tutorial docente/` (mp4 + srt), sostituendo i video cambiati

- [ ] **Step 1:** Applica la migrazione a `savint_video` se non fatto; riavvia il server di prova sulla porta 3100 con `DATABASE_URL=postgresql://kahoot:kahoot@localhost:5432/savint_video` (il controller ferma il vecchio processo prima).
- [ ] **Step 2:** Aggiorna gli script; gira con `caffeinate -i` ogni video cambiato; controlla 4–6 fotogrammi per video (niente errori, testi giusti, durata ragionevole).
- [ ] **Step 3:** Commit degli script solo se l'utente lo chiede (oggi non tracciati: lasciarli non tracciati).

### Task 9: Verifica finale

- [ ] **Step 1:** `npx prisma generate` (se serve), poi la suite completa `npx vitest run` → verde.
- [ ] **Step 2:** `npx tsc --noEmit` pulito; `npx eslint` sui file toccati senza errori nuovi.
- [ ] **Step 3:** Push su main (fast-forward) e attesa della CI e di `docker-publish` verdi.
