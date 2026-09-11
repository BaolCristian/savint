import { describe, it, expect } from "vitest";
import { jme, evaluate } from "@savint/engine";
import { versoJme, type EsitoConversione } from "../ascii-jme";

/** «Vale 2», chiesto al motore e non alla stringa.
 *
 * È la differenza fra una prova e una fotografia: `toBe("8^(1/3)")`
 * sorveglierebbe la forma che l'implementazione ha scelto oggi, e cadrebbe
 * su una forma diversa ma giusta (`(8)^(1/(3))`) senza che niente sia
 * rotto. Il confronto lo fa il motore stesso, con il suo `=`, che è anche
 * l'unico che sa mettere a confronto le tre rappresentazioni numeriche che
 * `evaluate` restituisce a seconda dell'espressione (numero, frazione,
 * decimale complesso). */
function vale(espressione: string, atteso: string, variabili?: Record<string, number>): boolean {
  return evaluate(`(${espressione}) = (${atteso})`, variabili) === true;
}

function esitoRifiutato(esito: EsitoConversione): Extract<EsitoConversione, { ok: false }> {
  if (esito.ok) throw new Error(`atteso un rifiuto, ricevuto il JME «${esito.jme}»`);
  return esito;
}

function jmeProdotto(esito: EsitoConversione): string {
  if (!esito.ok) throw new Error(`atteso un JME, ricevuto ${esito.motivo}: «${esito.dettaglio}»`);
  return esito.jme;
}

/** La tabella dei casi, ognuno misurato su ciò che MathLive produce davvero
 * (colonna `ascii`: è l'uscita di `getValue("ascii-math")` per la formula
 * che il docente disegna, non una sintassi ASCIIMath teorica). */
