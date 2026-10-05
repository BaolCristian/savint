"use client";

import type { ReactNode } from "react";

export interface ImpaginazioneEditorProps {
  intestazione: ReactNode;
  scrittura: ReactNode;
  visione: ReactNode;
  azioni: ReactNode;
}

/** Il corpo scorre in uno spazio separato dalla barra azioni: anche quando
 * un campo riceve il focus, non può finire sotto i pulsanti. Il contenitore
 * della pagina assegna l'altezza disponibile con flex e min-h-0. */
export function ImpaginazioneEditor({ intestazione, scrittura, visione, azioni }: ImpaginazioneEditorProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
        <div className="space-y-4 pb-5">
          <div className="space-y-3">{intestazione}</div>
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-5">{scrittura}</div>
            <div className="min-w-0 space-y-4 rounded-xl border border-brand-blue/15 bg-brand-blue/5 p-4 xl:sticky xl:top-0 xl:max-h-[calc(100dvh-12rem)] xl:overflow-y-auto">
              {visione}
            </div>
          </div>
        </div>
      </div>
      <div className="shrink-0 border-t bg-background px-1 py-3">{azioni}</div>
    </div>
  );
}
