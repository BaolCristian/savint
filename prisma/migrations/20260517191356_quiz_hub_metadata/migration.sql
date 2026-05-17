-- CreateEnum
CREATE TYPE "SchoolLevel" AS ENUM ('PRIMARIA', 'SECONDARIA_I', 'SECONDARIA_II', 'UNIVERSITA', 'ALTRO');

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "ageMax" INTEGER,
ADD COLUMN     "ageMin" INTEGER,
ADD COLUMN     "clonedFromHubAuthor" TEXT,
ADD COLUMN     "clonedFromHubId" TEXT,
ADD COLUMN     "clonedFromHubVersion" INTEGER,
ADD COLUMN     "hubAccountId" TEXT,
ADD COLUMN     "hubLastPublishedAt" TIMESTAMP(3),
ADD COLUMN     "hubPublishedId" TEXT,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "schoolLevel" "SchoolLevel",
ADD COLUMN     "subject" TEXT;

-- CreateIndex
CREATE INDEX "Quiz_hubPublishedId_idx" ON "Quiz"("hubPublishedId");

-- CreateIndex
CREATE INDEX "Quiz_clonedFromHubId_idx" ON "Quiz"("clonedFromHubId");
