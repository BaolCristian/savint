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
