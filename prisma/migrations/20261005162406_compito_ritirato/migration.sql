-- AlterTable
ALTER TABLE "Compito" ADD COLUMN     "ritiratoAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';
