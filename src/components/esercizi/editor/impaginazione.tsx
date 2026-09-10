import type { ReactNode } from "react";

export interface ImpaginazioneEditorProps {
  /** Titolo dell'esercizio e scheda di catalogo: la fascia in cima alla
   * pagina, sopra le due colonne. */
  intestazione: ReactNode;
  /** La colonna sinistra: dove si scrive. */
  scrittura: ReactNode;
  /** La colonna destra: dove si vede. Appiccicata (`sticky`) sotto
   * l'intestazione sopra i 1280px; sotto quella soglia segue la scrittura
   * nel flusso normale. */
  visione: ReactNode;
  /** La barra in fondo — Controlla, Salva, lo stato di salvataggio —
   * appiccicata al fondo della finestra, con uno sfondo pieno perché ci
   * scorre sotto del contenuto. */
  azioni: ReactNode;
}

/** L'impaginazione a due colonne dell'editor degli esercizi: a sinistra si
 * scrive, a destra si vede. Sopra i 1280px (`xl:`, la soglia di Tailwind più
 * vicina a quella del piano) le due colonne stanno fianco a fianco — la
 * sinistra elastica, la destra fissa a 420px e agganciata sotto
 * l'intestazione mentre si scorre la colonna di scrittura, più lunga. Sotto
 * i 1280px le due colonne si impilano: prima la scrittura, poi la visione
 * — lo stesso ordine in cui compaiono nel documento anche sopra i 1280px
 * diventa, qui, anche l'ordine a schermo.
 *
 * Puro contenitore: non sa niente dell'esercizio, riceve quattro
 * `ReactNode` e li colloca. I task successivi (2: il player a linguette
 * dentro `visione`; 5: i campi di testo matematico dentro `scrittura`)
 * cambiano cosa c'è dentro questi slot, mai questo componente. */
export function ImpaginazioneEditor({ intestazione, scrittura, visione, azioni }: ImpaginazioneEditorProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-4">{intestazione}</div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_420px]">
        <div className="min-w-0 space-y-6">{scrittura}</div>
        <div className="min-w-0 space-y-4 xl:sticky xl:top-4">{visione}</div>
      </div>

      <div className="sticky bottom-0 z-10 border-t bg-background px-4 py-3">{azioni}</div>
    </div>
  );
}
