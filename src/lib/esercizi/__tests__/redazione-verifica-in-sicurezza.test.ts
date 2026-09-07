// Fix round del task precedente, item 1 (vedi il brief del Task 5):
// `verificaInSicurezza` in `redazione.ts` deve riportare `fase: "testo"`
// (non "caricamento") e un messaggio tradotto con `errorMessageIn`, non
// costruito a mano, quando un'eccezione scappa da `verificaSuSemi` invece di
// tornare come un `EsitoVerifica`. Isolato da `redazione.test.ts` (che gira
// contro un database vero) perche' qui si mocka il motore per riprodurre
// quello scenario in modo deterministico: `creaEsercizio` non tocca prisma
// prima di questo controllo, quindi non serve mockare anche il database.
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/esercizi/editor/verifica", async (importOriginal) => {
  const reale = await importOriginal<typeof import("../editor/verifica")>();
  return {
    ...reale,
    // Una chiave con testi diversi in it/en rende osservabile QUALE
    // funzione produce il messaggio riportato (vedi il secondo test).
    verificaSuSemi: vi.fn(() => {
      throw new EngineError("jme.shunt.no left bracket");
    }),
  };
});

import { EngineError, setLocale } from "@savint/engine";
import { creaEsercizio } from "../redazione";
import type { EsercizioEditor } from "../editor/modello";

const base: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2, valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

afterEach(() => setLocale("it"));

describe("verificaInSicurezza: fase e messaggio di un'eccezione non anticipata del motore", () => {
  it("riporta fase 'testo', non 'caricamento': non e' mai un caricamento vero a lanciare qui", async () => {
    const esito = await creaEsercizio(base, "docente-test");
    expect(esito.ok).toBe(false);
    if (esito.ok) throw new Error("atteso un rifiuto");
    expect(esito.motivo).toBe("verifica_fallita");
    expect((esito.dettaglio as { fase: string }).fase).toBe("testo");
  });

  it("traduce il messaggio con errorMessageIn(e, 'it'), non con e.message grezzo", async () => {
    // La lingua PREDEFINITA DEL PROCESSO e' inglese al momento del lancio:
    // se il codice sotto test tornasse a usare `e.message` direttamente
    // (come prima del fix), il messaggio qui sotto sarebbe quello inglese,
    // non l'italiano che ci si aspetta.
    setLocale("en");
    const esito = await creaEsercizio(base, "docente-test");
    expect(esito.ok).toBe(false);
    if (esito.ok) throw new Error("atteso un rifiuto");
    expect((esito.dettaglio as { messaggio: string }).messaggio).toBe("Manca la parentesi aperta");
  });
});
