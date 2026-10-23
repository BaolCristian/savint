import type { QuestionState } from "@savint/engine";

// La coda dei salvataggi della prova: ogni cambio di risposta entra qui e
// parte verso `PUT .../prova/risposte`. Per tentativo conta solo l'ultimo
// stato (lo stato del motore è completo, i precedenti non servono più). Se la
// rete cade la coda resta nel localStorage — sopravvive a un refresh — e
// ritenta con ritardi crescenti; se il server dice che la prova è finita
// (tempo scaduto, consegnata, chiusa, non trovata) la coda si chiude e non
// manda più nulla: il server resta l'unico giudice dei tempi.

export type StatoCoda = {
  fase: "salvato" | "in_salvataggio" | "non_salvato" | "chiuso";
  motivo?: string;
  ultimoSalvataggio?: Date;
  oraServer?: string;
  scadenza?: string;
};

export type EsitoInvio =
  | { ok: true; oraServer: string; scadenza: string }
  | { ok: false; definitivo: boolean; motivo?: string; oraServer?: string };

type Storage_ = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type OpzioniCoda = {
  compitoId: string;
  studentId: string;
  invia: (tentativoId: string, state: QuestionState) => Promise<EsitoInvio>;
  storage?: Storage_;
  onCambio: (s: StatoCoda) => void;
  ritardi?: number[];
};

const RITARDI = [1000, 2000, 4000, 8000, 15000];

function storageDelBrowser(): Storage_ | undefined {
  try {
    return typeof window !== "undefined" ? window.localStorage : undefined;
  } catch {
    // Storage negato (impostazioni del browser): si lavora in memoria.
    return undefined;
  }
}

export class CodaSalvataggi {
  private readonly coda = new Map<string, QuestionState>();
  private readonly chiave: string;
  private readonly storage: Storage_ | undefined;
  private readonly ritardi: number[];
  private stato: StatoCoda = { fase: "salvato" };
  private chiuso = false;
  private fermato = false;
  private programmato = false;
  private inVolo: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fallimenti = 0;
  private readonly allaRete = () => {
    if (this.timer) this.ritentaSubito();
  };

  constructor(private readonly o: OpzioniCoda) {
    this.chiave = `savint:verifica:${o.compitoId}:${o.studentId}`;
    this.storage = o.storage ?? storageDelBrowser();
    this.ritardi = o.ritardi && o.ritardi.length > 0 ? o.ritardi : RITARDI;
    this.leggi();
    if (typeof window !== "undefined") window.addEventListener("online", this.allaRete);
    // Quello che un refresh aveva lasciato in sospeso riparte da sé.
    if (this.coda.size > 0) this.programma();
  }

  /** Mette in coda l'ultimo stato di un tentativo, al posto di quello che
   * c'era. L'invio parte al giro successivo: più `metti` di fila sullo stesso
   * tentativo diventano un solo invio. */
  metti(tentativoId: string, state: QuestionState): void {
    if (this.chiuso || this.fermato) return;
    this.coda.set(tentativoId, state);
    this.scrivi();
    // Durante l'attesa di un nuovo tentativo si resta «non salvato»: sarà
    // il tentativo a mandare anche questo stato.
    if (this.timer) return;
    if (this.stato.fase !== "in_salvataggio") this.cambia({ ...this.stato, fase: "in_salvataggio", motivo: undefined });
    this.programma();
  }

