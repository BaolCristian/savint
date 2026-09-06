-- CreateTable
CREATE TABLE "Classe" (
    "id" TEXT NOT NULL,
    "googleGroupEmail" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "yearLevel" INTEGER,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Classe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClasseStudente" (
    "classeId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClasseStudente_pkey" PRIMARY KEY ("classeId","studentId")
);

-- CreateTable
CREATE TABLE "ClasseDocente" (
    "classeId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClasseDocente_pkey" PRIMARY KEY ("classeId","teacherId")
);

-- CreateTable
CREATE TABLE "Contenitore" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contenitore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContenitoreEsercizio" (
    "contenitoreId" TEXT NOT NULL,
    "esercizioId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContenitoreEsercizio_pkey" PRIMARY KEY ("contenitoreId","esercizioId")
);

-- CreateTable
CREATE TABLE "Batteria" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batteria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BatteriaRegola" (
    "id" TEXT NOT NULL,
    "batteriaId" TEXT NOT NULL,
    "contenitoreId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "BatteriaRegola_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Compito" (
    "id" TEXT NOT NULL,
    "batteriaId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "drawSeed" TEXT NOT NULL,
    "drawnVersionIds" TEXT[],
    "opensAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Compito_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Classe_googleGroupEmail_key" ON "Classe"("googleGroupEmail");

-- CreateIndex
CREATE UNIQUE INDEX "BatteriaRegola_batteriaId_order_key" ON "BatteriaRegola"("batteriaId", "order");

-- CreateIndex
CREATE INDEX "Compito_classeId_dueAt_idx" ON "Compito"("classeId", "dueAt");

-- AddForeignKey
ALTER TABLE "Tentativo" ADD CONSTRAINT "Tentativo_compitoId_fkey" FOREIGN KEY ("compitoId") REFERENCES "Compito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseStudente" ADD CONSTRAINT "ClasseStudente_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseStudente" ADD CONSTRAINT "ClasseStudente_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseDocente" ADD CONSTRAINT "ClasseDocente_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClasseDocente" ADD CONSTRAINT "ClasseDocente_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contenitore" ADD CONSTRAINT "Contenitore_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContenitoreEsercizio" ADD CONSTRAINT "ContenitoreEsercizio_contenitoreId_fkey" FOREIGN KEY ("contenitoreId") REFERENCES "Contenitore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContenitoreEsercizio" ADD CONSTRAINT "ContenitoreEsercizio_esercizioId_fkey" FOREIGN KEY ("esercizioId") REFERENCES "Esercizio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batteria" ADD CONSTRAINT "Batteria_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteriaRegola" ADD CONSTRAINT "BatteriaRegola_batteriaId_fkey" FOREIGN KEY ("batteriaId") REFERENCES "Batteria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BatteriaRegola" ADD CONSTRAINT "BatteriaRegola_contenitoreId_fkey" FOREIGN KEY ("contenitoreId") REFERENCES "Contenitore"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compito" ADD CONSTRAINT "Compito_batteriaId_fkey" FOREIGN KEY ("batteriaId") REFERENCES "Batteria"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compito" ADD CONSTRAINT "Compito_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "Classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Compito" ADD CONSTRAINT "Compito_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
