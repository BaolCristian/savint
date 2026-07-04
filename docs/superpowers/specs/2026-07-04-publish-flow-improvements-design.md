# Miglioramenti al flusso di pubblicazione verso l'hub

**Data:** 2026-07-04
**Stato:** design approvato dall'utente

## Contesto

Un'installazione (es. quiz.paolosarpi.edu.it) pubblica un quiz sull'hub
(savint.it) via OAuth. Componenti: `PublishButton`/`PublishModal`
(`src/components/hub/`), reso da `quiz-editor.tsx` con dati dalla pagina server
`src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx`; route
`src/app/api/hub/quiz/[id]/publish/route.ts`; token in `HubLink` (per utente,
con `revokedAt`); refresh in `src/lib/hub/hub-client.ts`; schema di validazione
`src/lib/hub/quiz-metadata.ts`.

Tre problemi emersi dall'uso:

1. **Revoca senza via d'uscita.** Quando il token è revocato, `hub-client`
   imposta `HubLink.revokedAt` e la route torna `{ error: "reauth_required",
   reauthUrl }` (401). La modale mostra solo il testo `errorReauth` e **ignora
   `reauthUrl`**: l'utente legge "riautorizza" ma non ha alcun bottone per
   farlo. La procedura esiste (`/account/hub-link` → `/api/hub/oauth/start`) ma
   non è raggiungibile dallo stato d'errore.
2. **Metadati riscritti ogni volta.** Materia/grado/lingua non hanno default:
   per ogni nuovo quiz vanno reinseriti. Nessun modello di preferenze esiste.
3. **Durata a mano.** Il form impone `estimatedDurationSec` (required, min 10),
   anche se la route **già** calcola `overrides.estimatedDurationSec ??
   Σ question.timeLimit` come fallback.

## Obiettivo

(1) Rendere raggiungibile la riconnessione dallo stato di revoca. (2) Ricordare
i metadati sul **profilo utente** (DB), così da precompilarli. (3) Calcolare la
durata automaticamente, togliendo il campo. Decisioni prese con l'utente:
default **sul DB per-utente**; durata **calcolata e basta** (nessun campo).

## Interventi

### 1. Riconnessione visibile su revoca

- **`PublishModal`**: quando la POST torna `reauth_required`, catturare
  `data.reauthUrl` in stato e mostrare, al posto del solo messaggio, un
  **bottone "Riconnetti a savint.it"** (link ad `reauthUrl`, cioè
  `/api/hub/oauth/start?quizId=<id>` → OAuth → ritorno al quiz).
- **All'apertura**: trattare un link **revocato** come non collegato. Oggi la
  modale riceve `link: { hubAccountEmail } | null` e mostra il CTA se `!link`.
  Passare anche lo stato `revoked` (calcolato dalla pagina: `link` esiste ma
  `revokedAt != null`); se assente **o** revocato → mostrare il CTA di
  (ri)connessione invece del form.
- **Caveat hub disattivato**: se la scuola è `DISABLED` sull'hub, la
  riconnessione OAuth fallirà comunque (`invalid_client`). Fuori scope
  risolverlo lato installazione: va riattivata dalla console admin dell'hub
  (Affiliazioni → Riattiva). La procedura di riconnessione comunque **appare**;
  se fallisce, l'utente vede l'errore OAuth standard sulla pagina hub-link.
- i18n: `hub.publish.reauthCta` ("Riconnetti a savint.it" / "Reconnect to
  savint.it") + un breve testo esplicativo `hub.publish.reauthIntro`.

### 2. Default metadati per-utente (DB)

- **Nuovo modello Prisma** (lato installazione): `PublishDefaults` con
  `userId String @unique` (FK→User, onDelete Cascade), `schoolLevel String?`,
  `subject String?`, `language String?`, `ageMin Int?`, `ageMax Int?`,
  `updatedAt DateTime @updatedAt`. Relazione `User.publishDefaults
  PublishDefaults?`. Migrazione dedicata.
- **Al publish riuscito** (route publish, dopo il successo): `upsert` dei
  default con i valori effettivamente usati (schoolLevel, subject, language,
  ageMin, ageMax). Best-effort: un errore qui non deve far fallire il publish.
- **Precompilazione**: la pagina edit carica `publishDefaults` dell'utente e li
  passa fino alla modale; ogni campo si inizializza come
  `quiz.<campo> ?? defaults.<campo> ?? ""`. Così il quiz già pubblicato mantiene
  i suoi valori; un quiz nuovo parte dagli ultimi usati.

### 3. Durata calcolata

- **`quiz-metadata.ts`**: `estimatedDurationSec` diventa `.optional()`. La route
  già usa `?? Σ question.timeLimit`, quindi se assente viene calcolata.
- **`PublishModal`**: rimuovere il campo `estimatedDuration`. Mostrare una riga
  read-only *"Durata stimata: ~N min (calcolata dalle domande)"*, con `N`
  derivato da un valore `estimatedDurationSec` passato dalla pagina (server:
  `Σ question.timeLimit`). Il form non invia più `estimatedDurationSec`.

## Flusso dati (dopo)

`edit/page.tsx` (server) carica: quiz+questions, `hubLink`, `publishDefaults`;
calcola `estimatedDurationSec = Σ timeLimit` e `revoked = Boolean(link?.revokedAt)`
→ passa a `quiz-editor` → `PublishButton` → `PublishModal`
(`{ quiz, link, revoked, defaults, estimatedDurationSec }`).

## Vincoli / fuori scope

- Una sola migrazione additiva (`PublishDefaults`); nessuna modifica ai modelli
  esistenti.
- Nessun redesign della modale oltre a: bottone riconnessione, riga durata
  read-only, rimozione campo durata, seeding dai default.
- Non si gestisce lato installazione il caso "hub ha disabilitato la scuola"
  oltre a mostrare l'errore OAuth esistente.
- Le preferenze sono per-utente sull'**installazione** (non condivise con
  l'hub).

## Verifica

- Test: `publishMetadataSchema` accetta payload **senza** `estimatedDurationSec`;
  la route calcola la durata dalla somma dei `timeLimit`; l'upsert di
  `PublishDefaults` avviene al successo e la precompilazione li rilegge.
- `tsc` pulito, `build` ✓, parità i18n IT/EN.
- A schermo: (a) con link revocato la modale mostra "Riconnetti"; (b) un nuovo
  quiz eredita gli ultimi materia/grado/lingua; (c) nessun campo durata, riga
  informativa presente.
