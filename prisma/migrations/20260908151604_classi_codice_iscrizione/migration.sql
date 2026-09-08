-- Come in 20260906202645_add_tentativo_abandoned_status e in
-- 20260906221659_esercizi_compiti: `prisma migrate diff` proponeva qui un
-- `ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() +
-- interval '1 hour'`, riasserzione del default già applicato (drift spurio
-- del diffing di Prisma sul `dbgenerated` di quella colonna, estraneo a
-- questo cambiamento): rimosso perché non è nostro da toccare qui.

-- CreateEnum
CREATE TYPE "OrigineIscrizione" AS ENUM ('GRUPPO', 'CODICE');

-- AlterTable
-- googleGroupEmail diventa opzionale: una classe può nascere da un docente
-- (creazione a mano, con codice) prima che un gruppo Google la sincronizzi.
-- codice è il nuovo indirizzo d'iscrizione delle classi create a mano.
-- Nessuna riga esistente ha bisogno di un default per questi due campi:
-- @unique resta valido perché Postgres ammette più NULL in un indice unico
-- (verificato in classi.test.ts, non dato per scontato).
ALTER TABLE "Classe" ADD COLUMN     "codice" TEXT,
ALTER COLUMN "googleGroupEmail" DROP NOT NULL;

-- AlterTable
-- Ogni ClasseStudente esistente oggi viene da un gruppo Google (l'unica via
-- d'iscrizione prima di questa migrazione): il default GRUPPO è quindi
-- corretto per tutte le righe già in tabella, non solo per quelle nuove.
ALTER TABLE "ClasseStudente" ADD COLUMN     "origine" "OrigineIscrizione" NOT NULL DEFAULT 'GRUPPO';

-- CreateIndex
CREATE UNIQUE INDEX "Classe_codice_key" ON "Classe"("codice");
