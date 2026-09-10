-- Task 1 (docente-via-veloce): una BatteriaRegola ha il contenitore, oppure
-- l'argomento — mai entrambi, mai nessuno dei due. Prisma non modella un
-- vincolo CHECK multi-colonna, quindi il dominio impone l'invariante in
-- scrittura e la riverifica in lettura (vedi formaRegola/bacinoRegola in
-- src/lib/esercizi/batterie.ts); qui solo lo spazio per le due forme.
--
-- Additiva soltanto: contenitoreId diventa nullable (un allargamento, non
-- può fallire su nessuna riga esistente — ogni BatteriaRegola di oggi ha
-- già un contenitoreId non nullo) e tre colonne nuove, tutte nullable,
-- arrivano vuote su ogni riga esistente. Nessun DROP di tabella o colonna.
--
-- Batteria.automatica (default false) marca le batterie che un futuro task
-- genererà per un'assegnazione diretta: ogni Batteria esistente, creata a
-- mano, riceve il default e resta "non automatica".
--
-- Come in 20260906221659 e 20260908180200: `prisma migrate diff` proponeva
-- qui anche un `ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET
-- DEFAULT now() + interval '1 hour'` — riasserzione del default già
-- applicato (drift spurio del diffing di Prisma sul `dbgenerated` di quella
-- colonna, estraneo a questo cambiamento) — rimosso perché non è nostro da
-- toccare qui.

-- AlterTable
ALTER TABLE "Batteria" ADD COLUMN     "automatica" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BatteriaRegola" ADD COLUMN     "anno" INTEGER,
ADD COLUMN     "argomento" TEXT,
ADD COLUMN     "difficoltaMax" INTEGER,
ALTER COLUMN "contenitoreId" DROP NOT NULL;
