-- CreateTable
CREATE TABLE "PracticeRun" (
    "id" TEXT NOT NULL,
    "hubQuizId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "answers" JSONB NOT NULL DEFAULT '[]',
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT now() + interval '1 hour',

    CONSTRAINT "PracticeRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PracticeRun_hubQuizId_startedAt_idx" ON "PracticeRun"("hubQuizId", "startedAt");

-- CreateIndex
CREATE INDEX "PracticeRun_expiresAt_idx" ON "PracticeRun"("expiresAt");

-- AddForeignKey
ALTER TABLE "PracticeRun" ADD CONSTRAINT "PracticeRun_hubQuizId_fkey" FOREIGN KEY ("hubQuizId") REFERENCES "HubQuiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;
