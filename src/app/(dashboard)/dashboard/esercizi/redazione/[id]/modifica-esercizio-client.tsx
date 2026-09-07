"use client";

import { useRouter } from "next/navigation";
import { EditorEsercizio } from "@/components/esercizi/editor/editor-esercizio";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";

/** Dopo un salvataggio riuscito la pagina si aggiorna (`router.refresh()`):
 * rilegge `caricaPerEditor` lato server, così autore e data mostrati
 * altrove restano coerenti con l'ultima versione appena scritta — mai un
 * `router.push` verso se stessa, che perderebbe lo stato del modulo. */
export function ModificaEsercizioClient({
  esercizioId,
  valoreIniziale,
}: {
  esercizioId: string;
  valoreIniziale: EsercizioEditor;
}) {
  const router = useRouter();
  return (
    <EditorEsercizio
      esercizioId={esercizioId}
      valoreIniziale={valoreIniziale}
      onSalvato={() => router.refresh()}
    />
  );
}
