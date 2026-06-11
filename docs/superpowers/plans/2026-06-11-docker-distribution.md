# Distribuzione Docker SAVINT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stack docker-compose (app Node.js + PostgreSQL + nginx) con primo avvio completamente automatico, immagine pubblicata su ghcr.io, per l'auto-hosting delle istanze di somministrazione quiz da parte delle scuole.

**Architecture:** Dockerfile multi-stage che builda Next.js e gira `tsx src/server.ts` (parità col deploy pm2 attuale); entrypoint che attende il DB, applica `prisma migrate deploy` e fa il seed solo a DB vuoto; nginx come reverse proxy con supporto websocket; GitHub Actions pubblica l'immagine su ghcr.io.

**Tech Stack:** Docker / docker-compose, node:20-bookworm-slim, postgres:16-alpine, nginx:alpine, GitHub Actions (docker/build-push-action).

**Spec:** `docs/superpowers/specs/2026-06-11-docker-distribution-design.md`

**⚠️ Prerequisito esecuzione:** su questa macchina (Mac di sviluppo) Docker NON è installato (`which docker` → not found). I task 2 e 7 richiedono Docker Desktop o colima. I file si possono comunque scrivere e committare; la validazione del build avviene anche in CI (task 6). Se Docker manca, segnare i passi di verifica come "da eseguire su macchina con Docker" e dirlo esplicitamente all'utente — non dichiarare mai verificato ciò che non è stato eseguito.

**Fatti del codebase rilevanti (verificati):**
- Server custom: `src/server.ts`, avviato in produzione con `tsx src/server.ts`; socket.io su path `${BASE_PATH}/api/socketio`. Nel Docker `BASE_PATH` resta vuoto (app alla radice).
- `tsx` oggi è in `devDependencies` ma serve a runtime (task 1 lo sposta).
- Seed: `prisma/seed.ts` (utenti demo `docente@scuola.it` / `admin@scuola.it` + quiz demo). Gli utenti usano `upsert` ma i quiz usano `create` → rieseguire il seed duplica i quiz. Per questo l'entrypoint fa il seed SOLO se la tabella `User` è vuota. Lanciare con `npx tsx prisma/seed.ts` (NON `prisma db seed`: con `prisma.config.ts` presente la chiave `package.json#prisma.seed` è ambigua).
- Upload immagini quiz: scritti in `<cwd>/public/uploads` (`src/app/api/upload/route.ts:54`) → serve un volume su `/app/public/uploads`.
- `NEXT_PUBLIC_DEMO_MODE` è inlined al build nel bundle client (`src/app/(auth)/login/page.tsx` è `"use client"`): l'immagine pubblicata va buildata con `NEXT_PUBLIC_DEMO_MODE=true`. Il gate vero del login demo è `DEMO_MODE` lato server (runtime, `src/lib/auth/config.ts`).
- `prisma.config.ts` importa `dotenv/config`: dotenv è disponibile transitivamente via `prisma` (dipendenza di produzione) — ok con `--omit=dev`.
- Messaggi i18n in `src/messages/` (coperti copiando `src/`). Asset emoticon in `public/emoticons/`.
- `prisma.config.ts` ha `engine: "classic"` → binari nativi: build e runtime devono usare la stessa base Debian (bookworm-slim) con `openssl` installato.

---

### Task 1: Spostare `tsx` nelle dependencies

`tsx` è usato in produzione (`start:custom`, entrypoint Docker, seed) ma è in `devDependencies`: con `npm ci --omit=dev` nell'immagine finale mancherebbe.

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json` (rigenerato da npm)

- [ ] **Step 1: Spostare la riga**

In `package.json`, rimuovere `"tsx": "^4.21.0",` dal blocco `devDependencies` e aggiungerla (in ordine alfabetico, dopo `"tailwind-merge"`) nel blocco `dependencies`:

```json
    "tailwind-merge": "^3.5.0",
    "tsx": "^4.21.0",
    "tw-animate-css": "^1.4.0",
```

- [ ] **Step 2: Rigenerare il lockfile**

Run: `npm install`
Expected: termina senza errori, `package-lock.json` modificato.

- [ ] **Step 3: Verificare**

Run: `npm ls tsx`
Expected: `tsx@4.x` elencato come dipendenza diretta (non `dev`).

Run: `npm run test:run`
Expected: suite vitest verde (nessuna regressione).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "build: sposta tsx nelle dependencies (richiesto a runtime)"
```

---

### Task 2: `.dockerignore`, entrypoint e `Dockerfile`

**Files:**
- Create: `.dockerignore` (alla radice del repo)
- Create: `docker/docker-entrypoint.sh`
- Create: `docker/Dockerfile`

