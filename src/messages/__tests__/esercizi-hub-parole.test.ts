import { describe, it, expect } from "vitest";
import itMessages from "@/messages/it.json";
import enMessages from "@/messages/en.json";

/**
 * Task 4 (docente-via-veloce): «Redazione», «Contenitori» e «Compiti» erano
 * il nostro vocabolario, non quello del docente — vedi il design doc,
 * "Le parole". Questo file verifica MECCANICAMENTE la tabella del brief,
 * in entrambe le lingue, invece di fidarsi di una rilettura a occhio dei
 * due file JSON.
 */

function leggi(messages: unknown, percorso: string): unknown {
  return percorso
    .split(".")
    .reduce<unknown>((acc, chiave) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[chiave] : undefined), messages);
}

// [percorso nel namespace "esercizi", valore atteso in italiano, valore atteso in inglese]
const PAROLE_ATTESE: [string, string, string][] = [
  ["navContenitori", "Raccolte", "Collections"],
  ["navCompiti", "Compiti assegnati", "Assigned work"],
  ["navRedazione", "I miei esercizi", "My exercises"],
  ["navClassi", "Le mie classi", "My classes"],
  // Nuovo compito, Task 7: la carta "Assegna esercizi" della Panoramica è
  // diventata il link alla pagina Nuovo compito, che dà un compito da
  // ovunque — dalla pagina dei compiti, da una raccolta, da una classe.
  ["nuovoCompito.titolo", "Nuovo compito", "New assignment"],
  ["compiti.nuovo", "Nuovo compito", "New assignment"],
  ["contenitori.assegna", "Assegna questa raccolta", "Assign this collection"],
  ["contenitori.titolo", "Raccolte", "Collections"],
  // Nuovo compito, Task 7: le raccolte sono solo cartelle.
  [
    "contenitori.descrizione",
    "Le raccolte sono cartelle per tenere in ordine gli esercizi.",
    "Collections are folders to keep your exercises in order.",
  ],
  [
    "contenitori.nessunContenitore",
    "Non hai ancora creato nessuna raccolta.",
    "You haven't created any collections yet.",
  ],
  ["contenitori.torna", "Torna alle raccolte", "Back to collections"],
  [
    "contenitori.eserciziNelContenitore",
    "Esercizi nella raccolta",
    "Exercises in this collection",
  ],
  [
    "contenitori.nessunEsercizioNelContenitore",
    "Non ci sono ancora esercizi in questa raccolta.",
    "There are no exercises in this collection yet.",
  ],
  [
    "contenitori.erroreInUso",
    "Non è possibile eliminarla: è usata in un'assegnazione.",
    "It can't be deleted: it's used in an assignment.",
  ],
  ["redazione.elenco.titolo", "I miei esercizi", "My exercises"],
  ["redazione.elenco.torna", "Torna ai miei esercizi", "Back to my exercises"],
  ["anteprimaDocente.torna", "Torna ai miei esercizi", "Back to my exercises"],
];

describe("le parole della pagina d'ingresso del docente (Task 4)", () => {
  it.each(PAROLE_ATTESE)("it: esercizi.%s è %j", (percorso, atteso) => {
    expect(leggi(itMessages, `esercizi.${percorso}`)).toBe(atteso);
  });

  it.each(PAROLE_ATTESE)("en: esercizi.%s è %j", (percorso, _itAtteso, enAtteso) => {
    expect(leggi(enMessages, `esercizi.${percorso}`)).toBe(enAtteso);
  });

  it("«Batterie» è sparita dalla navigazione del docente, in entrambe le lingue", () => {
    expect(leggi(itMessages, "esercizi.navBatterie")).toBeUndefined();
    expect(leggi(enMessages, "esercizi.navBatterie")).toBeUndefined();
  });

  // Nuovo compito, Task 7: la pagina delle batterie ("Prepara un
  // compito") è diventata la pagina Modelli (Task 5) e il suo vecchio
  // indirizzo porta lì; i testi della pagina e del modulo di assegnazione
  // della Panoramica sono andati con loro.
  it("i testi delle vecchie strade per assegnare non ci sono più, in entrambe le lingue", () => {
    for (const messages of [itMessages, enMessages]) {
      expect(leggi(messages, "esercizi.batterie")).toBeUndefined();
      expect(leggi(messages, "esercizi.assegnaForm")).toBeUndefined();
      expect(leggi(messages, "esercizi.assegnaTitolo")).toBeUndefined();
      expect(leggi(messages, "teacherExercisesUi.preparation")).toBeUndefined();
    }
  });
});

/**
 * Verifica meccanica (non a occhio) che it.json e en.json abbiano
 * ESATTAMENTE lo stesso insieme di chiavi-foglia, a qualunque profondità:
 * nessuna chiave orfana, nessuna dimenticata in una sola lingua. Il
 * "conteggio delle chiavi nei due file" del brief è la dimensione dei due
 * insiemi qui sotto.
 */
function chiaviFoglia(obj: unknown, prefisso = ""): string[] {
  if (obj === null || typeof obj !== "object") return [prefisso];
  return Object.entries(obj as Record<string, unknown>).flatMap(([chiave, valore]) =>
    chiaviFoglia(valore, prefisso ? `${prefisso}.${chiave}` : chiave),
  );
}

describe("parità delle chiavi fra it.json e en.json", () => {
  it("stesso insieme di chiavi-foglia, stesso conteggio", () => {
    const chiaviIt = new Set(chiaviFoglia(itMessages));
    const chiaviEn = new Set(chiaviFoglia(enMessages));

    const soloInItaliano = [...chiaviIt].filter((k) => !chiaviEn.has(k)).sort();
    const soloInInglese = [...chiaviEn].filter((k) => !chiaviIt.has(k)).sort();

    expect(soloInItaliano).toEqual([]);
    expect(soloInInglese).toEqual([]);
    expect(chiaviIt.size).toBe(chiaviEn.size);
  });
});
