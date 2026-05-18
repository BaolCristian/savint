-- CreateEnum
CREATE TYPE "HubReportReason" AS ENUM ('COPYRIGHT', 'PERSONAL_DATA', 'OFFENSIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "HubReportStatus" AS ENUM ('PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED');

-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';

-- CreateTable
CREATE TABLE "HubReport" (
    "id" TEXT NOT NULL,
    "hubQuizId" TEXT NOT NULL,
    "reporterAccountId" TEXT,
    "reporterIpHash" TEXT NOT NULL,
    "reason" "HubReportReason" NOT NULL,
    "description" TEXT,
    "status" "HubReportStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubRateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HubRateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubReport_hubQuizId_reporterIpHash_createdAt_idx" ON "HubReport"("hubQuizId", "reporterIpHash", "createdAt");

-- CreateIndex
CREATE INDEX "HubReport_status_idx" ON "HubReport"("status");

-- CreateIndex
CREATE INDEX "HubRateLimit_windowStart_idx" ON "HubRateLimit"("windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "HubRateLimit_key_windowStart_key" ON "HubRateLimit"("key", "windowStart");

-- AddForeignKey
ALTER TABLE "HubReport" ADD CONSTRAINT "HubReport_hubQuizId_fkey" FOREIGN KEY ("hubQuizId") REFERENCES "HubQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubReport" ADD CONSTRAINT "HubReport_reporterAccountId_fkey" FOREIGN KEY ("reporterAccountId") REFERENCES "hub_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubReport" ADD CONSTRAINT "HubReport_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "hub_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
