# SAVINT — Go-live su Docker (adattamento del design 2026-05-29)

**Data:** 2026-06-29
**Autore:** Cristian Virgili (con Claude)
**Stato:** In design — da rivedere prima del piano di implementazione
**Riferimento:** `docs/superpowers/specs/2026-05-29-savint-hub-go-live-design.md` (design originale, approvato)

## Contesto

Il design go-live del 2026-05-29 è ancora valido nelle sue scelte di prodotto, ma
presuppone un deploy **bare-metal con PM2** (due processi `savint-hub` su :3002 e
`savint-demo` su :3001). Dopo quel design è stata realizzata la **distribuzione
Docker** (merge 2026-06-11) e la prima scuola (`quiz.paolosarpi.edu.it`) è già
stata messa online **con Docker** dietro un nginx host con certbot. Questo doc
adatta il go-live a Docker e lo decompone per l'esecuzione.

Obiettivo invariato: **`savint.it` diventa l'hub/repository pubblico**; le scuole
self-hosted si collegano via OAuth per **cercare, scaricare e pubblicare** quiz.

## Cosa resta invariato dal design originale

- **Topologia URL**: hub sulla radice `savint.it`; demo su `savint.it/demo`.
- **Due build/processi** dallo stesso repo (`SAVINT_MODE` runtime, `BASE_PATH`
  build-time → due immagini distinte).