const CASI: Array<[string, string, string[], (esito: EsitoConversione) => void]> = [
  [
    // IL caso. `\frac{-b\pm\sqrt{b^2-4ac}}{2a}` disegnata nella finestra.
    // `jme.compile` la ACCETTA e ne tiene una sola radice, e `findvars` ne
    // dice ["a","b","c"] — tutti nomi noti: lo strato 3 non la vede
    // passare. La prende solo lo strato 1, il rifiuto testuale di `+-`.
    // Se questa riga diventasse verde con un `ok: true`, il docente
    // pubblicherebbe un esercizio con una soluzione su due, che passa la
    // verifica a venti semi e sbaglia davanti alla classe.
    "la formula quadratica: rifiutata, non convertita a metà",
    "(-b+-sqrt(b^2-4a c))/(2a)",
    ["a", "b", "c"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("ambiguo"),
  ],
  [
    "«x=+-3»: il motore ne terrebbe solo «x = -3»",
    "x=+-3",
    ["x"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("ambiguo"),
  ],
  [
    "«-+» è ambiguo quanto «+-»",
    "x=-+3",
    ["x"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("ambiguo"),
  ],
  [
    // Strato 2, riga 1: JME non ha una `root` a due chiamate. Il valore,
    // non la stringa.
    "la radice cubica di 8 diventa un JME che vale 2",
    "root(3)(8)",
    [],
    (esito) => {
      const prodotto = jmeProdotto(esito);
      expect(vale(prodotto, "2")).toBe(true);
      // Il controllo del controllo: senza questa riga `vale` potrebbe
      // rispondere `true` a qualunque cosa e la riga sopra resterebbe verde.
      expect(vale(prodotto, "3")).toBe(false);
    },
  ],
  [
    // Strato 2, riga 2: `-:` è ciò che MathLive emette per `\div`.
    "la divisione con «-:» diventa un JME che vale 4",
    "8 -: 2",
    [],
    (esito) => expect(vale(jmeProdotto(esito), "4")).toBe(true),
  ],
  [
    // Strato 2, riga 3: JME non ha le barre. Il valore assoluto si prova
    // su un numero negativo: un'implementazione che buttasse via le barre
    // lasciando `x` darebbe -3 e questa riga cadrebbe.
    "il valore assoluto diventa un JME che vale 3 anche per x = -3",
    "|x|",
    ["x"],
    (esito) => {
      const prodotto = jmeProdotto(esito);
      expect(vale(prodotto, "3", { x: -3 })).toBe(true);
      expect(vale(prodotto, "3", { x: 3 })).toBe(true);
    },
  ],
  [
    // Strato 3. Il messaggio deve essere azionabile: la causa è quasi
    // sempre la stessa, e il docente deve poter leggere che la via
    // d'uscita è `sin(x)`. Il dettaglio porta il nome, e il nome è ciò che
    // la frase tradotta metterà davanti agli occhi.
    "«sin x» senza parentesi: rifiutato, nominando «sin»",
    "sin x",
    ["x"],
    (esito) => {
      const rifiuto = esitoRifiutato(esito);
      expect(rifiuto.motivo).toBe("nome_sconosciuto");
      expect(rifiuto.dettaglio).toContain("sin");
    },
  ],
  [
    "«sin (x)» con le parentesi passa: è il seno, e il docente ha la via d'uscita",
    "sin (x)",
    ["x"],
    (esito) => expect(vale(jmeProdotto(esito), "sin(x)", { x: 1 })).toBe(true),
  ],
  [
    // `_` letto come funzione: `findvars` ne dice ["_", "log", "x"].
    "«log _(10)x» è rifiutato: il pedice non è sintassi del motore",
    "log _(10)x",
    ["x"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("nome_sconosciuto"),
  ],
  [
    // Misurato: `\pi(x+1)` esce da MathLive come `pi(x+1)`, e il motore lo
    // legge come una CHIAMATA alla funzione `pi`, che non esiste
    // («La funzione pi non è definita: pi è una variabile e intendevi
    // pi*(...)?»). `findvars` restituisce `pi` fra i nomi liberi proprio
    // perché sta in posizione di funzione: è il motivo per cui i nomi
    // liberi NON vanno ripassati per un secondo filtro costruito su
    // `allConstants()` — quel filtro lascerebbe passare questa formula
    // rotta. Vedi il commento sullo strato 3 in `ascii-jme.ts`.
    "«pi(x+1)»: una costante in posizione di funzione è rifiutata",
    "pi(x+1)",
    ["x"],
    (esito) => {
      const rifiuto = esitoRifiutato(esito);
      expect(rifiuto.motivo).toBe("nome_sconosciuto");
      expect(rifiuto.dettaglio).toContain("pi");
    },
  ],
  [
    "un prodotto esplicito passa intatto",
    "2 * x",
    ["x"],
    (esito) => expect(jmeProdotto(esito)).toBe("2 * x"),
  ],
  [
    "una differenza di quadrati passa intatta",
    "x^2-a^2",
    ["x", "a"],
    (esito) => expect(jmeProdotto(esito)).toBe("x^2-a^2"),
  ],
  [
    "una formula sgrammaticata è rifiutata, col motivo del motore",
    "((",
    [],
    (esito) => {
      const rifiuto = esitoRifiutato(esito);
      expect(rifiuto.motivo).toBe("non_compila");
      expect(rifiuto.dettaglio).not.toBe("");
    },
  ],
];

describe("versoJme: il cancello a tre strati", () => {
  it.each(CASI)("%s", (_descrizione, ascii, noti, verifica) => {
    verifica(versoJme(ascii, noti));
  });
});

describe("versoJme: i nomi che il motore conosce da sé", () => {
  // L'elenco viene dal motore, non da qui: un elenco scritto a mano
  // resterebbe indietro alla prima costante aggiunta a `builtinScope`.
  const costanti = Object.keys(jme.builtinScope.allConstants());

  it("il motore ne dichiara almeno una: senza questo l'`it.each` qui sotto non proverebbe nulla", () => {
    expect(costanti.length).toBeGreaterThan(0);
  });

  it.each(costanti)("«%s» passa senza essere dichiarato fra le variabili", (costante) => {
    expect(versoJme(costante, []).ok).toBe(true);
  });

  it("una costante dentro una formula non è scambiata per una variabile mancante", () => {
    expect(versoJme("2 * pi * r", ["r"]).ok).toBe(true);
  });
});

describe("versoJme: i nomi dichiarati dal docente", () => {
  it("riconosce una variabile scritta con la maiuscola", () => {
    // Il motore normalizza i nomi in minuscolo prima di restituirli
    // (misurato: `findvars(compile("2*Vmax"))` dà ["vmax"]). Senza la
    // stessa normalizzazione sui nomi dichiarati, una variabile `Vmax`
    // verrebbe segnalata come sconosciuta al docente che l'ha appena
    // scritta nel pannello.
    expect(versoJme("2 * Vmax", ["Vmax"]).ok).toBe(true);
  });

  it("una variabile non dichiarata è rifiutata, ed è il prezzo che rende sicuro il resto", () => {
    const rifiuto = esitoRifiutato(versoJme("2 * y", []));
    expect(rifiuto.motivo).toBe("nome_sconosciuto");
    expect(rifiuto.dettaglio).toContain("y");
  });
});
