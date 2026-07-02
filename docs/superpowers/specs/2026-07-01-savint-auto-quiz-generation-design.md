# SAVINT — Generazione automatica di quiz ("Redazione SAVINT")

**Data:** 2026-07-01
**Stato:** DRAFT per revisione — le scelte di design sono decise con raccomandazione; confermale o correggile.

## Obiettivo

Generare automaticamente quiz didattici con un LLM su varie materie/gradi, validarli, e pubblicarli su savint.it — **~10 al giorno**, in modo (Fase 1) **semi-automatico con revisione admin**, poi (Fase 2) **pienamente automatico**. I quiz sono attribuiti a un account bot "**Redazione SAVINT**" ed etichettati come generati con AI (trasparenza).

## Contesto (stato attuale — scoperte chiave)

- **Non esiste alcun SDK LLM nel repo.** "Crea con AI" (`/dashboard/ai-prompts`) è solo un **template di prompt da copiare** in un chatbot esterno → l'utente ottiene un Excel → lo importa (`/api/quiz/excel-import`). Quindi il generatore automatico **deve aggiungere una dipendenza LLM** (`@anthropic-ai/sdk`) + una **API key** (`ANTHROPIC_API_KEY`).
- **Formato quiz**: `questionSchema` + schemi per-tipo in `src/lib/validators/quiz.ts` (9 tipi: MULTIPLE_CHOICE, TRUE_FALSE, OPEN_ANSWER, ORDERING, MATCHING, SPOT_ERROR, NUMERIC_ESTIMATION, IMAGE_HOTSPOT, CODE_COMPLETION). Il generatore produce `QuestionInput[]` conformi.
- **Pubblicazione su hub**: un quiz diventa `HubQuiz` con `payloadBlob` = un `.qlz` (zip con `manifest.json`), costruito da `buildQlz(quiz)` in `src/lib/hub/qlz-builder.ts`; i metadati sono validati da `publishMetadataSchema` (`src/lib/hub/quiz-metadata.ts`: `schoolLevel` enum obbligatorio, `subject` slug, `language` ISO 639-1, `estimatedDurationSec`). La creazione hub-side è `prisma.hubQuiz.create({ hubAccountId, ...metadata, payloadBlob, payloadHash, questionCount })`.
- **Il generatore gira SULL'HUB** → può creare `HubQuiz` **direttamente** (server-side), senza OAuth/token né Excel né un `Quiz` locale.
- **Nessun account bot** esiste; nessun cron/worker nel repo (lo scheduling è esterno).
- **Vocabolario**: `QUIZ_SUBJECTS` (25 slug) × `SchoolLevel` (PRIMARIA, SECONDARIA_I, SECONDARIA_II, UNIVERSITA, ALTRO) = matrice 125 combinazioni.

## Scelte di design (decise — conferma o correggi)

