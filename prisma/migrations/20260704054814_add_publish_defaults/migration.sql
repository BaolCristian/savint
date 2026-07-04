-- AlterTable
ALTER TABLE "PracticeRun" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '1 hour';

-- CreateTable
CREATE TABLE "PublishDefaults" (
    "userId" TEXT NOT NULL,
    "schoolLevel" TEXT,
    "subject" TEXT,
    "language" TEXT,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishDefaults_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "PublishDefaults" ADD CONSTRAINT "PublishDefaults_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
