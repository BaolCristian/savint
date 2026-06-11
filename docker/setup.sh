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