- **Due database separati** (`savint_hub` per l'hub, `savint_demo` per la demo).
- **Onboarding scuole MANUALE** per l'MVP (§4 originale): si generano
  `client_id`/`client_secret` e si creano i record `Installation` a mano;
  auto-registrazione = fase 2.
- **Ambiti di codice §1 (basePath da env) e §2 (home hub)**: ancora da fare,
  indipendenti dal metodo di deploy.
- **Criteri di successo** del design originale.

## Cosa cambia (delta Docker)

- **PM2 → Docker Compose**: due stack invece di due processi PM2.
- **Reverse proxy**: il **nginx host esistente** (con certbot) instrada
  `/` → container hub e `/demo` → container demo, come già fatto per la scuola
  (override compose che espone le porte su `127.0.0.1`, nginx-del-container spento
  via profilo).
- **Varianti immagine via build-arg** (nuovo): il `Dockerfile` deve accettare
  `BASE_PATH`, `NEXT_PUBLIC_DEMO_MODE` (e `NEXT_PUBLIC_SAVINT_HUB_URL`) come `ARG`,
  così da buildare hub / demo / scuola dalla stessa sorgente.
- **Dati (scelta 2026-06-30)**: il DB attuale di `savint.it/savint` (con i quiz già
  esistenti) **diventa il DB del demo** (`savint_demo`), con le sue immagini
  `uploads/`; l'**hub** (`savint_hub`) **parte da zero**. Diverge dal design
  originale (§3, demo pulita) ed elimina ogni migrazione di dati verso l'hub.

## Decomposizione (ordine di esecuzione)

### Chunk A — Codice (repo → CI → immagini)  *[primo piano di implementazione]*

- **A1. `basePath` configurabile da env** (§1 originale). Oggi `/savint` è cablato
  in ~6 punti (`next.config.ts`, `src/lib/auth/config.ts`, route nextauth, socket
  client/server, redirect hub-auth, link email). Tutti devono leggere un'unica
  fonte `BASE_PATH`. Criterio: con `BASE_PATH=""` l'app gira sulla radice; con
  `BASE_PATH=/demo` gira sotto `/demo` (auth, socket, email inclusi).
- **A2. Home page hub** (§2 originale). `src/app/page.tsx` ramifica per modalità:
  in `hub` mode rende una nuova `HubLandingPage` (hero, ricerca → `/explore`, quiz
  in evidenza, CTA, sezione "porta SAVINT nella tua scuola"); in `installation`
  mode resta `PlayerView`. i18n IT+EN.
- **A3. Cablare il pulsante "Pubblica"** nell'editor: `quiz/new` e `quiz/[id]/edit`
  passano `hubEnabled = hasHubOAuthConfig()` e l'eventuale `hubLink` a `QuizEditor`
  (la logica `PublishButton`/`PublishModal` esiste già). ~1 riga per pagina.
- **A4. Script `register-installation`**: `tsx scripts/register-installation.ts
  --name "<scuola>" --email <contatto>` → genera `clientId` + `clientSecret`,
  hasha il secret (bcrypt, come `promote-hub-admin.ts`), crea il record
  `Installation`, stampa il `clientSecret` una sola volta.
- **A5. Build-arg nel `Dockerfile`**: esporre `BASE_PATH`,
  `NEXT_PUBLIC_DEMO_MODE`, `NEXT_PUBLIC_SAVINT_HUB_URL` come `ARG`/`ENV` prima di
  `npm run build`.

### Chunk B — Deploy savint.it (runbook, eseguito a mano)

Sul server di savint.it, con Docker + nginx host:

```
savint.it (nginx host, HTTPS via certbot)
├── location /       → 127.0.0.1:<porta-hub>   container SAVINT_MODE=hub  BASE_PATH=""   DB savint_hub
└── location /demo   → 127.0.0.1:<porta-demo>  container SAVINT_MODE=installation DEMO_MODE=true BASE_PATH=/demo DB savint_demo
                       (la demo punta SAVINT_HUB_URL=https://savint.it)
```

Passi: build/immagini per le due varianti; due stack compose (o un compose con due
servizi app + due DB); config SMTP (`HUB_SMTP_*`, `HUB_EMAIL_FROM`, `HUB_BASE_URL`);
redirect URI Google `https://savint.it/api/auth/callback/google`; server block
nginx con header WebSocket e `client_max_body_size`; `prisma migrate deploy` su
entrambi i DB. **Hub `savint_hub`: parte vuoto** (solo migrazioni + seed admin).
**Demo `savint_demo`: ripristino del DB attuale di `/savint`** (dump `pg_dump` +
cartella `uploads/`, stessa procedura della scuola), così i quiz esistenti si
conservano. Infine **dismissione del vecchio `/savint` bare-metal** (rimozione
location nginx, stop processo PM2).

### Chunk C — Onboarding della scuola (runbook)

Lanciare `register-installation` sull'hub per `quiz.paolosarpi.edu.it` → ottenere
`client_id`/`secret` → metterli nel `.env` della scuola con
`SAVINT_HUB_URL=https://savint.it` → ricaricare lo stack scuola → verificare:
il docente collega l'account hub, pubblica un quiz, lo ritrova su `/explore`.

## Decisioni aperte (da chiudere in fase di piano)

1. **L'hub può riusare l'immagine `latest`** (build con `NEXT_PUBLIC_DEMO_MODE=true`)
   o serve una build dedicata con `NEXT_PUBLIC_DEMO_MODE=false`? Da verificare se il
   flag demo influenza la UI in `hub` mode.
2. **DB**: un Postgres per stack, oppure un'unica istanza Postgres con due database
   (`savint_hub`, `savint_demo`)?
3. **Provider SMTP** per le email hub (verifica/reset).
4. **CI**: pubblicare anche le immagini hub/demo su GHCR, o buildarle sul server?

## Fuori ambito (fase 2)

- Auto-registrazione delle installazioni (self-service OAuth client).
- Storage immagini dedicato (oggi base64/inline).
- Analytics avanzate per i quiz dell'hub.

## Criteri di successo (MVP online, Docker)

1. `https://savint.it` mostra la home hub curata; `/explore`, dettaglio quiz,
   self-practice, profili e account funzionano sulla radice (`BASE_PATH=""`).
2. Registrazione hub con email di verifica realmente recapitata (SMTP ok).
3. `https://savint.it/demo` permette di provare il sistema senza installazione.
4. Una scuola (quiz.paolosarpi.edu.it) collega l'account via OAuth e
   cerca/scarica/**pubblica** quiz sull'hub.
5. HTTPS valido; stack Docker persistenti al reboot (`restart: unless-stopped`).
