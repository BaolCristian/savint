-- CreateEnum
CREATE TYPE "HubInstallationStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "HubLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hubAccountId" TEXT NOT NULL,
    "hubAccountEmail" TEXT NOT NULL,
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "HubLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthFlowState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "quizId" TEXT,
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OAuthFlowState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Installation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretHash" TEXT NOT NULL,
    "status" "HubInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Installation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "hubAccountId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "scopes" TEXT[],
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubAccessToken" (
    "id" TEXT NOT NULL,
    "hubAccountId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "accessTokenHash" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "rotationCount" INTEGER NOT NULL DEFAULT 0,
    "parentTokenId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubQuiz" (
    "id" TEXT NOT NULL,
    "hubAccountId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "license" "QuizLicense" NOT NULL DEFAULT 'CC_BY',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "schoolLevel" "SchoolLevel" NOT NULL,
    "subject" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "questionCount" INTEGER NOT NULL,
    "estimatedDurationSec" INTEGER NOT NULL,
    "payloadBlob" BYTEA NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadSize" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unpublishedAt" TIMESTAMP(3),
    "suspended" BOOLEAN NOT NULL DEFAULT false,
    "suspendedReason" TEXT,
    "downloadsCount" INTEGER NOT NULL DEFAULT 0,
    "playsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HubQuiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubQuizVersion" (
    "id" TEXT NOT NULL,
    "hubQuizId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "payloadBlob" BYTEA NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "payloadSize" INTEGER NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubQuizVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HubLink_userId_key" ON "HubLink"("userId");

-- CreateIndex
CREATE INDEX "HubLink_hubAccountId_idx" ON "HubLink"("hubAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthFlowState_state_key" ON "OAuthFlowState"("state");

-- CreateIndex
CREATE INDEX "OAuthFlowState_userId_idx" ON "OAuthFlowState"("userId");

-- CreateIndex
CREATE INDEX "OAuthFlowState_expiresAt_idx" ON "OAuthFlowState"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Installation_clientId_key" ON "Installation"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAuthorizationCode_codeHash_key" ON "OAuthAuthorizationCode"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_hubAccountId_idx" ON "OAuthAuthorizationCode"("hubAccountId");

-- CreateIndex
CREATE INDEX "OAuthAuthorizationCode_expiresAt_idx" ON "OAuthAuthorizationCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "HubAccessToken_accessTokenHash_key" ON "HubAccessToken"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "HubAccessToken_refreshTokenHash_key" ON "HubAccessToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "HubAccessToken_hubAccountId_installationId_idx" ON "HubAccessToken"("hubAccountId", "installationId");

-- CreateIndex
CREATE INDEX "HubAccessToken_refreshTokenHash_idx" ON "HubAccessToken"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "HubQuiz_hubAccountId_idx" ON "HubQuiz"("hubAccountId");

-- CreateIndex
CREATE INDEX "HubQuiz_subject_idx" ON "HubQuiz"("subject");

-- CreateIndex
CREATE INDEX "HubQuiz_schoolLevel_idx" ON "HubQuiz"("schoolLevel");

-- CreateIndex
CREATE UNIQUE INDEX "HubQuizVersion_hubQuizId_version_key" ON "HubQuizVersion"("hubQuizId", "version");

-- AddForeignKey
ALTER TABLE "HubLink" ADD CONSTRAINT "HubLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAccessToken" ADD CONSTRAINT "HubAccessToken_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "Installation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubAccessToken" ADD CONSTRAINT "HubAccessToken_hubAccountId_fkey" FOREIGN KEY ("hubAccountId") REFERENCES "hub_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubQuiz" ADD CONSTRAINT "HubQuiz_hubAccountId_fkey" FOREIGN KEY ("hubAccountId") REFERENCES "hub_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubQuizVersion" ADD CONSTRAINT "HubQuizVersion_hubQuizId_fkey" FOREIGN KEY ("hubQuizId") REFERENCES "HubQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
