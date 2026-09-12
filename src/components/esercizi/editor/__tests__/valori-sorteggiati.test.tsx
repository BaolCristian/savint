import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { jme, loadQuestion, type NumbasQuestionJSON, type Question } from "@savint/engine";
import messaggiIt from "@/messages/it.json";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { versoNumbas } from "@/lib/esercizi/editor/verso-numbas";
import { ValoriSorteggiati } from "../valori-sorteggiati";

/** Stessa base minima di verifica.test.ts (Task 3 non tocca quel file):
 * duplicata qui perché un fixture condiviso fra file di test creerebbe un
 * accoppiamento che nessuno dei due task ha chiesto. */
const BASE: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni", tag: [], difficolta: 1 },
  testo: "Testo",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 1, valore: "1", tolleranza: { tipo: "esatta" } }],
};

function contenuto(variabili: EsercizioEditor["variabili"]): NumbasQuestionJSON {
  return versoNumbas({ ...BASE, variabili }) as NumbasQuestionJSON;
}

function montaggio(content: NumbasQuestionJSON, semi: string[]) {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <ValoriSorteggiati content={content} semi={semi} />
    </NextIntlClientProvider>,
  );
}

/** L'oracolo di riferimento: chiama lo STESSO motore (`loadQuestion` +
 * `tokenToDisplayString`) che usa il componente, ma direttamente, fuori dal
 * componente — non un valore "misurato" e trascritto a mano (fragile, va
 * riverificato se il motore cambia comportamento), e non una riformulazione
 * della formattazione (quella non deve MAI essere reinventata, vedi il
 * commento in cima a valori-sorteggiati.tsx). Serve a costruire, per ogni
 * seme fisso, i valori ATTESI di ogni variabile — così le prove sotto
 * possono controllare la corrispondenza valore↔seme↔colonna, non solo che
 * "una tabella con dei numeri" compaia (giro di correzioni 1, C2). */
function valoriAttesi(content: NumbasQuestionJSON, seme: string, nomi: string[]): Record<string, string> {
  const caricata: Question = loadQuestion(content, { seed: seme, locale: "it" });
  const valori: Record<string, string> = {};
  for (const nome of nomi) {
    valori[nome] = jme.tokenToDisplayString(caricata.scope.getVariable(nome)!, caricata.scope);
  }
  return valori;
}

/** Le celle di una riga della tabella, incluso il nome in colonna 0. */
function celleRiga(riga: HTMLElement): string[] {
  return within(riga).getAllByRole("cell").map((c) => c.textContent ?? "");
}

