"use client";

import { useTranslations } from "next-intl";
import { formulaSciolta } from "./formula-sciolta";

/** L'avviso sotto «Come si vedrà» quando nel testo c'è una formula scritta
 * fuori da `\( \)` (vedi `formulaSciolta`). È un consiglio, non un blocco:
 * il salvataggio resta possibile. `role="status"`: compare mentre si scrive,
 * e si annuncia senza interrompere. */
export function AvvisoFormulaSciolta({ testo }: { testo: string }) {
  const t = useTranslations("esercizi.redazione.campoTesto");
  const formula = formulaSciolta(testo);
  if (!formula) return null;
  return (
    <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {t("formulaSciolta", { formula })}
    </p>
  );
}
