# SAVINT — Andare online: hub su savint.it + istanza demo

**Data:** 2026-05-29
**Autore:** Cristian Virgili (con Claude)
**Stato:** Approvato in fase di design — pronto per il piano di implementazione

## Obiettivo

Mettere online **un unico `savint.it`** come **repository pubblico** dei quiz, e
abilitare le scuole a usare SAVINT installando la propria copia che si collega
all'hub. Nessuno stravolgimento dell'architettura: il codice supporta già le due
modalità (`hub` / `installation`); questo è soprattutto lavoro di **deploy +
ultime rifiniture**.

### Cosa vede l'utente

- **`savint.it` (radice)** — il repository pubblico. Chi arriva sul sito vede i
  quiz pronti, può cercarli, vederne il dettaglio, provarli (self-practice
  anonima), registrarsi, pubblicare. È anche il punto a cui si collegano le
  installazioni delle scuole (OAuth).
- **`savint.it/demo`** — istanza "prova il sistema": un utente prova SAVINT in
  modalità installazione + demo (login istantaneo, crea un quiz, lo fa girare
  live) senza installare niente.
- **Scuole** — installano la propria copia (modalità `installation`, ovunque) e
  la collegano a `savint.it` via OAuth per cercare/scaricare/caricare quiz.

## Stato attuale (punto di partenza)

L'hub è **già pronto al ~70-75%**. Esistono e funzionano:

| Funzione | Stato | File chiave |
|---|---|---|
| Sfoglia/cerca quiz pubblici | ✅ | `src/app/explore/page.tsx`, `src/components/hub/hub-explore-client.tsx` |
| Dettaglio quiz pubblico | ✅ | `src/app/(hub)/q/[id]/page.tsx` |
| Prova self-practice anonima | ✅ | `src/app/(hub)/q/[id]/play/[runId]/page.tsx`, `practice-runner.tsx` |
| Profilo autore pubblico | ✅ | `src/app/u/[hubAccountId]/page.tsx` |
| Account: registrazione/login/reset/Google | ✅ | `src/app/(hub)/hub-*` |
| OAuth per le installazioni | ✅ | `src/app/(hub)/oauth/authorize`, `src/app/api/hub/oauth/*` |
| Moderazione / admin report | ✅ | `src/app/admin/hub/reports/page.tsx` |

Manca, per andare online:

1. **Home page dell'hub** — oggi `/` mostra sempre `PlayerView` (schermata
   "unisciti a una sessione") in entrambe le modalità: `src/app/page.tsx` non
   ramifica per modalità.
2. **basePath cablato a `/savint`** — impedisce di servire l'hub sulla radice.
3. **Config di deploy** — SMTP email, Google OAuth callback, nginx, SSL, PM2.

## Decisioni di design

- **URL**: hub sulla **radice** `savint.it`; demo su **`savint.it/demo`**.
- **Processi**: **due build/processi** dallo stesso repo (modalità A). `SAVINT_MODE`
  e `basePath` sono globali per processo/build, quindi non sono combinabili in un
  unico processo.
- **Database**: **due PostgreSQL separati** (hub e demo non mischiano dati; la
  demo è azzerabile senza toccare l'hub).
- **Home hub**: versione **curata / branding** (non solo redirect a `/explore`).
- **Onboarding scuole**: provisioning OAuth **manuale** per l'MVP (il flusso
  `/api/hub/oauth/*` esiste già); auto-registrazione delle installazioni rinviata
  a una fase 2.

## Architettura di deploy

VPS unica già attiva (è il server di friulware.it; `savint.it` punta già lì).

```
savint.it (443, nginx, HTTPS via certbot)
├── location /        → 127.0.0.1:3002  [pm2: savint-hub]
│                        SAVINT_MODE=hub        BASE_PATH=""    DB: savint_hub
└── location /demo    → 127.0.0.1:3001  [pm2: savint-demo]
                         SAVINT_MODE=installation DEMO_MODE=true BASE_PATH=/demo  DB: savint_demo
                         SAVINT_HUB_URL=https://savint.it  (la demo "vede" l'hub)

Scuole (self-hosted, ovunque) → modalità installation → OAuth → https://savint.it
```

Due directory/checkout sul server, ognuna con il proprio `.env` e la propria
build (il basePath è build-time in Next.js, quindi richiede due build distinte).

