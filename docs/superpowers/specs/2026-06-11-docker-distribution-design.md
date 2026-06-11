# Distribuzione Docker di SAVINT (istanza somministrazione quiz)

**Data:** 2026-06-11
**Stato:** approvato

## Obiettivo

Permettere alle scuole di auto-ospitare un'istanza SAVINT (modalità installation,
somministrazione quiz) con un ambiente già configurato — Node.js, nginx,
PostgreSQL — riducendo l'installazione a: scaricare la cartella `docker/`,
impostare il `.env`, eseguire `docker compose up -d`.

## Decisioni

| Tema | Decisione |
|---|---|
| Architettura | docker-compose multi-container: `app`, `db`, `nginx` |
| Distribuzione immagine | Pubblicata su GitHub Container Registry (ghcr.io) via GitHub Actions; la scuola non builda nulla |
| HTTPS | nginx serve HTTP sulla 80; blocco 443 attivabile montando certificati propri in `./certs/` (niente certbot integrato: deve funzionare anche in LAN senza dominio pubblico) |
| Primo avvio | Tutto automatico: attesa DB → `prisma migrate deploy` → seed solo se DB vuoto → start |
| Auth di default | `DEMO_MODE=true` (login email senza password); Google OAuth / login hub attivabili poi nel `.env` |
| Build immagine | Multi-stage, runtime `tsx src/server.ts` come la produzione attuale (parità col deploy pm2; l'ottimizzazione `output: "standalone"` è rimandata) |
| basePath | Vuoto: l'istanza scuola gira alla radice del server |

## Struttura nel repo

```
docker/
  Dockerfile              # multi-stage build dell'app
  docker-entrypoint.sh    # attesa DB → migrate deploy → seed condizionale → start
  docker-compose.yml      # servizi: app, db, nginx
  nginx.conf              # reverse proxy verso app:3000, supporto websocket, 443 opzionale
  .env.example            # variabili essenziali, demo mode già attivo
  setup.sh                # opzionale: genera NEXTAUTH_SECRET e password DB nel .env
  README.md               # guida installazione per le scuole (italiano)
.github/workflows/docker-publish.yml   # build & push immagine su ghcr.io
```

## Componenti

### Dockerfile (app)

- Stage build: `node:20-alpine` (o slim se i binari Prisma lo richiedono),
  `npm ci`, `npx prisma generate`, `npm run build`.
- Stage finale: dipendenze di produzione + `tsx`, output `.next`, sorgenti
  necessari al server custom; comando `tsx src/server.ts` con
  `NODE_ENV=production`.
- `prisma` CLI disponibile nell'immagine finale per `migrate deploy` e seed.

### docker-entrypoint.sh

1. Attende PostgreSQL con retry e timeout (errore chiaro se credenziali errate).
2. `npx prisma migrate deploy` a ogni avvio (idempotente — copre anche gli
   aggiornamenti).
3. Seed (`prisma db seed`) solo se la tabella `User` è vuota.
4. Avvia il server.

### docker-compose.yml

- `db`: `postgres:16-alpine`, volume named `savint-db-data`, healthcheck
  `pg_isready`, porta NON esposta sull'host.
- `app`: `ghcr.io/baolcristian/savint:latest`, `depends_on: db (healthy)`,
  env da `.env`, healthcheck HTTP su `/`, `restart: unless-stopped`.
- `nginx`: `nginx:alpine`, porte 80 (e 443 se certificati presenti), config
  montata da `nginx.conf`, `restart: unless-stopped`.

### nginx.conf

- Proxy verso `app:3000` con gli header già usati in produzione
  (`Upgrade`/`Connection` per socket.io, `X-Forwarded-*`, `Host`).
- Blocco `server` 443 commentato/condizionale: si attiva montando
  `./certs/fullchain.pem` e `./certs/privkey.pem`.

### .env.example (docker)

Solo l'essenziale: `POSTGRES_PASSWORD` (riusata per costruire `DATABASE_URL`),
`NEXTAUTH_SECRET`, `AUTH_URL`/`AUTH_TRUST_HOST`, `DEMO_MODE=true`,
`NEXT_PUBLIC_DEMO_MODE=true`. Variabili opzionali (Google OAuth, hub, Pixabay,
timeout sessioni) documentate come commenti.

### setup.sh

Copia `.env.example` in `.env` se assente e genera `NEXTAUTH_SECRET` e
`POSTGRES_PASSWORD` con `openssl rand`. Facoltativo: tutto è fattibile anche a
mano.

### CI: docker-publish.yml

GitHub Actions: a ogni push su `main` builda e pusha `ghcr.io/.../savint:latest`;
a ogni tag `v*` pusha anche il tag versione. Il build in CI valida il Dockerfile
ad ogni modifica.

## Flusso d'installazione (scuola)

1. Scarica la cartella `docker/` (o release zip).
2. `./setup.sh` (o copia/edita `.env` a mano).
3. `docker compose up -d`.
4. Apre `http://<server>` e accede col login demo (`docente@scuola.it`).

Aggiornamento: `docker compose pull && docker compose up -d` — le migrazioni
girano da sole all'avvio.

## Gestione errori

- Entrypoint: timeout sull'attesa DB con messaggio esplicito; exit non-zero se
  `migrate deploy` fallisce (il container riparte per `restart: unless-stopped`,
  i log raccontano il perché).
- Healthcheck su `db` e `app`; nginx parte comunque e risponde 502 finché l'app
  non è pronta.

## Test / verifica

- Stack completo in locale: build immagine, `up`, seed eseguito, login demo,
  creazione quiz e somministrazione con socket.io attraverso nginx (websocket).
- Riavvio dello stack: il seed NON viene rieseguito, i dati persistono nel
  volume.
- CI builda l'immagine a ogni push che tocca i file rilevanti.

## Fuori scope

- Certbot/Let's Encrypt integrato.
- Modalità hub in Docker.
- Immagine ottimizzata con `output: "standalone"`.
- Backup automatici del database (documentato nel README come comando
  `pg_dump` manuale).