- [ ] **Step 1: Creare `.dockerignore`**

```
node_modules
.next
.git
.claire
.github
docs
tests
test-results
playwright-report
landing
deploy
emoticons
logo
docker
*.md
.env
.env.*
!.env.example
tsconfig.tsbuildinfo
update-server.sh
```

(Nota: `docker/` è escluso dal contesto tranne che per il COPY dell'entrypoint — vedi sotto: l'entrypoint viene copiato via `COPY docker/docker-entrypoint.sh`, quindi serve l'eccezione `!docker/docker-entrypoint.sh` dopo `docker`.)

Aggiungere subito dopo la riga `docker`:

```
!docker/docker-entrypoint.sh
```

- [ ] **Step 2: Creare `docker/docker-entrypoint.sh`**

```sh
#!/bin/sh
set -e

echo "[savint] Attendo il database ed applico le migrazioni..."
ATTEMPTS=0
MAX_ATTEMPTS=30
until npx prisma migrate deploy; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge "$MAX_ATTEMPTS" ]; then
    echo "[savint] ERRORE: migrazioni non applicate dopo $MAX_ATTEMPTS tentativi." >&2
    echo "[savint] Controlla POSTGRES_PASSWORD nel .env e i log del db: docker compose logs db" >&2
    exit 1
  fi
  echo "[savint] Database non pronto (tentativo $ATTEMPTS/$MAX_ATTEMPTS), riprovo tra 2 secondi..."
  sleep 2
done

USER_COUNT=$(node -e 'const { PrismaClient } = require("@prisma/client"); const p = new PrismaClient(); p.user.count().then((c) => { console.log(c); process.exit(0); }).catch((e) => { console.error(e.message); process.exit(1); });')
if [ "$USER_COUNT" = "0" ]; then
  echo "[savint] Database vuoto: eseguo il seed demo..."
  npx tsx prisma/seed.ts
else
  echo "[savint] Database gia' inizializzato ($USER_COUNT utenti), salto il seed."
fi

echo "[savint] Avvio SAVINT..."
exec npx tsx src/server.ts
```

- [ ] **Step 3: Verificare la sintassi dello script**

Run: `sh -n docker/docker-entrypoint.sh && echo OK`
Expected: `OK`

- [ ] **Step 4: Creare `docker/Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1
# Build context: la RADICE del repo  →  docker build -f docker/Dockerfile .

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
# Variabili fittizie: next build non deve raggiungere un DB reale
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    NEXTAUTH_SECRET=build-only-secret \
    AUTH_TRUST_HOST=true \
    NEXT_PUBLIC_DEMO_MODE=true
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Client Prisma generato nello stage di build (stessa base Debian → binari compatibili)
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/.next ./.next
COPY public ./public
COPY src ./src
COPY prisma ./prisma
COPY next.config.ts tsconfig.json prisma.config.ts components.json postcss.config.mjs ./
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
```

- [ ] **Step 5: Build di verifica (richiede Docker)**

Run (dalla radice del repo): `docker build -t ghcr.io/baolcristian/savint:latest -f docker/Dockerfile .`
Expected: build completato senza errori.

Se fallisce su `npm run build` per accesso al DB durante il prerender di qualche pagina: identificare la pagina dal log e renderla dinamica (`export const dynamic = "force-dynamic"`), poi rilanciare. Non rimuovere le variabili fittizie.

Se Docker non è disponibile: dirlo esplicitamente e demandare la validazione al workflow CI (task 6) — NON dichiarare il build verificato.

- [ ] **Step 6: Commit**

```bash
git add .dockerignore docker/Dockerfile docker/docker-entrypoint.sh
git commit -m "feat(docker): Dockerfile multi-stage ed entrypoint con migrate+seed automatici"
```

---

### Task 3: Configurazione nginx

**Files:**
- Create: `docker/nginx.conf`

- [ ] **Step 1: Creare `docker/nginx.conf`**

```nginx
# Reverse proxy per SAVINT.
# HTTP sulla porta 80. Per HTTPS: copia fullchain.pem e privkey.pem in ./certs/
# e decommenta il blocco "server" in fondo.

server {
    listen 80;
    server_name _;

    # Upload quiz (.qlz) fino a 50 MB
    client_max_body_size 50m;

    location / {
        proxy_pass http://app:3000;
        proxy_http_version 1.1;
        # WebSocket (socket.io per le sessioni live)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
    }
}

# ── HTTPS (opzionale) ──────────────────────────────────────────────
# server {
#     listen 443 ssl;
#     server_name _;
#
#     ssl_certificate     /etc/nginx/certs/fullchain.pem;
#     ssl_certificate_key /etc/nginx/certs/privkey.pem;
#
#     client_max_body_size 50m;
#
#     location / {
#         proxy_pass http://app:3000;
#         proxy_http_version 1.1;
#         proxy_set_header Upgrade $http_upgrade;
#         proxy_set_header Connection "upgrade";
#         proxy_set_header Host $host;
#         proxy_set_header X-Forwarded-Host $host;
#         proxy_set_header X-Real-IP $remote_addr;
#         proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#         proxy_set_header X-Forwarded-Proto $scheme;
#         proxy_read_timeout 86400s;
#     }
# }
```

- [ ] **Step 2: Commit**

```bash
git add docker/nginx.conf
git commit -m "feat(docker): config nginx con proxy websocket e blocco HTTPS opzionale"
```

---

### Task 4: docker-compose, .env.example e setup.sh

**Files:**
- Create: `docker/docker-compose.yml`
- Create: `docker/.env.example`
- Create: `docker/setup.sh`

- [ ] **Step 1: Creare `docker/docker-compose.yml`**

```yaml
name: savint

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: savint
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Imposta POSTGRES_PASSWORD nel file .env (usa ./setup.sh)}
      POSTGRES_DB: savint
    volumes:
      - savint-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U savint -d savint"]
      interval: 5s
      timeout: 5s
      retries: 12

  app:
    image: ghcr.io/baolcristian/savint:${SAVINT_VERSION:-latest}
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql://savint:${POSTGRES_PASSWORD}@db:5432/savint
      NEXTAUTH_SECRET: ${NEXTAUTH_SECRET:?Imposta NEXTAUTH_SECRET nel file .env (usa ./setup.sh)}
      AUTH_TRUST_HOST: "true"
      AUTH_URL: ${AUTH_URL:-}
      DEMO_MODE: ${DEMO_MODE:-true}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID:-}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET:-}
      PIXABAY_API_KEY: ${PIXABAY_API_KEY:-}
      SESSION_TIMEOUT_HOURS: ${SESSION_TIMEOUT_HOURS:-2}
      SESSION_RETENTION_DAYS: ${SESSION_RETENTION_DAYS:-365}
    volumes:
      - savint-uploads:/app/public/uploads
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/').then(r => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 60s

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    depends_on:
      - app
    ports:
      - "${HTTP_PORT:-80}:80"
      - "${HTTPS_PORT:-443}:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro

volumes:
  savint-db-data:
  savint-uploads:
```

(Nota: `NEXT_PUBLIC_DEMO_MODE` NON è qui — è inlined nell'immagine al build. `DEMO_MODE` runtime controlla il provider di login.)

- [ ] **Step 2: Validare la sintassi del compose (richiede Docker)**

Run: `cd docker && POSTGRES_PASSWORD=x NEXTAUTH_SECRET=x docker compose config --quiet && echo OK`
Expected: `OK`. Senza Docker: saltare e dichiararlo.

- [ ] **Step 3: Creare `docker/.env.example`**

```env
# ── Configurazione SAVINT (Docker) ─────────────────────────────────
# Copia questo file in .env (o esegui ./setup.sh che genera i secret).

# Password del database PostgreSQL (solo interna allo stack)
POSTGRES_PASSWORD=cambiami-esegui-setup-sh

# Secret di NextAuth — genera con: openssl rand -base64 32
NEXTAUTH_SECRET=cambiami-esegui-setup-sh

# Login demo (email senza password). Per disattivarlo: DEMO_MODE=false
# e configura Google OAuth qui sotto.
DEMO_MODE=true

# URL pubblico dell'installazione. Di norma non serve (AUTH_TRUST_HOST
# deriva l'URL dalle richieste); impostalo se i redirect di login sono errati.
# AUTH_URL=https://savint.tuascuola.it

# Google OAuth (opzionale) — redirect URI da registrare:
#   https://<tuo-dominio>/api/auth/callback/google
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=

# Ricerca immagini nell'editor (opzionale)
# PIXABAY_API_KEY=

# Porte esposte sull'host (default 80/443)
# HTTP_PORT=80
# HTTPS_PORT=443

# Versione immagine (default: latest)
# SAVINT_VERSION=latest

# Timeout sessioni quiz in ore / conservazione sessioni in giorni
# SESSION_TIMEOUT_HOURS=2
# SESSION_RETENTION_DAYS=365
```

- [ ] **Step 4: Creare `docker/setup.sh`**

```sh
#!/bin/sh
# Prepara il file .env con secret generati. Eseguire dalla cartella docker/.
set -e
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo "Il file .env esiste gia': non lo sovrascrivo."
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "ERRORE: openssl non trovato. Copia .env.example in .env e imposta i secret a mano." >&2
  exit 1
fi

cp .env.example .env
NEXTAUTH_SECRET=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)

sed "s|^NEXTAUTH_SECRET=.*|NEXTAUTH_SECRET=${NEXTAUTH_SECRET}|" .env > .env.tmp && mv .env.tmp .env
sed "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" .env > .env.tmp && mv .env.tmp .env

mkdir -p certs

echo "File .env creato con secret generati."
echo "Ora avvia SAVINT con:  docker compose up -d"
```

- [ ] **Step 5: Testare setup.sh in isolamento**

```bash
sh -n docker/setup.sh && echo SYNTAX-OK
TMP=$(mktemp -d) && cp docker/setup.sh docker/.env.example "$TMP/" && sh "$TMP/setup.sh" && grep -c "cambiami" "$TMP/.env" || true
```

Expected: `SYNTAX-OK`, poi "File .env creato...", e il `grep -c` deve stampare `0` (nessun placeholder rimasto). Rilanciando `sh "$TMP/setup.sh"` deve stampare "esiste gia'". Pulizia: `rm -rf "$TMP"`.

- [ ] **Step 6: Rendere eseguibile e committare**

```bash
chmod +x docker/setup.sh docker/docker-entrypoint.sh
git add docker/docker-compose.yml docker/.env.example docker/setup.sh
git commit -m "feat(docker): stack compose app+db+nginx con setup.sh per i secret"
```

---

### Task 5: README per le scuole

**Files:**
- Create: `docker/README.md`

- [ ] **Step 1: Creare `docker/README.md`**

```markdown
# SAVINT — Installazione con Docker

Istanza SAVINT self-hosted per la somministrazione dei quiz, con ambiente
preconfigurato: app Node.js, database PostgreSQL e reverse proxy nginx.

## Requisiti

- Un server (Linux consigliato) con [Docker](https://docs.docker.com/engine/install/)
  e il plugin Docker Compose (`docker compose version` per verificare).
- Porta 80 libera (configurabile con `HTTP_PORT` nel `.env`).

## Installazione

1. Scarica questa cartella `docker/` sul server (non serve clonare tutto il repo).
2. Genera la configurazione:

   ```bash
   ./setup.sh
   ```

   (oppure copia `.env.example` in `.env` e imposta a mano `POSTGRES_PASSWORD`
   e `NEXTAUTH_SECRET`, quest'ultimo con `openssl rand -base64 32`).

3. Avvia lo stack:

   ```bash
   docker compose up -d
   ```

   Al primo avvio vengono scaricate le immagini, applicate le migrazioni del
   database e creati i dati demo. Segui i log con `docker compose logs -f app`.

4. Apri `http://<indirizzo-del-server>` ed entra con il login demo:
   `docente@scuola.it` (oppure `admin@scuola.it` per l'amministrazione).

## Aggiornamento

```bash
docker compose pull
docker compose up -d
```

Le migrazioni del database vengono applicate automaticamente all'avvio.
I dati (database e immagini caricate) vivono nei volume Docker
`savint-db-data` e `savint-uploads` e sopravvivono agli aggiornamenti.

## HTTPS (opzionale)

1. Procurati certificato e chiave (es. con certbot sull'host) e copiali in
   `./certs/fullchain.pem` e `./certs/privkey.pem`.
2. Decommenta il blocco `server { listen 443 ssl; ... }` in `nginx.conf`.
3. `docker compose restart nginx`

## Disattivare il login demo

Il login demo (email senza password) è pensato per provare il prodotto.
Per un uso reale configura Google OAuth:

1. Crea credenziali OAuth 2.0 su https://console.cloud.google.com/
   con redirect URI: `https://<tuo-dominio>/api/auth/callback/google`
2. Nel `.env` imposta `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e
   `DEMO_MODE=false`, poi `docker compose up -d`.

Nota: il pulsante del login demo resta visibile nella pagina di login
(è compilato nell'immagine), ma con `DEMO_MODE=false` non funziona.

## Backup del database

```bash
docker compose exec db pg_dump -U savint savint > backup-$(date +%F).sql
```

Ripristino:

```bash
cat backup-YYYY-MM-DD.sql | docker compose exec -T db psql -U savint savint
```

## Problemi comuni

- **L'app si riavvia in loop**: `docker compose logs app` — quasi sempre
  `POSTGRES_PASSWORD` cambiata dopo il primo avvio (il DB conserva quella
  vecchia nel volume). Ripristina la password originale nel `.env`.
- **502 da nginx**: l'app sta ancora partendo; attendi e ricontrolla
  `docker compose ps` (lo stato deve diventare `healthy`).
- **Porta 80 occupata**: imposta `HTTP_PORT=8080` nel `.env` e rilancia
  `docker compose up -d`.
```

- [ ] **Step 2: Commit**

```bash
git add docker/README.md
git commit -m "docs(docker): guida installazione per le scuole"
```

---

### Task 6: Workflow GitHub Actions per pubblicare l'immagine

**Files:**
- Create: `.github/workflows/docker-publish.yml`

- [ ] **Step 1: Creare `.github/workflows/docker-publish.yml`**

```yaml
name: docker-publish

on:
  push:
    branches: [main]
    tags: ["v*"]
  workflow_dispatch:

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - uses: docker/setup-buildx-action@v3

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ghcr.io/${{ github.repository_owner }}/savint
          tags: |
            type=raw,value=latest,enable={{is_default_branch}}
            type=semver,pattern={{version}}

      - uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

(`metadata-action` converte automaticamente `BaolCristian` in minuscolo per ghcr.)

- [ ] **Step 2: Commit e push**

```bash
git add .github/workflows/docker-publish.yml
git commit -m "ci: pubblica immagine Docker su ghcr.io"
git push
```

- [ ] **Step 3: Verificare il run in CI**

Run: `gh run watch` (oppure `gh run list --workflow=docker-publish --limit 1`)
Expected: run verde; l'immagine compare in `gh api /users/BaolCristian/packages?package_type=container` o nella pagina Packages del repo.

Se il build fallisce in CI, leggere il log (`gh run view --log-failed`), correggere il Dockerfile e ripetere. Questo passo è anche la validazione del task 2 se il build locale non era possibile.

Nota: al primo push del package può servire rendere l'immagine **pubblica** dalle impostazioni del package su GitHub (di default è privata) — altrimenti le scuole non possono fare `docker compose pull`. Segnalarlo all'utente: è un'azione da fare nell'interfaccia GitHub.

---

### Task 7: Verifica end-to-end dello stack (richiede Docker)

Nessun file nuovo: solo verifica. Se Docker non è disponibile su questa macchina, riportare all'utente l'elenco esatto dei comandi da eseguire su una macchina con Docker e fermarsi — NON dichiarare la verifica completata.

- [ ] **Step 1: Build locale dell'immagine col tag usato dal compose**

```bash
docker build -t ghcr.io/baolcristian/savint:latest -f docker/Dockerfile .
```

Expected: build ok. (Compose userà questa immagine locale senza fare pull.)

- [ ] **Step 2: Primo avvio**

```bash
cd docker
./setup.sh
HTTP_PORT=8080 docker compose up -d
docker compose logs -f app
```

Expected nei log app, in ordine: migrazioni applicate, `[savint] Database vuoto: eseguo il seed demo...`, `> Ready on http://localhost:3000`.

- [ ] **Step 3: Smoke test HTTP attraverso nginx**

```bash
curl -sI http://localhost:8080/ | head -1
curl -s http://localhost:8080/login | grep -o "docente@scuola.it" | head -1
```

Expected: prima riga `HTTP/1.1 200` (o 307 verso una pagina valida); il grep trova `docente@scuola.it` (form demo presente).

- [ ] **Step 4: Verifica websocket (socket.io handshake)**

```bash
curl -s "http://localhost:8080/api/socketio/?EIO=4&transport=polling" | head -c 100
```

Expected: risposta che inizia con `0{"sid":...` (handshake engine.io riuscito attraverso nginx).

- [ ] **Step 5: Verifica idempotenza di riavvio e persistenza**

```bash
docker compose restart app
docker compose logs app | grep "salto il seed"
```

Expected: `[savint] Database gia' inizializzato (N utenti), salto il seed.` — il seed NON viene rieseguito.

- [ ] **Step 6: Verifica funzionale nel browser**

Aprire `http://localhost:8080/login`, entrare come `docente@scuola.it`, creare un quiz, avviare una sessione live e collegarsi come studente da una seconda finestra in incognito (il PIN deve funzionare e le risposte arrivare in tempo reale → conferma socket.io).

- [ ] **Step 7: Pulizia ambiente di test**

```bash
docker compose down -v   # ATTENZIONE: -v elimina i volume — solo in ambiente di test
```

- [ ] **Step 8: Riportare l'esito**

Comunicare all'utente cosa è stato verificato (con output) e cosa eventualmente resta da fare a mano (es. rendere pubblico il package ghcr, eseguire la verifica su macchina con Docker).
