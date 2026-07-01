-- CreateEnum
CREATE TYPE "AffiliationStatus" AS ENUM ('PENDING_EMAIL', 'PENDING_REVIEW', 'APPROVED', 'REDEEMED', 'REJECTED');

-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';

-- CreateTable
CREATE TABLE "AffiliationRequest" (
    "id" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "installationUrl" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "status" "AffiliationStatus" NOT NULL DEFAULT 'PENDING_EMAIL',
    "emailVerifyTokenHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "reviewedByHubAccountId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "installationId" TEXT,
    "setupCodeHash" TEXT,
    "setupCodeExpiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "pendingClientId" TEXT,
    "pendingClientSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "clientId" TEXT NOT NULL,
    "clientSecret" TEXT NOT NULL,
    "hubUrl" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HubConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AffiliationRequest_installationId_key" ON "AffiliationRequest"("installationId");

-- CreateIndex
CREATE INDEX "AffiliationRequest_status_idx" ON "AffiliationRequest"("status");

-- CreateIndex
CREATE INDEX "AffiliationRequest_contactEmail_idx" ON "AffiliationRequest"("contactEmail");
