-- Se gli studenti trovano l'esercizio da soli nella pratica libera.
ALTER TABLE "Esercizio" ADD COLUMN "inPraticaLibera" BOOLEAN NOT NULL DEFAULT true;

-- Il catalogo già caricato dal seed esce dalla pratica libera: lo assegna il
-- docente. Lo si riconosce dall'id, che è il nome del file (con trattini;
-- gli id generati dalla piattaforma sono cuid, senza), e dall'assenza di autore.
UPDATE "Esercizio" SET "inPraticaLibera" = false WHERE "authorId" IS NULL AND "id" LIKE '%-%';
