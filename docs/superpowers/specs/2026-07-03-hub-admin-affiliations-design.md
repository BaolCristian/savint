# Console admin affiliazioni (hub)

**Data:** 2026-07-03
**Stato:** design approvato dall'utente

## Contesto

Sull'hub (savint.it) l'admin (HubAccount con `role = HUB_ADMIN`) deve poter
gestire le affiliazioni delle scuole. Oggi esiste solo
`/admin/hub/affiliations` che mostra **le sole richieste PENDING_REVIEW** con
Approva/Rifiuta (`affiliation-actions.tsx`); è un **URL orfano** (nessun link),
stile vecchio (indaco). Manca: elenco delle scuole collegate, storico,
disattivazione/rimozione, accessibilità.

Lifecycle di un'affiliazione (`AffiliationStatus`): `PENDING_EMAIL` → verifica
email → `PENDING_REVIEW` → *approva* (crea `Installation` + codice setup via
email) → `APPROVED` → la scuola *riscatta* il codice → `REDEEMED` (collegata).
Oppure `REJECTED`. La `Installation` (creata all'approvazione) è il client OAuth
della scuola: `status` `ACTIVE`/`DISABLED`, `lastSeenAt`, `clientId`.
`AffiliationRequest.installationId` (unique) collega richiesta ↔ installazione.
Il token endpoint (`api/hub/oauth/token/route.ts:26`) **rifiuta già** le
installazioni non `ACTIVE`.

## Obiettivo

Una console admin che permetta di: **(1)** vedere le scuole collegate,
**(2)** vedere tutte le richieste, **(3)** disattivare (reversibile) o eliminare
(definitivo). Decisioni prese con l'utente: disattiva-reversibile **e** elimina;
mostrare anche approvate-in-attesa e rifiutate.

## Interventi

### 1. Backend — nuove API (pattern `/api/hub/admin/*`, `requireHubAdmin`)

**`POST /api/hub/admin/installations/[id]/disable`**
- `requireHubAdmin` (401 senza sessione, 403 se non HUB_ADMIN).
- 404 se l'installazione non esiste.
- In transazione: `installation.update({ status: "DISABLED" })` +
  `hubAccessToken.deleteMany({ where: { installationId } })` (revoca immediata;
  i nuovi token sono già rifiutati dal token endpoint perché non ACTIVE).
- 200 `{ ok: true }`.

**`POST /api/hub/admin/installations/[id]/enable`**
- `requireHubAdmin`; 404 se assente.
- `installation.update({ status: "ACTIVE" })`. La scuola torna a ottenere token
  al prossimo giro OAuth (ha ancora clientId/secret). 200 `{ ok: true }`.

**`DELETE /api/hub/admin/affiliations/[id]`**  *(id = AffiliationRequest.id)*
- `requireHubAdmin`; 404 se la richiesta non esiste.
- In transazione, se `request.installationId` è valorizzato:
  `oAuthAuthorizationCode.deleteMany({ installationId })`,
  `hubAccessToken.deleteMany({ installationId })`,
  `installation.delete({ id: installationId })` (best-effort: ignora se già
  assente), poi `affiliationRequest.delete({ id })`.
- 200 `{ ok: true }`. Irreversibile (la UI chiede conferma).

Test (vitest, come `affiliation/__tests__`): disable revoca token e imposta
DISABLED + il token endpoint poi nega; enable ripristina ACTIVE; delete rimuove
request+installation+token; tutte 401/403 senza admin.

### 2. Frontend — pagina `src/app/admin/hub/affiliations/page.tsx` (riscritta)

Server component, guard invariato (`getHubSessionFromCookies`, redirect se non
admin). Query in parallelo, poi raggruppo:
- **Scuole collegate**: `affiliationRequest.findMany({ where: { status: "REDEEMED" } })`
  join con `installation.findMany({ where: { id: { in: installationIds } } })`.
- **In attesa**: `status: "PENDING_REVIEW"` (ordinate per createdAt asc).
- **Storico**: `status: { in: ["APPROVED", "REJECTED"] }`.

Layout a tre sezioni con titoli + contatori; stile brand (token `--brand-*`,
niente indaco), tabelle in card `border-slate-200 bg-white rounded-2xl`, badge di
stato colorati (Attiva=verde-brand, Disattivata=slate, In attesa=arancio,
Rifiutata=rosso). Le date con `Intl` deterministico (già presente pattern; usare
`toLocaleDateString("it-IT")` è ok lato server component).

Colonne **Scuole collegate**: scuola · provincia · URL · email · badge stato
(dalla Installation) · ultimo accesso (`lastSeenAt`) · collegata il (`redeemedAt`).
Azioni: **Disattiva/Riattiva** (secondo `installation.status`) · **Elimina**.

Colonne **In attesa**: scuola · provincia · URL · email · data. Azioni:
**Approva · Rifiuta · Elimina**.

Colonne **Storico**: scuola · provincia · badge stato · dettaglio (motivo
rifiuto per REJECTED; "codice inviato, in attesa di riscatto" + scadenza per
APPROVED) · data. Azioni: **Elimina**.

### 3. Frontend — componenti azioni (client, focalizzati)

- `affiliation-actions.tsx` (esistente): mantiene Approva/Rifiuta; aggiungo
  **Elimina** con dialog di conferma (shadcn `Dialog`, come il kick in
  host-view). Estrarre un piccolo `ConfirmDelete` riusabile.
- `installation-actions.tsx` (nuovo): pulsante **Disattiva/Riattiva**
  (POST enable/disable) + **Elimina** (stesso `ConfirmDelete`).
- Dopo ogni azione: `router.refresh()` (già il pattern in
  affiliation-actions/hub-reports-client).

### 4. Accessibilità (rendere raggiungibile)

- **`src/app/admin/hub/layout.tsx`** (nuovo): frame con titolo "Console admin" e
  **tab** *Affiliazioni · Segnalazioni* (link a `/admin/hub/affiliations` e
  `/admin/hub/reports`), tab attivo evidenziato. Guard admin nel layout
  (redirect se non HUB_ADMIN) così entrambe le pagine sono protette in un punto.
- **Link "Admin" nell'header hub**: `src/app/layout.tsx` (server) calcola
  `isAdmin` via `getHubSessionFromCookies()` (nessun costo per utenti anonimi:
  `auth()` è null → niente query) e lo passa a `<HubHeader isAdmin={...} />`;
  `hub-header.tsx` mostra il link `Admin → /admin/hub/affiliations` solo se
  `isAdmin`.

### 5. i18n

Nuovo namespace **`adminAffiliations`** (IT+EN, parità chiavi) per titoli
sezioni, intestazioni colonne, badge di stato, azioni (disattiva, riattiva,
elimina, confirmDeleteTitle/Body), stati storico. Le chiavi esistenti in
`affiliation` (approve/reject/…) restano. Aggiungere `hub.adminNav` per le tab
(affiliations/reports labels) e `hub.headerAdmin` per il link header.

## Vincoli / fuori scope

- Nessuna modifica allo schema Prisma (nessuna migrazione): i delete a cascata
  sono espliciti in transazione via `installationId`.
- Nessuna ricerca/filtri/bulk/paginazione (poche scuole). Nessuna UI per
  promuovere admin (resta da script `promote-hub-admin.ts`). Nessun "rinvia
  codice" (rimandato).
- Solo hub (`SAVINT_MODE=hub`). Guard HUB_ADMIN su ogni route e pagina.
- Azioni distruttive su dati reali di produzione → confermare in UI; il deploy
  avviene dopo review.

## Verifica

- Test vitest verdi sulle nuove route (disable/enable/delete + 401/403).
- `tsc` pulito, `npm run build` ok, parità i18n.
- A schermo: login come HUB_ADMIN (seed locale), pagina con dati seedati nei tre
  stati; disattiva/riattiva/elimina funzionanti; link Admin visibile solo
  all'admin.
