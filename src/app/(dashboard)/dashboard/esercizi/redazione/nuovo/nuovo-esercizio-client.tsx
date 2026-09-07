"use client";

import { useRouter } from "next/navigation";
import { EditorEsercizio } from "@/components/esercizi/editor/editor-esercizio";

/** Il salvataggio di un esercizio nuovo non ha ancora un id: dopo la prima
 * versione (`creaEsercizio`, redazione.ts) ce n'è uno, e la pagina di
 * modifica di quell'id sostituisce questa — così un salvataggio successivo
 * dello stesso esercizio passa da PUT (una versione nuova), mai di nuovo da
 * POST (che ne creerebbe un altro). */
export function NuovoEsercizioClient() {
  const router = useRouter();
  return (
    <EditorEsercizio onSalvato={({ esercizioId }) => router.push(`/dashboard/esercizi/redazione/${esercizioId}`)} />
  );
}
