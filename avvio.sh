#!/bin/bash
set -e

echo "=== Quiz Live - Avvio rapido ==="
echo ""

# 1. Controlla che Node.js sia installato
if ! command -v node &> /dev/null; then
  echo "ERRORE: Node.js non trovato. Installalo da https://nodejs.org"
  exit 1
fi


echo "[2/6] Installo dipendenze npm..."
npm install

echo "[3/6] Configuro file .env..."
if [ ! -f .env ]; then
  SECRET=$(openssl rand -base64 32)
  cat > .env << EOF
DATABASE_URL=postgresql://quizlive:quizlive@localhost:5432/quizlive
GOOGLE_CLIENT_ID=dev-placeholder
GOOGLE_CLIENT_SECRET=dev-placeholder
NEXTAUTH_SECRET=$SECRET
NEXTAUTH_URL=http://localhost:3000
EOF
  echo "  File .env creato con NEXTAUTH_SECRET generato automaticamente."
else
  echo "  File .env esiste gia, lo lascio invariato."
fi

echo "[4/6] Genero client Prisma..."
npx prisma generate

echo "[5/6] Applico migrazioni al database..."
npx prisma migrate dev --name init 2>/dev/null || npx prisma migrate dev

echo "[6/6] Carico dati demo (docente + quiz di esempio)..."
npx prisma db seed

echo ""
echo "=== Tutto pronto! ==="
echo ""
echo "Avvio il server di sviluppo..."
echo "  -> http://localhost:3000/login"
echo "  -> Clicca 'Entra come docente' per accedere come Prof. Demo"
echo ""

npm run dev:custom
