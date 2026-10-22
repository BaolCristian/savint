-- Le righe nate prima di "addedById" sono rimaste a null e non trasmettono
-- niente. Quando l'autore dell'esercizio possiede anche la raccolta, si
-- considera messo da lui: così, se poi condivide la raccolta con qualcuno,
-- i suoi esercizi la seguono. Le altre righe restano a null.
UPDATE "ContenitoreEsercizio" AS ce
SET "addedById" = e."authorId"
FROM "Esercizio" AS e, "Contenitore" AS c
WHERE ce."addedById" IS NULL
  AND e."id" = ce."esercizioId"
  AND c."id" = ce."contenitoreId"
  AND e."authorId" IS NOT NULL
  AND e."authorId" = c."createdById";
