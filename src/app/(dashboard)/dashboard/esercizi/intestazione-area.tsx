import type { ReactNode } from "react";
import { AREE, type Area } from "./aree";

/** Il titolo di una pagina della sezione esercizi: il riquadro col colore
 * e l'icona della zona (gli stessi della barra), il titolo, una riga che
 * dice a cosa serve la pagina e, a destra, le sue azioni. */
export function IntestazioneArea({
  area,
  titolo,
  descrizione,
  azioni,
}: {
  area: Area;
  titolo: string;
  descrizione?: ReactNode;
  azioni?: ReactNode;
}) {
  const stile = AREE[area];
  const Icona = stile.icona;
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-sm ${stile.pieno}`} aria-hidden>
          <Icona className="h-5 w-5" />
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold leading-tight">{titolo}</h1>
          {descrizione && <div className="max-w-2xl space-y-1 text-sm text-muted-foreground">{descrizione}</div>}
        </div>
      </div>
      {azioni && <div className="flex flex-wrap gap-2">{azioni}</div>}
    </div>
  );
}