  /** Manda subito quello che è in coda, senza aspettare il ritardo del
   * prossimo tentativo (prima di consegnare). Si risolve dopo il giro, che
   * sia riuscito o no: chi chiama guarda `pendenti()`. */
  async svuota(): Promise<void> {
    if (this.chiuso || this.fermato) return;
    if (this.inVolo) await this.inVolo;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.coda.size > 0 && !this.chiuso) await this.avvia();
  }

  pendenti(): Map<string, QuestionState> {
    return new Map(this.coda);
  }

  /** Smonta la coda (pagina chiusa): niente più invii né timer. Quello che
   * resta in sospeso è già nel localStorage. */
  ferma(): void {
    this.fermato = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (typeof window !== "undefined") window.removeEventListener("online", this.allaRete);
  }

  private programma(): void {
    if (this.programmato || this.inVolo) return;
    this.programmato = true;
    queueMicrotask(() => {
      this.programmato = false;
      if (!this.inVolo && !this.timer) void this.avvia();
    });
  }

  private ritentaSubito(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.inVolo) void this.avvia();
  }

  private avvia(): Promise<void> {
    if (!this.inVolo) {
      this.inVolo = this.giro().finally(() => {
        this.inVolo = null;
        // Un `metti` arrivato fra la fine del giro e questo punto ha trovato
        // l'invio ancora «in volo» e non ha programmato nulla.
        if (this.coda.size > 0 && !this.timer && !this.chiuso && !this.fermato) this.programma();
      });
    }
    return this.inVolo;
  }

  /** Un giro: un invio per tentativo in coda, finché la coda è vuota, il
   * server la chiude o la rete fallisce (allora si ritenta più tardi). */
  private async giro(): Promise<void> {
    while (this.coda.size > 0 && !this.chiuso && !this.fermato) {
      const [tentativoId, state] = this.coda.entries().next().value as [string, QuestionState];
      let esito: EsitoInvio;
      try {
        esito = await this.o.invia(tentativoId, state);
      } catch {
        esito = { ok: false, definitivo: false };
      }
      if (this.fermato) return;

      if (esito.ok) {
        // Uno stato più nuovo arrivato durante l'invio resta in coda.
        if (this.coda.get(tentativoId) === state) this.coda.delete(tentativoId);
        this.scrivi();
        this.fallimenti = 0;
        this.stato = {
          fase: this.coda.size > 0 ? "in_salvataggio" : "salvato",
          ultimoSalvataggio: new Date(),
          oraServer: esito.oraServer,
          scadenza: esito.scadenza,
        };
        if (this.coda.size === 0) this.cambia(this.stato);
        continue;
      }

      if (esito.definitivo) {
        this.chiudi(esito.motivo, esito.oraServer);
        return;
      }

      const ritardo = this.ritardi[Math.min(this.fallimenti, this.ritardi.length - 1)];
      this.fallimenti++;
      this.cambia({
        ...this.stato,
        fase: "non_salvato",
        motivo: esito.motivo,
        oraServer: esito.oraServer ?? this.stato.oraServer,
      });
      this.timer = setTimeout(() => {
        this.timer = null;
        void this.avvia();
      }, ritardo);
      return;
    }
  }

  private chiudi(motivo: string | undefined, oraServer: string | undefined): void {
    this.chiuso = true;
    this.coda.clear();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      this.storage?.removeItem(this.chiave);
    } catch {
      // Storage negato: non c'era niente da togliere.
    }
    this.cambia({ ...this.stato, fase: "chiuso", motivo, oraServer: oraServer ?? this.stato.oraServer });
  }

  private cambia(s: StatoCoda): void {
    this.stato = s;
    this.o.onCambio(s);
  }

  private leggi(): void {
    try {
      const testo = this.storage?.getItem(this.chiave);
      if (!testo) return;
      const dati = JSON.parse(testo) as Record<string, QuestionState>;
      if (!dati || typeof dati !== "object") return;
      for (const [id, state] of Object.entries(dati)) {
        if (state && typeof state === "object") this.coda.set(id, state);
      }
    } catch {
      // Storage negato o contenuto illeggibile: si parte da una coda vuota.
    }
  }

  private scrivi(): void {
    try {
      if (this.coda.size === 0) this.storage?.removeItem(this.chiave);
      else this.storage?.setItem(this.chiave, JSON.stringify(Object.fromEntries(this.coda)));
    } catch {
      // Storage negato o pieno: la coda resta in memoria.
    }
  }
}
