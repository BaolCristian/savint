"use client";

import type { ReactNode } from "react";

export interface ImpaginazioneEditorProps {
  /** L'h1 di pagina e la scheda di catalogo: la fascia in cima alla pagina,
   * sopra le due colonne. Il campo Titolo dell'esercizio non è qui — apre
   * la colonna `scrittura`, come vuole l'ordine esplicito del brief. */
  intestazione: ReactNode;
  /** La colonna sinistra: dove si scrive. */
  scrittura: ReactNode;
  /** La colonna destra: dove si vede. Appiccicata (`sticky`) sotto
   * l'intestazione sopra i 1280px, con un'altezza massima e uno scorrimento
   * proprio: senza, una colonna più alta della finestra si aggancerebbe e
   * smetterebbe di muoversi, portandosi via il fondo — compreso il
   * dettaglio di un eventuale rifiuto (vedi il commento gemello più sotto e
   * `editor-esercizio.tsx`, dove quel dettaglio vive). L'altezza massima
   * deve sottrarre non solo il padding di `<main>` (il guscio del
   * cruscotto, `p-4 md:p-8` — 32px a `xl:`) ma anche l'offset a cui la
   * colonna si aggancia (`top-4`, altri 16px): il bordo superiore della
   * colonna agganciata cade a 32+16=48px dalla cima della finestra, non a
   * 32px, e un `max-height` che dimentica i 16px dell'aggancio lascia
   * sporgere il fondo della colonna di altrettanto sotto il bordo inferiore
   * della finestra — misurato (giro di correzioni 2): con
   * `calc(100vh - 2rem)` il fondo cadeva a 1016px su una finestra di
   * 1000px, con `calc(100vh - 3rem)` cade esattamente a 1000px. Sotto i
   * 1280px segue la scrittura nel flusso normale, senza altezza massima. */
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
        {/* `max-h` + `overflow-y-auto` sono necessari, non decorativi: senza,
            in un esercizio con più di poche parti la colonna di scrittura
            supera l'altezza della finestra, `sticky` si aggancia a `top-4` e
            smette di seguire lo scroll — tutto ciò che sporge sotto il bordo
            inferiore (compreso il dettaglio di un rifiuto) diventa
            irraggiungibile. Lo scorrimento proprio della colonna è ciò che
            lo evita: il porto di scorrimento della pagina (`<main
            overflow-auto>` nel layout del cruscotto) resta quello esterno,
            questo è un secondo porto annidato solo per questa colonna.

            Giro di correzioni 2: `calc(100vh-2rem)` sottraeva solo il
            padding di `<main>` (`md:p-8` = 32px a `xl:`), non l'offset di
            `top-4` (16px) a cui la colonna resta agganciata una volta
            stuck — il bordo superiore agganciato cade quindi a 32+16=48px
            dalla finestra, e un `max-height` che ignora quei 16px lascia
            sporgere il fondo della colonna di altrettanto sotto la
            finestra. `3rem` = 32px (padding) + 16px (top-4): misurato in
            Chromium headless a 1440×1000 con `<main>` scrollato e la
            colonna agganciata e satura — il fondo cadeva a 1016px con
            `2rem`, cade esattamente a 1000px (a filo con la finestra, senza
            sporgere) con `3rem`. Se il padding di `<main>` cambiasse, questo
            valore andrebbe ricalcolato insieme: non è derivato a runtime
            dal DOM, è la somma di due costanti del layout — l'alternativa
            sarebbe leggere l'altezza disponibile con un ResizeObserver, che
            per una sola colonna non sembra valere la complessità. */}
        <div className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
          {visione}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 border-t bg-background px-4 py-3">{azioni}</div>
    </div>
  );
}
