# SAVINT — Affiliazione self-service delle scuole (MVP)

**Data:** 2026-07-01
**Stato:** Design approvato → pronto per il piano di implementazione

## Obiettivo

Permettere a una scuola di **affiliare la propria installazione a savint.it in autonomia**, senza intervento manuale via CLI: la scuola invia una richiesta dal sito, un admin di savint.it approva, la scuola riceve un **codice di setup** monouso e la sua installazione si **auto-configura** (ottiene `clientId`/`clientSecret` e li salva) incollando il codice.

Sostituisce l'onboarding manuale attuale (script `scripts/register-installation.ts` eseguito a mano dall'admin, con credenziali messe nel `.env` della scuola).

## Contesto (stato attuale)

- **Onboarding oggi = manuale**: l'admin lancia `register-installation` → crea una riga `Installation` (hub) con `clientId` + `clientSecretHash` → comunica a mano clientId/secret → la scuola li mette nel `.env`.
- **L'installazione legge le credenziali hub dall'ENV** (`src/lib/hub/oauth-config.ts`): `hasHubOAuthConfig()` e `getHubOAuthConfig()` sono **sincrone** e leggono `HUB_OAUTH_CLIENT_ID`, `HUB_OAUTH_CLIENT_SECRET`, `SAVINT_HUB_URL` da `process.env`.
- **Hub**: modello `Installation` (`clientId @unique`, `clientSecretHash`); ruolo `HUB_ADMIN` (enum `HubAccountRole`); rate-limit `hubRateLimit`; SMTP Aruba funzionante (`smtps.aruba.it:465`, from `mandi@savint.it`); flusso OAuth installazione↔hub già in produzione.

## Scelte di design (approvate)

1. **Verifica**: approvazione manuale di un `HUB_ADMIN` (+ verifica email della richiesta). Nessuna verifica automatica del dominio nell'MVP.
2. **Consegna config**: **codice di setup** monouso via email; l'installazione lo redime via API e si auto-configura (nessun segreto copiato a mano nel `.env`).
3. **Scope**: MVP.

## Non-goal (fuori dall'MVP)

- Revoca dell'affiliazione self-service (resta la revoca OAuth per-utente già esistente + intervento admin).
- Riemissione automatica di un codice scaduto (per l'MVP: l'admin ri-approva / rigenera).
- Verifica automatica del dominio (email @dominio o DNS TXT).
- Log audit avanzato / dashboard statistiche affiliazioni.

## Architettura

