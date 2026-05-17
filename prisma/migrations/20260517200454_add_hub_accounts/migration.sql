-- CreateEnum
CREATE TYPE "HubAccountRole" AS ENUM ('HUB_USER', 'HUB_ADMIN');

-- CreateEnum
CREATE TYPE "HubAuthMethod" AS ENUM ('GOOGLE', 'PASSWORD');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- CreateTable
CREATE TABLE "hub_account" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "image" TEXT,
    "authMethod" "HubAuthMethod" NOT NULL,
    "passwordHash" TEXT,
    "emailVerified" TIMESTAMP(3),
    "affiliation" TEXT,
    "role" "HubAccountRole" NOT NULL DEFAULT 'HUB_USER',
    "linkedProviders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bannedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hub_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_token" (
    "id" TEXT NOT NULL,
    "hubAccountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hub_account_email_key" ON "hub_account"("email");

-- CreateIndex
CREATE INDEX "hub_account_role_idx" ON "hub_account"("role");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_token_tokenHash_key" ON "email_verification_token"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_token_hubAccountId_purpose_idx" ON "email_verification_token"("hubAccountId", "purpose");

-- AddForeignKey
ALTER TABLE "email_verification_token" ADD CONSTRAINT "email_verification_token_hubAccountId_fkey" FOREIGN KEY ("hubAccountId") REFERENCES "hub_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
