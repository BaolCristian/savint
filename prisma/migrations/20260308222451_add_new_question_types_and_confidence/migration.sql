-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "QuestionType" ADD VALUE 'SPOT_ERROR';
ALTER TYPE "QuestionType" ADD VALUE 'NUMERIC_ESTIMATION';
ALTER TYPE "QuestionType" ADD VALUE 'IMAGE_HOTSPOT';
ALTER TYPE "QuestionType" ADD VALUE 'CODE_COMPLETION';

-- AlterTable
ALTER TABLE "Answer" ADD COLUMN     "confidenceLevel" INTEGER;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "confidenceEnabled" BOOLEAN NOT NULL DEFAULT false;