describe("ValoriSorteggiati", () => {
  it("due variabili e tre semi danno una tabella 2×3 con i valori attesi per semi fissi", () => {
    // "random(1..1000)": a differenza di una definizione costante,
    // ogni seme dà (con probabilità pressoché certa su un intervallo di
    // 1000 interi) un valore DIVERSO — è la premessa perché la prova possa
    // accorgersi di uno scambio fra colonne, non solo che i numeri giusti
    // esistano da qualche parte nella tabella (giro di correzioni 1, C2:
    // con definizioni costanti come "a=5" la prova precedente restava verde
    // anche forzando ogni colonna allo stesso seme, o invertendo l'ordine
    // delle colonne).
    const content = contenuto([
      { nome: "a", definizione: "random(1..1000)", descrizione: "" },
      { nome: "b", definizione: "a + 1", descrizione: "" },
    ]);
    const semi = ["0", "1", "2"];
    const attesi = semi.map((seme) => valoriAttesi(content, seme, ["a", "b"]));

    // Precondizione della prova stessa: se per un colpo di sfortuna due
    // semi dessero lo stesso valore di "a", uno scambio fra quelle due
    // colonne non verrebbe rilevato. Lo si controlla esplicitamente invece
    // di sperare che l'intervallo 1..1000 basti da solo.
    expect(new Set(attesi.map((v) => v.a)).size).toBe(3);

    montaggio(content, semi);

    // Intestazione: la colonna dei nomi più una per seme.
    const intestazione = screen.getAllByRole("row")[0]!;
    const intestazioni = within(intestazione).getAllByRole("columnheader");
    expect(intestazioni.map((c) => c.textContent)).toEqual(["Variabile", "Sorteggio 1", "Sorteggio 2", "Sorteggio 3"]);

    const righe = screen.getAllByRole("row").slice(1);
    expect(righe).toHaveLength(2);

    expect(celleRiga(righe[0]!)).toEqual(["a", attesi[0]!.a, attesi[1]!.a, attesi[2]!.a]);
    expect(celleRiga(righe[1]!)).toEqual(["b", attesi[0]!.b, attesi[1]!.b, attesi[2]!.b]);
  });

  it("un contenuto che lancia al caricamento su un solo seme mostra il trattino in quella colonna e i valori giusti — non un valore qualunque — nelle altre", () => {
    // a = random(-3..3), b = random(1..(1/a)): quando a vale 0 l'estremo
    // 1/a è infinito e generare un numero casuale in quell'intervallo
    // lancia — misurato in verifica.test.ts ("una definizione che divide
    // per zero fallisce solo su alcuni semi"), dove il seme "14" è fra
    // quelli che lanciano e "0" e "1" fra quelli che non lanciano. Lo si
    // riusa qui com'è, senza rimisurarlo: è lo stesso motore, lo stesso
    // fatto.
    const content = contenuto([
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "random(1..(1/a))", descrizione: "" },
    ]);
    const semi = ["0", "14", "1"];
    const attesoZero = valoriAttesi(content, "0", ["a", "b"]);
    const attesoUno = valoriAttesi(content, "1", ["a", "b"]);

    // Anche qui, distinti — altrimenti uno scambio fra le due colonne che
    // NON lanciano (indici 0 e 2) passerebbe inosservato (giro di
    // correzioni 1, C2: invertire l'ordine delle colonne lascia
    // l'elemento centrale — quello che lancia — al suo posto, quindi solo
    // le altre due possono rivelare lo scambio).
    expect(attesoZero.a).not.toBe(attesoUno.a);

    montaggio(content, semi);

    const righe = screen.getAllByRole("row").slice(1);
    expect(righe).toHaveLength(2);

    expect(celleRiga(righe[0]!)).toEqual(["a", attesoZero.a, "—", attesoUno.a]);
    expect(celleRiga(righe[1]!)).toEqual(["b", attesoZero.b, "—", attesoUno.b]);
  });

  it("un contenuto che lancia su tutti e tre i semi rende null", () => {
    // "2*" non compila: jme.compile lancia in fase di caricamento, per
    // costruzione, indipendentemente dal seme — non serve trovare tre semi
    // che falliscano tutti "per caso".
    const content = contenuto([{ nome: "a", definizione: "2*", descrizione: "" }]);
    const { container } = montaggio(content, ["0", "1", "2"]);

    expect(container).toBeEmptyDOMElement();
  });

  it("un enunciato rotto non cancella la tabella: le variabili sono ancora buone, e si vedono", () => {
    // Il prezzo dichiarato della memoria ristretta (`parteCheDecide`), e la
    // ragione per cui vale la pena pagarlo. `Question` lancia mentre
    // sostituisce l'enunciato se ci trova un `\simplify{}` che non compila:
    // finché la tabella si ricalcolava sul contenuto INTERO, ogni carattere
    // battuto nel testo dell'esercizio ripagava tre `loadQuestion` (7 ms
    // misurati) e, appena il testo passava per uno stato rotto — cioè quasi
    // sempre, mentre lo si scrive — la tabella spariva del tutto. I valori
    // delle variabili non dipendono dall'enunciato: restano giusti, e ora
    // restano anche visibili. Il guasto dell'enunciato è mostrato
    // dall'anteprima, che sta sopra questa tabella.
    const content = versoNumbas({
      ...BASE,
      testo: "\\(\\simplify{2*}\\)",
      variabili: [{ nome: "a", definizione: "5", descrizione: "" }],
    }) as NumbasQuestionJSON;

    // La premessa della prova: senza questa riga, un enunciato che (per una
    // qualunque ragione) smettesse di far lanciare il caricamento lascerebbe
    // la prova verde per il motivo sbagliato.
    expect(() => loadQuestion(content, { seed: "0", locale: "it" })).toThrow();

    montaggio(content, ["0"]);

    const righe = screen.getAllByRole("row").slice(1);
    expect(celleRiga(righe[0]!)).toEqual(["a", "5"]);
  });

  it("senza variabili dichiarate, non c'è niente da mostrare: rende null", () => {
    const content = contenuto([]);
    const { container } = montaggio(content, ["0", "1", "2"]);

    expect(container).toBeEmptyDOMElement();
  });

  // Giro di correzioni 1, C3: gli unici valori provati finora erano interi,
  // per cui una formattazione fatta a mano sarebbe passata inosservata — il
  // brief cita esplicitamente questi due casi come verificati in pre-volo
  // con `jme.tokenToDisplayString`. Verificato a mano (mutazione temporanea:
  // `jme.tokenToDisplayString(token, scope)` sostituito con
  // `String(token.value ?? token)`, poi ripristinato): l'asserzione sulla
  // lista diventa rossa ("[object Object],[object Object],[object Object]"
  // invece di "[ 1, 2, 3 ]" — un `TList` porta un array di `Token`, non di
  // numeri grezzi, nel suo `.value`); quella sulla stringa NO, perché il
  // `.value` di un `TString` coincide già col testo grezzo — è la lista, non
  // la stringa, a fare da sentinella per questa regressione.
  it("una lista si mostra come «[ 1, 2, 3 ]» e una stringa come «ciao», non riformattate a mano", () => {
    const content = contenuto([
      { nome: "lista", definizione: "[1,2,3]", descrizione: "" },
      { nome: "s", definizione: '"ciao"', descrizione: "" },
    ]);
    montaggio(content, ["0"]);

    const righe = screen.getAllByRole("row").slice(1);
    expect(righe).toHaveLength(2);

    expect(celleRiga(righe[0]!)).toEqual(["lista", "[ 1, 2, 3 ]"]);
    expect(celleRiga(righe[1]!)).toEqual(["s", "ciao"]);
  });
});
