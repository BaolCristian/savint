-- Nuovo compito: modo di estrazione sul Compito (CLASSE / STUDENTE), bacino
-- congelato e modello di provenienza, estrazioni per studente e blocchi
-- "scelti a mano" su BatteriaRegola. I compiti esistenti diventano CLASSE con
-- bacini e modelloId nulli: per loro non cambia niente. Tolta la riga che
-- Prisma rigenera ogni volta sul default di PracticeRun."expiresAt" (deriva
-- nota, come nelle migrazioni precedenti).

-- CreateEnum
CREATE TYPE "ModoEstrazione" AS ENUM ('CLASSE', 'STUDENTE');

-- AlterTable
ALTER TABLE "BatteriaRegola" ADD COLUMN     "esercizioIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Compito" ADD COLUMN     "bacini" JSONB,
ADD COLUMN     "modelloId" TEXT,
ADD COLUMN     "modo" "ModoEstrazione" NOT NULL DEFAULT 'CLASSE';

-- CreateTable
CREATE TABLE "EstrazioneStudente" (
    "compitoId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "versionIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EstrazioneStudente_pkey" PRIMARY KEY ("compitoId","studentId")
);

-- AddForeignKey
ALTER TABLE "Compito" ADD CONSTRAINT "Compito_modelloId_fkey" FOREIGN KEY ("modelloId") REFERENCES "Batteria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstrazioneStudente" ADD CONSTRAINT "EstrazioneStudente_compitoId_fkey" FOREIGN KEY ("compitoId") REFERENCES "Compito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EstrazioneStudente" ADD CONSTRAINT "EstrazioneStudente_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