### Lato HUB (savint.it)
- Nuovo modello **`AffiliationRequest`** (traccia richiesta + stato + codice).
- Riusa **`Installation`** (creata all'approvazione).
- Riusa **`HUB_ADMIN`** per il pannello di approvazione.
- Nuovi endpoint sotto `/api/hub/affiliation/*` + una pagina pubblica `/affiliazione` + una sezione admin.

### Lato INSTALLAZIONE (scuola)
- Nuovo modello **`HubConfig`** (singola riga) che memorizza `clientId`/`clientSecret`/`hubUrl` ottenuti dal redeem.
- **`getHubOAuthConfig()` / `hasHubOAuthConfig()` diventano async** e leggono **prima `HubConfig` (DB), poi fallback all'ENV**. Le installazioni attuali configurate via `.env` continuano a funzionare invariate.
- Nuova pagina admin (installazione) "Collega a savint.it" per incollare il codice di setup.

## Modello dati

### Hub — `AffiliationRequest`
```
model AffiliationRequest {
  id                  String   @id @default(cuid())
  schoolName          String
  province            String
  installationUrl     String                 // es. https://quiz.miascuola.edu.it
  contactEmail        String
  status              AffiliationStatus @default(PENDING_EMAIL)
  emailVerifyTokenHash String?               // hash del token di conferma email
  emailVerifiedAt     DateTime?
  reviewedByHubAccountId String?             // HUB_ADMIN che ha deciso
  reviewedAt          DateTime?
  rejectionReason     String?
  installationId      String?  @unique       // creata all'approvazione (FK a Installation)
  setupCodeHash       String?               // hash del codice di setup monouso
  setupCodeExpiresAt  DateTime?
  redeemedAt          DateTime?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  @@index([status])
  @@index([contactEmail])
}

enum AffiliationStatus {
  PENDING_EMAIL      // creata, in attesa di conferma email
  PENDING_REVIEW     // email confermata, in attesa di approvazione admin
  APPROVED           // approvata, codice emesso (in attesa di redeem)
  REDEEMED           // codice redento, installazione configurata
  REJECTED
}
```

### Installazione — `HubConfig`
```
model HubConfig {
  id           String   @id @default(cuid())
  clientId     String
  clientSecret String                  // memorizzato per l'uso OAuth (vedi Sicurezza)
  hubUrl       String
  connectedAt  DateTime @default(now())
  // singola riga: garantita a livello applicativo (upsert su id fisso o "primo record")
}
```

## Flusso ed endpoint

1. **Richiesta** — pagina pubblica `GET /affiliazione` (hub) con form (nome scuola, provincia [tendina province], URL installazione, email referente) →
   `POST /api/hub/affiliation/request` → crea `AffiliationRequest` in `PENDING_EMAIL`, genera token conferma, invia **email di conferma** al referente. Rate-limit per IP + per email.
2. **Conferma email** — `GET /api/hub/affiliation/verify?token=…` → se valido, stato → `PENDING_REVIEW`.
3. **Pannello admin** (hub, solo `HUB_ADMIN`) — pagina sotto l'area admin esistente: lista richieste `PENDING_REVIEW` con **Approva / Rifiuta**.
   - `POST /api/hub/affiliation/[id]/approve` → crea `Installation` (clientId + secret, secret hashato), genera **codice di setup** (random, hashato, scadenza 72h), stato → `APPROVED`, invia **email col codice** al referente.
   - `POST /api/hub/affiliation/[id]/reject` → stato `REJECTED` (+ email opzionale con motivo).
4. **Redeem** (chiamato dall'**installazione**, no login utente — richiesta server-to-server) — `POST /api/hub/affiliation/redeem` `{ setupCode }` →
   valida (esiste, `APPROVED`, non scaduto, non redento) → restituisce **una sola volta** `{ clientId, clientSecret, hubUrl }` → stato → `REDEEMED`, set `redeemedAt`. Rate-limit per IP.
5. **Setup installazione** — pagina admin installazione "Collega a savint.it": il referente incolla il codice →
   `POST /api/installation/hub/connect` (server della scuola) `{ setupCode }` → il server chiama `hubUrl/api/hub/affiliation/redeem` → salva `{ clientId, clientSecret, hubUrl }` in `HubConfig` → esegue un **test di connessione** (es. una chiamata autenticata leggera all'hub) → mostra esito.

> **Dov'è `hubUrl` prima del redeem?** L'installazione deve sapere a quale hub parlare. Nell'MVP `SAVINT_HUB_URL` resta un env di base dell'installazione (default `https://savint.it`); il redeem lo conferma/normalizza e lo salva in `HubConfig`.

## Cambio config runtime (installazione)

`src/lib/hub/oauth-config.ts`:
- `hasHubOAuthConfig()` e `getHubOAuthConfig()` diventano **async**.
- Ordine di lettura: **1) `HubConfig` (DB)** se presente; **2) fallback `process.env`** (compatibilità installazioni attuali).
- Aggiornare tutti i chiamanti ad `await`: `hub-link/page.tsx`, `api/hub/oauth/start`, `api/hub/oauth/callback`, `api/hub/quizzes`, `verify/route.ts`, ed eventuali altri (censire con grep in fase di piano).

## Sicurezza

- **Codice di setup**: random ad alta entropia (≥ 24 byte base32/hex), **monouso**, scadenza 72h, **solo hash** salvato sul hub; confronto in tempo costante.
- **Secret installazione**: il redeem trasmette il `clientSecret` in chiaro **una sola volta via HTTPS**; l'installazione lo salva in `HubConfig`. (MVP: salvato in chiaro nel DB dell'installazione, come oggi nel `.env`; nota per un futuro hardening: cifratura a riposo.)
- **Rate-limit** (`hubRateLimit`) su `request` (per IP+email), `verify`, `redeem` (per IP).
- **Approvazione admin** = barriera anti-abuso principale; **verifica email** riduce lo spam prima della review.
- La pagina/endpoint admin richiedono ruolo `HUB_ADMIN` (riuso guardie esistenti).
- `installationUrl` validato come URL http(s); nessuna fiducia implicita finché l'admin non approva.

## Email (SMTP Aruba già configurato)

1. **Conferma richiesta** → link `…/api/hub/affiliation/verify?token=…`.
2. **Codice di setup** (dopo approvazione) → il codice + brevi istruzioni ("incollalo nella pagina Collega a savint.it della tua installazione").
3. (Opzionale) **Rifiuto** → con motivo.

## Strategia di test

- **Unit/integration (hub)**: creazione richiesta + rate-limit; verify token (valido/scaduto/errato); approve → crea Installation + codice; redeem (valido/scaduto/già redento/inesistente); guardia `HUB_ADMIN`.
- **Unit (installazione)**: `getHubOAuthConfig` legge DB prima di env; fallback env quando `HubConfig` assente; `connect` salva `HubConfig` e gestisce errori del redeem.
- **E2E leggero**: richiesta → verify → approve → redeem → config salvata (mock SMTP).

## Assunzioni / punti aperti minori

- Route pubblica `/affiliazione` (nome IT, come richiesto dall'utente); alias `/affiliation` opzionale.
- Il pannello admin vive dentro l'area admin esistente dell'hub (da individuare in fase di piano).
- `HubConfig` come singola riga: applicare un vincolo applicativo (upsert su id fisso).
