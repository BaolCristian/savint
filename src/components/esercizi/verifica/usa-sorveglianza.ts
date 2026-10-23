"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";
// Solo il tipo: prova-verifica.ts legge il database e non entra nel bundle.
import type { EventoInput } from "@/lib/esercizi/prova-verifica";

// La sorveglianza della prova: quando lo studente esce dalla pagina (schermo
// intero lasciato, scheda nascosta, finestra senza focus per più di 2 s) e
// quando ci rientra. Non blocca niente: registra. Un EPISODIO di uscita
// comincia alla prima di quelle condizioni e finisce quando sono di nuovo
// tutte a posto, così uscire dallo schermo intero cambiando scheda è
// un'uscita sola. Le ore sono quelle del server (ora del PC + scarto).

/** Un blur più breve non conta: un clic su una finestra di sistema, un
 * avviso del browser. */
export const SOGLIA_FOCUS_MS = 2000;

type Motivo = NonNullable<EventoInput["motivo"]>;

export interface OpzioniSorveglianza {
  attiva: boolean;
  scartoMs: number;
  onEvento: (e: EventoInput) => void;
}

/** Il fuoco è passato a un iframe della pagina (il formulario in PDF): la
 * finestra perde il focus, ma lo studente è ancora nella prova. */
const fuocoInUnIframe = () => document.activeElement?.tagName === "IFRAME";

/** Senza l'API dello schermo intero (Safari su iPhone) lo schermo intero
 * non si può chiedere: non si sorveglia, restano scheda e focus. */
const schermoSorvegliabile = () => document.fullscreenEnabled === true;

