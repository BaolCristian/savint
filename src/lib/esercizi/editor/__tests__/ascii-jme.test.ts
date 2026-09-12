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
    // I digrammi ASCII non sono l'unica forma in cui MathLive emette il
    // segno: `\pm` in mezzo a una formula esce come U+00B1. `a±b` compila,
    // ha nomi tutti noti, e senza questa riga passerebbe.
    "«±» (U+00B1) è ambiguo come il digramma",
    "a±b",
    ["a", "b"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("ambiguo"),
  ],
  [
    // LA quadratica scritta con l'altro segno: `\frac{-b\mp\sqrt{...}}{2a}`
    // esce da MathLive con U+2213, non con `-+`.
    "la quadratica con «∓» (U+2213): rifiutata come la sua gemella",
    "(-b∓sqrt(b^2-4a c))/(2a)",
    ["a", "b", "c"],
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
    // `_` letto come chiamata: `findvars` ne dice ["_", "log", "x"], e `_`
    // sta in posizione di funzione.
    "«log _(10)x» è rifiutato: il pedice non è sintassi del motore",
    "log _(10)x",
    ["x"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("nome_come_funzione"),
  ],
  [
    // Misurato: `\pi(x+1)` esce da MathLive come `pi(x+1)`, e il motore lo
    // legge come una CHIAMATA alla funzione `pi`, che non esiste
    // («La funzione pi non è definita: pi è una variabile e intendevi
    // pi*(...)?»).
    "«pi(x+1)»: una costante in posizione di funzione è rifiutata",
    "pi(x+1)",
    ["x"],
    (esito) => {
      const rifiuto = esitoRifiutato(esito);
      expect(rifiuto.motivo).toBe("nome_come_funzione");
      expect(rifiuto.dettaglio).toContain("pi");
    },
  ],
  [
    // Il caso frequente, e quello che `nomiNoti` da solo assolverebbe: il
    // docente scrive `a(x+1)` intendendo `a·(x+1)`, con `a` DICHIARATA.
    // MathLive emette esattamente `a(x+1)`; il motore poi lancia («La
    // funzione a non è definita: a è una variabile e intendevi a*(...)?»).
    "«a(x+1)» con «a» dichiarata: rifiutata lo stesso, nominando «a»",
    "a(x+1)",
    ["a", "x"],
    (esito) => {
      const rifiuto = esitoRifiutato(esito);
      expect(rifiuto.motivo).toBe("nome_come_funzione");
      expect(rifiuto.dettaglio).toBe("a");
    },
  ],
  [
    "«f(x)»: una funzione che il motore non ha è rifiutata",
    "f(x)",
    ["x"],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("nome_come_funzione"),
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
    // `jme.compile("")` NON lancia, e `findvars` di quell'albero dà `[]`:
    // senza la guardia in cima a `versoJme` la stringa vuota attraversa i
    // tre strati senza incontrare nessuno e arriva in fondo come
    // `{ ok: true, jme: "" }`. Non è un caso di scuola: MathLive
    // restituisce la stringa vuota per ogni forma che non sa serializzare
    // in ASCIIMath — `\overline{x}` è quella misurata, e un `ok` lì vuol
    // dire finestra chiusa, campo invariato e selezione cancellata, in
    // silenzio (vedi la prova gemella in `campo-jme.test.tsx`).
    "l'ASCIIMath vuoto è rifiutato, non convertito in un JME vuoto",
    "",
    [],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("vuoto"),
  ],
  [
    // La guardia guarda `trim()`: `\;` e gli altri spazi LaTeX escono da
    // MathLive come spazi, e uno spazio non è più una formula del vuoto.
    "un ASCIIMath di soli spazi è vuoto quanto la stringa vuota",
    "   ",
    [],
    (esito) => expect(esitoRifiutato(esito).motivo).toBe("vuoto"),
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

/** Le due superfici, una per riga: `ammessa` dice se quella superficie
 * concede l'incognita. La stessa formula deve dare esiti diversi, ed è
 * esattamente ciò che questa tabella sorveglia. */
const INCOGNITA: Array<[string, string, string[], boolean, "ok" | "rifiuto"]> = [
  // La forma normale di una risposta a espressione: `x` non è una variabile
  // del pannello, è il simbolo della funzione
  // (`content/esercizi/06-derivate-elementari.json`).
  ["la derivata di a*x^n, con l'incognita", "a*n*x^(n-1)", ["a", "n"], true, "ok"],
  // La stessa formula sul valore atteso di una parte numerica: lì il valore
  // deve venir fuori dalle variabili dichiarate, e `x` è un errore.
  ["la stessa formula sul valore atteso", "a*n*x^(n-1)", ["a", "n"], false, "rifiuto"],
  // Due nomi liberi non sono un'incognita: sono una giustapposizione.
  ["«sin x»: due nomi liberi", "sin x", [], true, "rifiuto"],
  // Ciò che MathLive fa di `sen x`: tre nomi liberi, `e` è Nepero. Senza
  // questo controllo non lancerebbe nemmeno — `evaluate("s e n x", …)` vale
  // 2.718281828459045 — cioè sarebbe silenzioso come la quadratica.
  ["«sen x» spezzato in «s e n x»: tre nomi liberi", "s e n x", [], true, "rifiuto"],
  ["«tg x» spezzato in «t g x»: tre nomi liberi", "t g x", [], true, "rifiuto"],
  // Il costo accettato della regola: un nome libero solo passa anche
  // quando è una svista. La verifica a venti semi resta a valle.
  ["un nome libero solo passa, anche se è una svista", "2 * y", [], true, "ok"],
];

describe("versoJme: l'incognita della risposta attesa", () => {
  it.each(INCOGNITA)("%s", (_descrizione, ascii, noti, ammessa, atteso) => {
    const esito = versoJme(ascii, noti, { incognitaAmmessa: ammessa });
    if (atteso === "ok") expect(jmeProdotto(esito)).toBe(ascii);
    else expect(esitoRifiutato(esito).motivo).toBe("nome_sconosciuto");
  });

  it("senza opzioni la superficie è quella stretta: nessun nome libero", () => {
    // Il valore per difetto conta: un chiamante che dimentica l'opzione
    // deve ottenere il cancello severo, non quello indulgente.
    expect(versoJme("2 * y", []).ok).toBe(false);
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