## Ambiti di lavoro

### 1. Rendere il basePath configurabile da env (refactor, ~1h)

Oggi `/savint` è cablato in ~6 punti chiave (più redirect/email). Vanno tutti a
leggere un'unica fonte (env `BASE_PATH`, default vuoto o `/demo` a seconda della
build):

- `next.config.ts` (riga 7) — `basePath` da env.
- `src/lib/base-path.ts` — fonte unica `BASE_PATH`.
- `src/app/api/auth/[...nextauth]/route.ts` (riga 4) — workaround basePath da env.
- `src/lib/auth/config.ts` (riga 116) — `basePath` di NextAuth da env.
- `src/lib/socket/client.ts` (riga 16) e `src/server.ts` (riga 22) — path Socket.io da env.
- Redirect cablati `/savint/...` nelle pagine hub-auth e in `src/app/api/auth/logout/route.ts`.
- Link nelle email (`hub-register`, `hub-forgot-password`) — usare `getHubBaseUrl()` / `HUB_BASE_URL`.

Criterio di accettazione: con `BASE_PATH=""` l'app gira correttamente sulla radice
(auth, socket, link email inclusi); con `BASE_PATH=/demo` gira sotto `/demo`.

### 2. Home page dell'hub (UI nuova, curata)

`src/app/page.tsx` deve ramificare: in `hub` mode rende una nuova
`HubLandingPage`; in `installation` mode resta `PlayerView`.

Contenuti landing (curata/branding): hero con titolo e proposta di valore, barra
di ricerca che porta a `/explore`, quiz in evidenza (più recenti/popolari via
`/api/hub/quizzes`), CTA registrati/esplora, sezione "porta SAVINT nella tua
scuola" (come installare/collegarsi), footer con licenza/progetto. i18n IT+EN
coerente con il resto (next-intl).

### 3. Configurazione operativa

- **SMTP**: configurare `HUB_SMTP_*`, `HUB_EMAIL_FROM`, `HUB_BASE_URL` per le
  email di verifica/reset dell'hub. Provider da scegliere in fase di piano.
- **Google OAuth**: aggiungere redirect URI `https://savint.it/api/auth/callback/google`
  (radice, senza `/savint`).
- **nginx**: blocco `savint.it`/`www.savint.it` con le due `location` (`/` → 3002,
  `/demo` → 3001), header WebSocket per Socket.io, `client_max_body_size` adeguato.
- **SSL**: certbot per `savint.it` e `www.savint.it` (oggi il blocco è solo HTTP).
- **PM2**: due processi persistenti (`savint-hub`, `savint-demo`), `pm2 save`/`startup`.
- **DB**: creare `savint_hub` e `savint_demo`, `prisma migrate deploy` su entrambi,
  seed solo dove serve (admin sull'hub; docente demo sulla demo).
- **Docs**: aggiornare `DEPLOY-GUIDA.md` (cita ancora friulware.it) e
  `update-server.sh` (oggi un solo processo) per i due processi.

### 4. Onboarding scuole (MVP)

Provisioning manuale: per ogni installazione si generano client_id/secret OAuth
e si documenta come la scuola li mette nel proprio `.env`
(`SAVINT_HUB_URL`, `HUB_OAUTH_CLIENT_ID/SECRET`). Il flusso runtime esiste già.

## Fuori ambito (fase 2)

- Auto-registrazione delle installazioni (self-service OAuth client).
- Storage immagini dedicato (oggi base64 inline).
- Analytics avanzate per quiz dell'hub.
- Sorte di `friulware.it/savint` (l'attuale processo condiviso): da chiarire a
  parte; questo spec non lo tocca se non per smettere di usarlo come demo.

## Criteri di successo (MVP online)

1. `https://savint.it` mostra la home hub curata; `/explore`, dettaglio quiz,
   self-practice, profili e account funzionano sulla radice (basePath vuoto).
2. Registrazione hub con email di verifica realmente recapitata (SMTP ok).
3. `https://savint.it/demo` permette di provare il sistema (login demo, crea quiz,
   sessione live) senza installazione.
4. Una scuola può installare la propria copia, collegarla a savint.it via OAuth,
   e cercare/scaricare/caricare quiz.
5. HTTPS valido su savint.it; due processi PM2 persistenti al reboot.
