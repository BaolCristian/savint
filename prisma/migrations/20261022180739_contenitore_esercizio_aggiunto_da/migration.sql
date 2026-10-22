-- Chi ha messo l'esercizio nella raccolta: una raccolta trasmette ai membri
-- solo gli esercizi aggiunti dal loro autore. Le righe esistenti restano a
-- null e non trasmettono niente.

-- AlterTable
ALTER TABLE "ContenitoreEsercizio" ADD COLUMN     "addedById" TEXT;

-- AddForeignKey
ALTER TABLE "ContenitoreEsercizio" ADD CONSTRAINT "ContenitoreEsercizio_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