export function useSorveglianza({ attiva, scartoMs, onEvento }: OpzioniSorveglianza): {
  fuori: boolean;
  rientra: () => Promise<void>;
} {
  const [fuori, setFuori] = useState(false);
  const scartoRef = useRef(scartoMs);
  const onEventoRef = useRef(onEvento);
  useEffect(() => {
    scartoRef.current = scartoMs;
    onEventoRef.current = onEvento;
  });

  useEffect(() => {
    if (!attiva) return;
    const sorvegliaSchermo = schermoSorvegliabile();
    let schermo = !sorvegliaSchermo || document.fullscreenElement != null;
    let visibile = document.visibilityState !== "hidden";
    // Diventa falso solo dopo `SOGLIA_FOCUS_MS` di blur.
    let focus = true;
    // L'ora del PC a cui è cominciato l'episodio in corso.
    let inizio: number | null = null;
    let timerBlur: ReturnType<typeof setTimeout> | null = null;

    const iso = (oraPc: number) => new Date(oraPc + scartoRef.current).toISOString();
    const esci = (motivo: Motivo, quando = Date.now()) => {
      if (inizio !== null) return;
      inizio = quando;
      setFuori(true);
      onEventoRef.current({ tipo: "USCITA", motivo, at: iso(quando) });
    };
    const forseRientra = () => {
      if (inizio === null || !schermo || !visibile || !focus) return;
      const ora = Date.now();
      onEventoRef.current({ tipo: "RIENTRO", at: iso(ora), durataMs: ora - inizio });
      inizio = null;
      setFuori(false);
    };
    const fermaTimerBlur = () => {
      if (timerBlur) clearTimeout(timerBlur);
      timerBlur = null;
    };

    const suSchermo = () => {
      if (!sorvegliaSchermo) return;
      schermo = document.fullscreenElement != null;
      if (schermo) forseRientra();
      else esci("SCHERMO_INTERO");
    };
    const suVisibilita = () => {
      visibile = document.visibilityState !== "hidden";
      if (visibile) forseRientra();
      else esci("SCHEDA");
    };
    const suBlur = () => {
      if (fuocoInUnIframe()) return;
      fermaTimerBlur();
      const inizioBlur = Date.now();
      timerBlur = setTimeout(() => {
        timerBlur = null;
        if (fuocoInUnIframe()) return;
        focus = false;
        esci("FOCUS", inizioBlur);
      }, SOGLIA_FOCUS_MS);
    };
    const suFocus = () => {
      fermaTimerBlur();
      focus = true;
      forseRientra();
    };

    document.addEventListener("fullscreenchange", suSchermo);
    document.addEventListener("visibilitychange", suVisibilita);
    window.addEventListener("blur", suBlur);
    window.addEventListener("focus", suFocus);
    // Già fuori all'avvio: schermo intero rifiutato o mai concesso.
    if (!schermo) esci("SCHERMO_INTERO");
    else if (!visibile) esci("SCHEDA");

    return () => {
      document.removeEventListener("fullscreenchange", suSchermo);
      document.removeEventListener("visibilitychange", suVisibilita);
      window.removeEventListener("blur", suBlur);
      window.removeEventListener("focus", suFocus);
      fermaTimerBlur();
      // Un episodio aperto alla fine della prova resta aperto: il server lo
      // conta fino alla consegna.
      setFuori(false);
    };
  }, [attiva]);

  const rientra = useCallback(async () => {
    try {
      if (schermoSorvegliabile() && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch {
      // Rifiutato: la sovrapposizione resta, lo studente può riprovare.
    }
    window.focus();
  }, []);

  return { fuori, rientra };
}

/** Il nome del piano. Un hook deve cominciare con «use» perché il linter ne
 * controlli le regole (come `useTastieraSimboli`): i componenti chiamano
 * `useSorveglianza`. */
export const usaSorveglianza = useSorveglianza;

/** Quanti eventi al massimo in un lotto: lo stesso limite della rotta
 * (`MAX_EVENTI`, che vive in un modulo del server). */
const LOTTO = 50;
const RITARDI = [1000, 2000, 4000, 8000, 15000];

/**
 * L'invio degli eventi a lotti verso `POST .../prova/eventi`. Gli eventi
 * dello stesso giro partono insieme; un errore di rete o del server si
 * ritenta con ritardi crescenti, e gli eventi arrivati intanto viaggiano con
 * quelli in attesa. Esauriti i tentativi, o se il server rifiuta (4xx), il
 * lotto si perde: la prova non si blocca mai per un evento.
 */
export class InvioEventi {
  private readonly coda: EventoInput[] = [];
  private readonly ritardi: number[];
  private inVolo = false;
  private programmato = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fallimenti = 0;
  private fermato = false;

  constructor(private readonly o: { compitoId: string; ritardi?: number[] }) {
    this.ritardi = o.ritardi && o.ritardi.length > 0 ? o.ritardi : RITARDI;
  }

  aggiungi(evento: EventoInput): void {
    if (this.fermato) return;
    this.coda.push(evento);
    if (this.programmato || this.inVolo || this.timer) return;
    this.programmato = true;
    queueMicrotask(() => {
      this.programmato = false;
      void this.invia();
    });
  }

  /** Niente più invii né timer (pagina chiusa). */
  ferma(): void {
    this.fermato = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async invia(): Promise<void> {
    if (this.inVolo || this.timer || this.fermato || this.coda.length === 0) return;
    this.inVolo = true;
    const lotto = this.coda.slice(0, LOTTO);
    let ritenta: boolean;
    try {
      const r = await fetch(withBasePath(`/api/esercizi/verifiche/${this.o.compitoId}/prova/eventi`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventi: lotto }),
      });
      ritenta = r.status >= 500 || r.status === 429;
    } catch {
      ritenta = true;
    }
    this.inVolo = false;
    if (this.fermato) return;

    if (ritenta && this.fallimenti < this.ritardi.length) {
      const ritardo = this.ritardi[this.fallimenti++];
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.invia();
      }, ritardo);
      return;
    }
    // Inviato, rifiutato o perso dopo l'ultimo tentativo: il lotto esce.
    this.coda.splice(0, lotto.length);
    this.fallimenti = 0;
    void this.invia();
  }
}
