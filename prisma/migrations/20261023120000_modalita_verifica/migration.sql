-- Modalità verifica: tipo del Compito (COMPITO / VERIFICA), la riga Verifica
-- 1:1 con il compito, una ProvaVerifica per studente con i suoi tentativi
-- (al massimo uno per esercizio) e le uscite (EventoVerifica), le misure PDP
-- per classe e studente, punti e sottoinsieme PDP sui blocchi. Solo
-- aggiunte: i compiti esistenti diventano COMPITO, i tentativi esistenti
-- restano senza prova, le regole esistenti senza punti. Senza la riga che
-- Prisma rigenera ogni volta sul default di PracticeRun."expiresAt" (deriva
-- nota, come nelle migrazioni precedenti).

-- CreateEnum
CREATE TYPE "TipoCompito" AS ENUM ('COMPITO', 'VERIFICA');

-- CreateEnum
CREATE TYPE "ModoStrumento" AS ENUM ('NESSUNO', 'SOLO_PDP', 'TUTTI');

-- CreateEnum
CREATE TYPE "TipoEventoVerifica" AS ENUM ('USCITA', 'RIENTRO');

-- CreateEnum
CREATE TYPE "MotivoUscita" AS ENUM ('SCHERMO_INTERO', 'SCHEDA', 'FOCUS');

-- AlterTable
ALTER TABLE "Tentativo" ADD COLUMN     "provaId" TEXT,
ADD COLUMN     "puntiManuali" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "BatteriaRegola" ADD COLUMN     "nonPerPdp" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "punti" DOUBLE PRECISION,
ADD COLUMN     "quantiPdp" INTEGER;

-- AlterTable
ALTER TABLE "Compito" ADD COLUMN     "tipo" "TipoCompito" NOT NULL DEFAULT 'COMPITO';

-- CreateTable
CREATE TABLE "Verifica" (
    "compitoId" TEXT NOT NULL,
    "durataMinuti" INTEGER NOT NULL,
    "avvioProgrammatoAt" TIMESTAMP(3),
    "avviataAt" TIMESTAMP(3),
    "chiusaAt" TIMESTAMP(3),
    "pubblicataAt" TIMESTAMP(3),
    "minutiExtra" INTEGER NOT NULL DEFAULT 0,
    "calcolatrice" "ModoStrumento" NOT NULL DEFAULT 'SOLO_PDP',
    "formulario" "ModoStrumento" NOT NULL DEFAULT 'SOLO_PDP',
    "formularioFile" TEXT,
    "layout" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verifica_pkey" PRIMARY KEY ("compitoId")
);

-- CreateTable
CREATE TABLE "ProvaVerifica" (
    "id" TEXT NOT NULL,
    "compitoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tempoExtraPct" INTEGER NOT NULL DEFAULT 0,
    "menoEsercizi" BOOLEAN NOT NULL DEFAULT false,
    "calcolatrice" BOOLEAN NOT NULL DEFAULT false,
    "formulario" BOOLEAN NOT NULL DEFAULT false,
    "minutiExtra" INTEGER NOT NULL DEFAULT 0,
    "inizioAt" TIMESTAMP(3),
    "recupero" BOOLEAN NOT NULL DEFAULT false,
    "posizioni" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "entrataAt" TIMESTAMP(3),
    "ultimoSalvataggioAt" TIMESTAMP(3),
    "consegnataAt" TIMESTAMP(3),
    "consegnaAutomatica" BOOLEAN NOT NULL DEFAULT false,
    "pubblicataAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvaVerifica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventoVerifica" (
    "id" TEXT NOT NULL,
    "provaId" TEXT NOT NULL,
    "tipo" "TipoEventoVerifica" NOT NULL,
    "motivo" "MotivoUscita",
    "at" TIMESTAMP(3) NOT NULL,
    "durataMs" INTEGER,

    CONSTRAINT "EventoVerifica_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MisurePdp" (
    "classeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "tempoExtraPct" INTEGER NOT NULL DEFAULT 0,
    "menoEsercizi" BOOLEAN NOT NULL DEFAULT false,
    "calcolatrice" BOOLEAN NOT NULL DEFAULT false,
    "formulario" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MisurePdp_pkey" PRIMARY KEY ("classeId","studentId")
);

-- CreateIndex
CREATE INDEX "ProvaVerifica_studentId_idx" ON "ProvaVerifica"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ProvaVerifica_compitoId_studentId_key" ON "ProvaVerifica"("compitoId", "studentId");

-- CreateIndex
CREATE INDEX "EventoVerifica_provaId_at_idx" ON "EventoVerifica"("provaId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Tentativo_provaId_esercizioVersioneId_key" ON "Tentativo"("provaId", "esercizioVersioneId");

-- AddForeignKey
ALTER TABLE "Tentativo" ADD CONSTRAINT "Tentativo_provaId_fkey" FOREIGN KEY ("provaId") REFERENCES "ProvaVerifica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Verifica" ADD CONSTRAINT "Verifica_compitoId_fkey" FOREIGN KEY ("compitoId") REFERENCES "Compito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvaVerifica" ADD CONSTRAINT "ProvaVerifica_compitoId_fkey" FOREIGN KEY ("compitoId") REFERENCES "Compito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvaVerifica" ADD CONSTRAINT "ProvaVerifica_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventoVerifica" ADD CONSTRAINT "EventoVerifica_provaId_fkey" FOREIGN KEY ("provaId") REFERENCES "ProvaVerifica"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisurePdp" ADD CONSTRAINT "MisurePdp_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MisurePdp" ADD CONSTRAINT "MisurePdp_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
