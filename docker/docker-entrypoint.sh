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
