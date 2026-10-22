-- CreateEnum
CREATE TYPE "RuoloEsercizi" AS ENUM ('VISUALIZZATORE', 'COMMENTATORE', 'EDITOR');

-- AlterTable
ALTER TABLE "Contenitore" ADD COLUMN     "accessoScuola" "RuoloEsercizi";

-- AlterTable
ALTER TABLE "Esercizio" ADD COLUMN     "accessoScuola" "RuoloEsercizi";

-- Scritto a mano: gli esercizi e le raccolte nati prima della condivisione
-- erano modificabili da ogni docente; restano tali. Le righe nuove nascono
-- con accessoScuola NULL, cioè private.
UPDATE "Esercizio" SET "accessoScuola" = 'EDITOR';
UPDATE "Contenitore" SET "accessoScuola" = 'EDITOR';

-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';

-- CreateTable
CREATE TABLE "CondivisioneEsercizio" (
    "esercizioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruolo" "RuoloEsercizi" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondivisioneEsercizio_pkey" PRIMARY KEY ("esercizioId","userId")
);

-- CreateTable
CREATE TABLE "CondivisioneContenitore" (
    "contenitoreId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ruolo" "RuoloEsercizi" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondivisioneContenitore_pkey" PRIMARY KEY ("contenitoreId","userId")
);

-- CreateTable
CREATE TABLE "CondivisioneArgomento" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "chiave" TEXT NOT NULL,
    "argomento" TEXT NOT NULL,
    "userId" TEXT,
    "ruolo" "RuoloEsercizi" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CondivisioneArgomento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommentoEsercizio" (
    "id" TEXT NOT NULL,
    "esercizioId" TEXT NOT NULL,
    "autoreId" TEXT NOT NULL,
    "parentId" TEXT,
    "testo" TEXT NOT NULL,
    "risoltoAt" TIMESTAMP(3),
    "risoltoDaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommentoEsercizio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CondivisioneArgomento_ownerId_chiave_idx" ON "CondivisioneArgomento"("ownerId", "chiave");

-- CreateIndex
CREATE INDEX "CommentoEsercizio_esercizioId_idx" ON "CommentoEsercizio"("esercizioId");

-- Scritto a mano: authorId finora era un testo libero senza vincolo; un
-- autore che non esiste più come utente diventa NULL, altrimenti la chiave
-- esterna qui sotto non si potrebbe aggiungere.
UPDATE "Esercizio" SET "authorId" = NULL WHERE "authorId" IS NOT NULL AND "authorId" NOT IN (SELECT id FROM "User");

-- AddForeignKey
ALTER TABLE "Esercizio" ADD CONSTRAINT "Esercizio_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondivisioneEsercizio" ADD CONSTRAINT "CondivisioneEsercizio_esercizioId_fkey" FOREIGN KEY ("esercizioId") REFERENCES "Esercizio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondivisioneEsercizio" ADD CONSTRAINT "CondivisioneEsercizio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondivisioneContenitore" ADD CONSTRAINT "CondivisioneContenitore_contenitoreId_fkey" FOREIGN KEY ("contenitoreId") REFERENCES "Contenitore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondivisioneContenitore" ADD CONSTRAINT "CondivisioneContenitore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondivisioneArgomento" ADD CONSTRAINT "CondivisioneArgomento_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CondivisioneArgomento" ADD CONSTRAINT "CondivisioneArgomento_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentoEsercizio" ADD CONSTRAINT "CommentoEsercizio_esercizioId_fkey" FOREIGN KEY ("esercizioId") REFERENCES "Esercizio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentoEsercizio" ADD CONSTRAINT "CommentoEsercizio_autoreId_fkey" FOREIGN KEY ("autoreId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentoEsercizio" ADD CONSTRAINT "CommentoEsercizio_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CommentoEsercizio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommentoEsercizio" ADD CONSTRAINT "CommentoEsercizio_risoltoDaId_fkey" FOREIGN KEY ("risoltoDaId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