1. **Rilascio in 2 fasi. MVP = Fase 1 semi-automatica**: generazione → **coda di revisione**; un `HUB_ADMIN` approva → pubblica. Fase 2 (full-auto via cron) dopo che la qualità è provata. *(Raccomandato: non pubblicare contenuti errati su un repository pubblico prima di validarne la qualità reale.)*
2. **Argomenti = matrice curata + AI**: si parte dalla matrice `subject × level` (125 combo dal vocabolario esistente); per ogni combo l'LLM genera l'**argomento specifico**. Rotazione con dedup (non ripetere combo/argomenti recenti).
3. **Modello**: Anthropic Claude (modello capace, es. l'ultimo Sonnet/Opus) via `@anthropic-ai/sdk`; **due passaggi**: (a) generazione, (b) auto-verifica ("correttore") della correttezza delle risposte. Nuovi env: `ANTHROPIC_API_KEY`, `AUTOQUIZ_MODEL`. Costo: ~10 quiz/giorno × 2 chiamate = pochi € /giorno.
4. **Account bot "Redazione SAVINT"** come autore (`HubAccount` dedicato, `HUB_USER`), con tag **"generato-con-ai"** e licenza `CC_BY`.

## Non-goal (fuori dall'MVP/Fase 1)

- Full-auto senza revisione (è la Fase 2).
- Generazione di **immagini** (IMAGE_HOTSPOT): escluso in Fase 1 (solo tipi testuali).
- UI di editing dei quiz generati (l'admin approva/rifiuta; l'editing avviene rigenerando o a mano dopo il clone).
- Traduzione multilingua automatica (Fase 1: lingua configurabile per run, default `it`).

## Architettura

**Gira sull'hub (savint.it)** come **script** invocabile (`tsx scripts/autoquiz-generate.ts`), schedulato **esternamente** (cron di sistema o GitHub Action). Pipeline per ogni quiz:

1. **Seleziona** `(subject, level, language)` dalla matrice con rotazione (evita combo generate di recente — vedi `GeneratedTopic`).
2. **Genera** (LLM call #1): prompt strutturato → JSON `{ title, description, tags, questions[] }` con metadati.
3. **Valida** contro `questionSchema`/`quizSchema` (zod). Se invalido: 1 retry con feedback dell'errore, poi scarta e logga.
4. **Auto-verifica** (LLM call #2, "correttore"): l'LLM controlla che ogni risposta corretta sia effettivamente corretta e coerente; se segnala problemi → scarta (o marca `flagged`).
5. **Impacchetta**: costruisci l'oggetto Quiz-like in memoria + `buildQlz(...)` → `{ payloadBlob, payloadHash }`.
6. **Crea `HubQuiz` in bozza**: `prisma.hubQuiz.create({ hubAccountId: bot, ...metadata, payloadBlob, generated: true, unpublishedAt: now() })` → **non visibile** su /explore finché non approvato.
7. **Registra** `GeneratedTopic(subject, level, topic)` per la rotazione.

**Fase 1 (semi-auto)**: i quiz nascono con `unpublishedAt` impostato (bozza nascosta). L'admin li rivede su un pannello e **Approva** (`unpublishedAt = null`, `publishedAt = now()` → visibile) o **Rifiuta** (elimina).

**Fase 2 (full-auto)**: dopo validazione qualità, lo script può creare direttamente con `unpublishedAt = null` (pubblicati subito), con controllo a campione.

## Modello dati

- **Bot `HubAccount`** "Redazione SAVINT": creato una tantum via nuovo script `scripts/create-bot-account.ts` (`authMethod: PASSWORD`, `emailVerified: now()`, `role: HUB_USER`, email dedicata es. `redazione@savint.it`).
- **`HubQuiz`**: aggiungere `generated Boolean @default(false)` (per etichetta/filtri). Lo **stato bozza** riusa la semantica esistente `unpublishedAt` (non visibile finché impostato) — nessun nuovo enum di stato necessario.
- **`GeneratedTopic`** (nuovo, per rotazione/dedup):
```
model GeneratedTopic {
  id          String   @id @default(cuid())
  subject     String
  schoolLevel SchoolLevel
  language    String
  topic       String
  hubQuizId   String?          // il HubQuiz generato (se creato)
  status      String   @default("draft") // draft | approved | rejected | invalid
  createdAt   DateTime @default(now())
  @@index([subject, schoolLevel])
  @@index([createdAt])
}
```

## Pipeline di generazione (dettaglio)

- **Libreria** `src/lib/autoquiz/`:
  - `client.ts` — wrapper `@anthropic-ai/sdk` (`ANTHROPIC_API_KEY`, `AUTOQUIZ_MODEL`).
  - `prompt.ts` — costruisce il prompt di generazione (materia/grado/lingua/argomento; specifica gli schemi per-tipo con esempi JSON; chiede N domande di tipi misti, risposte corrette, `timeLimit`/`points`, tag, descrizione). Output **JSON stretto**.
  - `parse.ts` — estrae/valida il JSON con `quizSchema`; normalizza (order sequenziale, default).
  - `verify.ts` — prompt di auto-verifica (LLM #2) → `{ ok: boolean, issues: string[] }`.
  - `topics.ts` — selezione combo con rotazione (query `GeneratedTopic` recenti) + genera l'argomento specifico (può essere parte della LLM #1).
  - `publish.ts` — `buildQlz` + `prisma.hubQuiz.create` in bozza; scrive `GeneratedTopic`.
- **Script** `scripts/autoquiz-generate.ts` — argomento `--count=10 --language=it`; cicla la pipeline; logga esiti (generati/scartati/invalidi).

## Pannello admin (revisione — Fase 1)

- Pagina `src/app/admin/hub/generated/page.tsx` (guardia `HUB_ADMIN` come `/admin/hub/reports`): lista `HubQuiz` con `generated = true AND unpublishedAt != null` (le bozze), con **anteprima domande** (riusa `extractQuestionPreviews`), e azioni **Approva** / **Rifiuta**.
- API: `POST /api/hub/admin/generated/[id]/approve` (`unpublishedAt = null`, `publishedAt = now()`) e `/reject` (elimina il `HubQuiz` + marca `GeneratedTopic.status = rejected`). Guardia `requireHubAdmin`.

## Scheduling

Esterno (nessun worker nel repo). Opzioni:
- **Cron di sistema** sul server hub: `0 6 * * * cd /opt/savint-hub/repo && docker compose exec -T hub tsx scripts/autoquiz-generate.ts --count=10` (o un container one-shot).
- **GitHub Action** schedulata che invoca lo script contro l'hub.
Per l'MVP: **invocazione manuale/documentata**; il cron si aggiunge attivando la Fase 2.

## Qualità, sicurezza, trasparenza

- **Validazione schema** (zod) obbligatoria → scarta gli output non conformi.
- **Auto-verifica LLM** delle risposte (secondo passaggio) → scarta i dubbi.
- **Revisione umana** (Fase 1) come gate finale prima della visibilità pubblica.
- **Etichetta AI**: tag `generato-con-ai` + autore bot "Redazione SAVINT"; opz. nota in `description`.
- **Costo/limiti**: rispetta `HUB_PUBLIC_QUIZZES_PER_ACCOUNT_MAX` (default 200) per l'account bot — considerare un limite più alto o rotazione/archiviazione.
- **API key**: `ANTHROPIC_API_KEY` solo lato server hub (mai client); non loggare i prompt/chiavi.

## Strategia di test

- **Unit**: `parse.ts` accetta un JSON valido e rifiuta uno malformato/con opzioni invalide (per ogni tipo); `topics.ts` non ripropone una combo generata di recente.
- **Integration (mock LLM)**: pipeline end-to-end con `client` mockato → crea un `HubQuiz` bozza (`unpublishedAt != null`, `generated = true`) + `GeneratedTopic`; approve/reject route (guardia admin) cambiano stato/visibilità.
- **Nessuna chiamata LLM reale nei test** (mock del client).

## Fasi

- **Fase 1 (MVP, questa spec)**: SDK + client, prompt/parse/verify, bot account, `HubQuiz.generated` + `GeneratedTopic`, script di generazione (invocazione manuale), pannello admin di revisione, approve/reject.
- **Fase 2 (dopo)**: cron/schedule 10/giorno, pubblicazione diretta con controllo a campione, metriche (tasso di scarto, materie coperte), eventuale editing.

## Punti aperti / da confermare (le 4 scelte)

1. Fase 1 semi-auto (consigliata) vs full-auto subito?
2. Ok matrice curata + argomento generato dall'AI? (o preferisci fornire tu una lista di argomenti per materia?)
3. Modello Claude + budget: va bene `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY`, ~10/giorno? Quale tier (Sonnet/Opus)?
4. Email/nome dell'account bot ("Redazione SAVINT", `redazione@savint.it`?).
