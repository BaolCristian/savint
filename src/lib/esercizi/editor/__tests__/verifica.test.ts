import { describe, it, expect } from "vitest";
import { loadQuestion, type NumbasQuestionJSON } from "@savint/engine";
import { verificaSuSemi } from "../verifica";
import { versoNumbas } from "../verso-numbas";
import type { EsercizioEditor } from "../modello";

/** Stessa base minima di verso-numbas.test.ts (Task 1), duplicata qui: quel
 * file non va toccato in questo task. */
const base: EsercizioEditor = {
  meta: { titolo: "T", descrizione: "", anno: 1, argomento: "equazioni",
          tag: [], difficolta: 1 },
  testo: "Risolvi \\(\\simplify{ {a}x+{b} }=0\\)",
  suggerimento: "",
  variabili: [
    { nome: "a", definizione: "random(2..9)", descrizione: "" },
    { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
  ],
  condizione: "",
  parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
            valore: "-b/a", tolleranza: { tipo: "esatta" } }],
};

describe("verificaSuSemi", () => {
  it("un esercizio sano passa venti semi", () => {
    expect(verificaSuSemi(versoNumbas(base))).toEqual({ ok: true });
  });

  it("una definizione che divide per zero fallisce solo su alcuni semi, non su tutti", () => {
    // b e' definita come random(1..(1/a)): quando a vale 0 (semi 14 e 17,
    // con questo generatore) l'estremo 1/a e' infinito e generare un numero
    // casuale in quell'intervallo lancia. Sugli altri diciotto semi a e'
    // diverso da zero e l'esercizio carica senza problemi: e' proprio
    // l'intermittenza — non un fallimento su ogni seme — a dimostrare che
    // questo esercizio si rompe SOLO per certi valori della variabile,
    // come nella vita vera di un esercizio a variabili casuali.
    const e: EsercizioEditor = { ...base, variabili: [
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "random(1..(1/a))", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
                valore: "b", tolleranza: { tipo: "esatta" } }] };
    const question = versoNumbas(e);

    // verificaSuSemi si ferma al primo fallimento per costruzione: non puo'
    // dire da sola quali semi FALLISCONO dopo il primo. Per riportare
    // l'elenco completo (richiesto dal task) si richiama qui direttamente
    // il motore, seme per seme, indipendentemente dalla funzione sotto test.
    const passati: number[] = [];
    const falliti: number[] = [];
    for (let seme = 0; seme < 20; seme++) {
      try {
        loadQuestion(question as NumbasQuestionJSON, { seed: String(seme), locale: "it" });
        passati.push(seme);
      } catch {
        falliti.push(seme);
      }
    }
    expect(falliti).toEqual([14, 17]);
    expect(passati.length).toBe(18);

    // verificaSuSemi deve fermarsi al primo dei due: il seme 14.
    const esito = verificaSuSemi(question);
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("caricamento");
      expect(esito.seme).toBe(14);
    }
  });

  it("un \\var{} che nomina una variabile inesistente viene intercettato (giro 1)", () => {
    // "zeta" non e' fra le variabili dell'esercizio, usata DA SOLA dentro
    // \var{}. Il motore la tratterebbe come un simbolo libero — vedi la
    // nota sotto identificatoriTesto in verifica.ts — e caricherebbe senza
    // errori: e' esattamente il caso che il controllo statico deve
    // riconoscere PRIMA di provare a caricare, confrontando gli
    // identificatori estratti dal testo grezzo con le variabili dichiarate.
    const e: EsercizioEditor = { ...base, testo: "Il valore e' \\(\\var{zeta}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.seme).toBe(0);
      expect(esito.messaggio).toContain("zeta");
    }
  });

  it("la stessa variabile inesistente dentro un'espressione viene comunque intercettata", () => {
    // Prima della correzione del giro 1, questo caso (il nome sciolto usato
    // dentro un'operazione) era l'UNICO che il motore stesso intercettava,
    // lanciando in caricamento. Ora il controllo statico lo intercetta
    // prima ancora di provare a caricare, in fase testo — stesso esito per
    // entrambe le forme, come deve essere: la differenza fra "\\var{zeta}"
    // e "\\var{2*zeta}" non e' rilevante per il docente.
    const e: EsercizioEditor = { ...base, testo: "Il valore e' \\(\\var{2*zeta}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("zeta");
    }
  });

  it("una variabile inesistente dentro \\simplify{{...}} viene intercettata", () => {
    // "c" non e' dichiarata (l'esercizio ha solo a e b): il docente ha
    // probabilmente rinominato una variabile e dimenticato di aggiornare
    // il testo. Le graffe di raggruppamento LaTeX (x^{2}, \frac{a}{b}) non
    // devono essere confuse con questa forma: verificato separatamente
    // sotto ("le graffe di raggruppamento LaTeX non sono confuse...").
    const e: EsercizioEditor = { ...base, testo: "Risolvi \\(\\simplify{ {a}x+{c} }=0\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.seme).toBe(0);
      expect(esito.messaggio).toContain("c");
    }
  });

  it("le graffe di raggruppamento LaTeX non sono confuse con \\var{}/\\simplify{}", () => {
    // x^{2} e \frac{p}{q} usano le graffe per raggruppare, non per marcare
    // una sostituzione: non contengono il comando letterale \var o
    // \simplify, quindi identificatoriTesto non li tocca. "p" e "q" qui
    // NON sono variabili dichiarate (l'esercizio ha solo a e b): se il
    // controllo li confondesse con riferimenti a variabili, l'esercizio
    // fallirebbe in fase testo per "p" o "q". Invece passa — la prova che
    // le graffe di raggruppamento sono ignorate — mentre \var{a}, che
    // referenzia una variabile vera, resta permesso.
    const e: EsercizioEditor = { ...base,
      testo: "Il polinomio \\(x^{2}+\\frac{p}{q}\\) e il valore \\(\\var{a}\\)" };
    expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
  });

  it("una variabile inesistente nel suggerimento (advice) viene intercettata (giro 2)", () => {
    // Il suggerimento e' il testo "come si risolve" che il player mostra
    // DOPO che lo studente ha sbagliato: nel corpus reale e' il campo piu'
    // denso di riferimenti a variabili (sei file su otto, fino a cinque
    // riferimenti), eppure prima di questa correzione non era guardato
    // affatto — solo il testo dell'enunciato lo era.
    const e: EsercizioEditor = { ...base, suggerimento: "Si usa \\(\\var{zeta}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("zeta");
      expect(esito.messaggio).toContain("suggerimento");
    }
  });

  it("una variabile inesistente nella consegna di una parte viene intercettata (giro 2)", () => {
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "numerica",
      consegna: "Quanto vale \\(\\var{zeta}\\)?", punti: 2,
      valore: "a", tolleranza: { tipo: "esatta" } }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("zeta");
      expect(esito.messaggio).toContain("consegna");
    }
  });

  it("una variabile inesistente in una risposta a scelta multipla viene intercettata (giro 2)", () => {
    // Nel corpus reale le scelte del file 02 sono piene di \var{a}: e'
    // l'altro campo denso che la correzione del giro 1 lasciava scoperto.
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "scelta",
      consegna: "Quale?", punti: 2,
      risposte: ["\\(\\var{zeta}\\)", "altro"], indiceGiusta: 1 }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("zeta");
      expect(esito.messaggio).toContain("risposta");
    }
  });

  it("una variabile inesistente nella spiegazione di una risposta sbagliata viene intercettata (giro 2)", () => {
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "scelta",
      consegna: "Quale?", punti: 2,
      risposte: ["giusta", "sbagliata"], indiceGiusta: 0,
      spiegazioni: ["", "No, perche' \\(\\var{zeta}\\) non c'entra"] }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("zeta");
      expect(esito.messaggio).toContain("spiegazione");
    }
  });

  it("un comando LaTeX che condivide il prefisso \\var (\\varphi) non manda in eccezione la verifica (giro 3)", () => {
    // \varphi, \vartheta, \varepsilon... condividono il prefisso letterale
    // "\var" col marcatore di sostituzione: texsplit (il motore) cerca
    // solo quel prefisso, senza un confine di parola, e senza una graffa
    // subito dopo lancia "manca il parametro" — loadQuestion incontra lo
    // STESSO errore piu' avanti (fase caricamento), quindi un esercizio
    // di trigonometria con \varphi nel testo e' genuinamente rotto. Prima
    // di questa correzione pero' il controllo statico (che gira PRIMA di
    // loadQuestion) non intercettava quel lancio: scappava non gestito da
    // verificaSuSemi invece di diventare un esito normale — un problema
    // suo, non dell'esercizio.
    const e: EsercizioEditor = { ...base, testo: "L'angolo \\(\\varphi\\) e' acuto" };
    let esito: ReturnType<typeof verificaSuSemi> | undefined;
    expect(() => {
      esito = verificaSuSemi(versoNumbas(e));
    }).not.toThrow();
    expect(esito?.ok).toBe(false);
    if (esito && !esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("varphi");
    }
  });

  it("il difetto sqrt() reso con 'undefined' viene intercettato nel testo dell'esercizio (giro 3)", () => {
    // \simplify{sqrt()} senza graffe di sostituzione interne: il
    // controllo statico non lo vede (non c'e' nessun identificatore da
    // estrarre — "sqrt()" non ha un {...} dentro, vedi identificatoriTesto
    // in verifica.ts), quindi e' il controllo a runtime sul testo GIA'
    // sostituito a doverlo intercettare. Pin di quel controllo: prima di
    // questa correzione nessun test lo raggiungeva piu', perche' ogni caso
    // a forma di \var{} viene ora intercettato prima dal controllo
    // statico.
    const e: EsercizioEditor = { ...base, testo: "\\(\\simplify{sqrt()}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("undefined");
    }
  });

  it("lo stesso difetto viene intercettato anche nel suggerimento, non solo nel testo (giro 3)", () => {
    // Prima di questa correzione il controllo a runtime guardava solo
    // statementHtml: lo stesso \simplify{sqrt()} scritto nel suggerimento
    // (il campo piu' denso di riferimenti a variabili nel corpus reale)
    // restituiva ok:true — il difetto per cui la fase "testo" esiste
    // proprio non veniva visto, nel campo che il corpus usa di piu'.
    const e: EsercizioEditor = { ...base, suggerimento: "\\(\\simplify{sqrt()}\\)" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("suggerimento");
    }
  });

  it("lo stesso difetto viene intercettato anche nella consegna sostituita di una parte (giro 3)", () => {
    const e: EsercizioEditor = { ...base, parti: [{ tipo: "numerica",
      consegna: "\\(\\simplify{sqrt()}\\)", punti: 2,
      valore: "a", tolleranza: { tipo: "esatta" } }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("testo");
      expect(esito.messaggio).toContain("consegna");
    }
  });

  it("una condizione impossibile viene intercettata, non attesa all'infinito", () => {
    // a e' random(2..9): non supera mai 100. variablesTest.maxRuns e' 10
    // (versoNumbas), quindi il motore esaurisce i tentativi e lancia invece
    // di rimanere in attesa.
    const e: EsercizioEditor = { ...base, condizione: "a > 100" };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("caricamento");
      expect(esito.seme).toBe(0);
    }
  });

  it("una risposta attesa che rende con 'undefined' viene intercettata (difetto noto del motore)", () => {
    // sqrt() senza argomento: renderLatex("sqrt()") restituisce
    // "\\sqrt{ undefined }" invece di lanciare (difetto registrato del
    // motore). correctAnswer() qui NON lancia: restituisce la stringa
    // "sqrt()" cosi' com'e', ed e' il rendering successivo a tradire la
    // risposta incompleta.
    const e: EsercizioEditor = { ...base, parti: [
      { tipo: "espressione", consegna: "x", punti: 2, risposta: "sqrt()" }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("risposta");
      expect(esito.seme).toBe(0);
    }
  });

  it("un multiplo esatto di pi greco come risposta numerica non viene rifiutato (giro 3)", () => {
    // L'area di un cerchio di raggio 2: pi*4, tolleranza esatta.
    // correctAnswer() restituisce "4*pi" — niceNumber rende un multiplo
    // ESATTO di pi greco in forma simbolica quando la precisione non e'
    // impostata (il caso sia della tolleranza esatta sia di quella a
    // margine) — una stringa che non e' un numero JME valutabile as-is,
    // ma un artefatto di PRESENTAZIONE: la correzione per uno studente
    // vero funziona benissimo, perche' minValue/maxValue valutano a un
    // numero reale finito (12.566...). L'esercizio non e' rotto.
    const e: EsercizioEditor = { ...base, testo: "Area del cerchio di raggio 2",
      variabili: [],
      parti: [{ tipo: "numerica", consegna: "x", punti: 2,
                valore: "pi*4", tolleranza: { tipo: "esatta" } }] };
    expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
  });

  it("una parte numerica la cui risposta e' 'infinity' viene intercettata (giro 1)", () => {
    // "1/a" con a = random(-3..3): quando a vale 0 (semi 14 e 17, stesso
    // generatore del test sulla divisione per zero) il motore NON lancia —
    // restituisce la stringa "infinity" come risposta corretta, un valore
    // che nessuno studente puo' scrivere in una casella numerica. Prima
    // della correzione del giro 1, il controllo "risposta" si fermava a
    // "correctAnswer() ha restituito qualcosa di non nullo" e lasciava
    // passare questo caso: una parte numerica non aveva alcun controllo
    // sul CONTENUTO della risposta, solo sulla sua presenza.
    const e: EsercizioEditor = { ...base, testo: "x",
      variabili: [{ nome: "a", definizione: "random(-3..3)", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "x", punti: 2,
                valore: "1/a", tolleranza: { tipo: "esatta" } }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) {
      expect(esito.fase).toBe("risposta");
      expect(esito.seme).toBe(14);
    }
  });

  it("una parte espressione con un identificatore nudo che coincide con una variabile della domanda resta accettata (giro 5)", () => {
    // "1/a" con a = random(-3..3), come risposta di una parte ESPRESSIONE
    // (Numbas jme). Il giro 4 di questo task rifiutava questo esercizio,
    // convinto che "a" restasse legata al valore del seme (0 al seme 14)
    // a tempo di correzione — un'assunzione MAI verificata contro il
    // motore, e SBAGLIATA: lo script di correzione incorporato per le
    // parti jme (marking/scripts/jme.jme, la nota "vset") chiama
    // make_variables su OGNI identificatore che findvars trova nella
    // risposta, e make_variables (variables/builtins.ts) CANCELLA il
    // legame ereditato dallo scope e ne pesca uno nuovo su vsetRange per
    // ogni punto di confronto — un identificatore nudo in una risposta
    // jme non e' MAI valutato contro il valore del seme. Solo la
    // sostituzione {nome} (gia' risolta prima che correctAnswer()
    // restituisca la stringa) produce un numero fisso per seme.
    //
    // Verificato facendo girare la correzione vera, non per lettura:
    // q.getPart("p0").storeAnswer("1/a"); submit() da' credito 1/1 su
    // TUTTI i venti semi, incluso il 14 e il 17 (a=0) — e una risposta
    // sbagliata allo stesso seme da' credito 0, quindi non e' un timbro
    // che passa tutto: l'esercizio funziona davvero. Un test che
    // affermasse il rifiuto qui fisserebbe una convinzione sbagliata
    // invece di verificare qualcosa — peggio di nessun test.
    const e: EsercizioEditor = { ...base, testo: "x",
      variabili: [{ nome: "a", definizione: "random(-3..3)", descrizione: "" }],
      parti: [{ tipo: "espressione", consegna: "x", punti: 2, risposta: "1/a" }] };
    expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
  });

  it("una risposta con una vera variabile libera dello studente resta accettata (giro 4)", () => {
    // Modellato sull'esercizio 06 del corpus reale (la derivata di
    // a*x^n): risposta "{a}*{n}*x^({n-1})", dove {a} e {n} sono variabili
    // della domanda (sostituite col loro valore da correctAnswer() prima
    // di restituire la stringa) e "x" e' la variabile LIBERA dello
    // studente — non vincolata a nessun valore, apposta. Dopo il giro 5,
    // "x" non e' piu' trattata diversamente da "a" nel test sopra:
    // ENTRAMBE vengono campionate su vsetRange, perche' e' cosi' che la
    // correzione le tratta davvero. Questo test resta comunque utile come
    // guardia di regressione contro un futuro controllo che tornasse a
    // valutare un identificatore nudo contro un valore fisso.
    const e: EsercizioEditor = { ...base, testo: "Deriva",
      variabili: [
        { nome: "a", definizione: "random(2..9)", descrizione: "" },
        { nome: "n", definizione: "random(2..5)", descrizione: "" },
      ],
      parti: [{ tipo: "espressione", consegna: "\\(\\frac{d}{dx}(ax^n)=\\)", punti: 2,
                risposta: "{a}*{n}*x^({n-1})" }] };
    expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
  });

  it("si ferma al primo seme che fallisce", () => {
    // un esercizio rotto per OGNI seme deve riportare il seme 0, non 20 su
    // 20: la funzione deve fermarsi al primo, non contare i falliti.
    const e: EsercizioEditor = { ...base, variabili: [
      { nome: "a", definizione: "random(2..9)", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "x", punti: 2,
                valore: "sqrt(-a)", tolleranza: { tipo: "esatta" } }] };
    const esito = verificaSuSemi(versoNumbas(e));
    expect(esito.ok).toBe(false);
    if (!esito.ok) expect(esito.seme).toBe(0);
  });

  it("quanti e' opzionale e vale venti di default: con un solo seme sano non basta a dirsi passato", () => {
    // Se quanti fosse ignorato e si controllassero sempre venti semi, un
    // esercizio che fallisce solo al seme 14 risulterebbe comunque "ok"
    // quando gli si chiede di controllarne soli dieci.
    const e: EsercizioEditor = { ...base, variabili: [
      { nome: "a", definizione: "random(-3..3)", descrizione: "" },
      { nome: "b", definizione: "random(1..(1/a))", descrizione: "" }],
      parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
                valore: "b", tolleranza: { tipo: "esatta" } }] };
    const question = versoNumbas(e);
    expect(verificaSuSemi(question, 10)).toEqual({ ok: true });
    const esito = verificaSuSemi(question, 15);
    expect(esito.ok).toBe(false);
  });

  describe("C1 — un valore razionale con margine (ComplexDecimal)", () => {
    // L'esempio della specifica stessa: "risolvi ax+b=c, accetta ±0.01" —
    // il primo esercizio che un docente scrive. a, b, c sono interi
    // (random(...)): (c-b)/a valuta a un token JME "rational"
    // (math.Fraction), ma sottrarre/sommare il margine decimale "0.01" (un
    // letterale con la virgola, token "decimal") promuove l'intero
    // risultato a "decimal" (math.ComplexDecimal) — comeNumeroFinito prima
    // di questa correzione non sapeva riconoscere quel tipo e giudicava
    // l'estremo "non finito" anche quando vale un numero reale finitissimo.
    it("(c-b)/a con margine 0.01 non viene rifiutato per estremo non finito", () => {
      const e: EsercizioEditor = { ...base,
        variabili: [
          { nome: "a", definizione: "random(2..9)", descrizione: "" },
          { nome: "b", definizione: "random(-9..9 except 0)", descrizione: "" },
          { nome: "c", definizione: "random(-9..9 except 0)", descrizione: "" },
        ],
        parti: [{ tipo: "numerica", consegna: "\\(x=\\)", punti: 2,
                  valore: "(c-b)/a", tolleranza: { tipo: "margine", margine: "0.01" } }] };
      expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
    });

    it("a/2 con margine 0.01 non viene rifiutato", () => {
      const e: EsercizioEditor = { ...base, testo: "x",
        variabili: [{ nome: "a", definizione: "random(2..9)", descrizione: "" }],
        parti: [{ tipo: "numerica", consegna: "x", punti: 2,
                  valore: "a/2", tolleranza: { tipo: "margine", margine: "0.01" } }] };
      expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
    });

    // Guardia contro la correzione eccessiva: un estremo che valuta
    // DAVVERO a un numero non finito (divisione per zero) deve restare
    // rifiutato anche dopo che comeNumeroFinito riconosce ComplexDecimal —
    // qui a*b/c, con c che vale zero al seme 0 (random(0..3)).
    it("a*b/c con c che puo' valere zero resta rifiutato", () => {
      const e: EsercizioEditor = { ...base,
        variabili: [
          { nome: "a", definizione: "random(2..9)", descrizione: "" },
          { nome: "b", definizione: "random(2..9)", descrizione: "" },
          { nome: "c", definizione: "random(0..3)", descrizione: "" },
        ],
        parti: [{ tipo: "numerica", consegna: "x", punti: 2,
                  valore: "a*b/c", tolleranza: { tipo: "margine", margine: "0.01" } }] };
      const esito = verificaSuSemi(versoNumbas(e));
      expect(esito.ok).toBe(false);
    });
  });

  describe("I1 — le scelte e le spiegazioni di una parte a scelta multipla non bypassano piu' la verifica", () => {
    // Il difetto dimostrato dal revisore: `testiSostituiti` copre statement,
    // advice e i prompt (gia' sostituiti dal motore al caricamento), ma
    // "choices"/"distractors" restano grezzi finche' il PLAYER non li
    // sostituisce a schermo (player-esercizio.tsx:107,
    // `variables.substituteHtml` sullo scope della parte) — lo stesso
    // meccanismo, non un secondo. Lo stesso identico \simplify{sqrt()} che
    // nello statement viene gia' rifiutato ("il difetto sqrt() reso con
    // 'undefined' viene intercettato nel testo dell'esercizio", sopra) qui
    // passava indenne quando scritto in una risposta proposta o nella sua
    // spiegazione.
    it("\\simplify{sqrt()} in una risposta proposta (choices) viene intercettato", () => {
      const e: EsercizioEditor = { ...base, testo: "x",
        parti: [{ tipo: "scelta", consegna: "Quale?", punti: 2,
          risposte: ["\\(\\simplify{sqrt()}\\)", "altro"], indiceGiusta: 1 }] };
      const esito = verificaSuSemi(versoNumbas(e));
      expect(esito.ok).toBe(false);
      if (!esito.ok) {
        expect(esito.fase).toBe("testo");
        expect(esito.messaggio).toContain("undefined");
        expect(esito.messaggio).toContain("risposta");
      }
    });

    it("\\simplify{sqrt()} nella spiegazione di una risposta sbagliata (distractors) viene intercettato", () => {
      const e: EsercizioEditor = { ...base, testo: "x",
        parti: [{ tipo: "scelta", consegna: "Quale?", punti: 2,
          risposte: ["giusta", "sbagliata"], indiceGiusta: 0,
          spiegazioni: ["", "\\(\\simplify{sqrt()}\\)"] }] };
      const esito = verificaSuSemi(versoNumbas(e));
      expect(esito.ok).toBe(false);
      if (!esito.ok) {
        expect(esito.fase).toBe("testo");
        expect(esito.messaggio).toContain("undefined");
        expect(esito.messaggio).toContain("spiegazione");
      }
    });

    // `\var{sqrt()}` (chiamata senza argomenti) fa LANCIARE la sostituzione
    // vera (`scope.evaluate`, dentro `variables.substituteHtml`) invece di
    // restituire "undefined" — il difetto dimostrato: "il player throws".
    // La verifica deve intercettare anche questo, come un esito normale, non
    // lasciarlo scappare come eccezione non gestita da verificaSuSemi.
    it("\\var{sqrt()} in una risposta proposta non manda in eccezione la verifica, viene rifiutato", () => {
      const e: EsercizioEditor = { ...base, testo: "x",
        parti: [{ tipo: "scelta", consegna: "Quale?", punti: 2,
          risposte: ["\\(\\var{sqrt()}\\)", "altro"], indiceGiusta: 1 }] };
      let esito: ReturnType<typeof verificaSuSemi> | undefined;
      expect(() => {
        esito = verificaSuSemi(versoNumbas(e));
      }).not.toThrow();
      expect(esito?.ok).toBe(false);
      if (esito && !esito.ok) expect(esito.fase).toBe("testo");
    });

    // Guardia contro la correzione eccessiva: una scelta e una spiegazione
    // "pulite", che referenziano solo variabili dichiarate, restano accettate.
    it("scelte e spiegazioni che referenziano variabili dichiarate restano accettate", () => {
      const e: EsercizioEditor = { ...base,
        parti: [{ tipo: "scelta", consegna: "Quale?", punti: 2,
          risposte: ["\\(\\var{a}\\)", "\\(\\var{b}\\)"], indiceGiusta: 0,
          spiegazioni: ["", "No, e' \\(\\var{a}\\), non \\(\\var{b}\\)"] }] };
      expect(verificaSuSemi(versoNumbas(e))).toEqual({ ok: true });
    });
  });

  // I2 (Onda di correzioni finale): il revisore ha dimostrato con sedici
  // mutazioni usa-e-getta, mai committate, che diversi controlli non
  // facevano fallire NESSUN test esistente se rimossi — fra queste, rendere
  // `rispostaJmeFinita` sempre vera. Nessun test già presente esercita il
  // suo ramo "almeno un identificatore libero" quando quella libertà porta
  // OGNI campione in una regione non valida (il commento su
  // `rispostaJmeFinita` cita esattamente questo esempio, "sqrt(x-5)
  // campionata su [0,1] lancia a ogni punto"): il test più vicino ("una
  // risposta con una vera variabile libera dello studente resta accettata")
  // copre solo il caso SANO. Questo test copre il rifiuto.
  describe("I2 — rispostaJmeFinita rifiuta una risposta jme che cade sempre fuori dominio", () => {
    it("sqrt(x-5), con x variabile libera campionata sul vsetRange di default [0,1], viene rifiutata", () => {
      const e: EsercizioEditor = { ...base, testo: "x", variabili: [],
        parti: [{ tipo: "espressione", consegna: "x", punti: 2, risposta: "sqrt(x-5)" }] };
      const esito = verificaSuSemi(versoNumbas(e));
      expect(esito.ok).toBe(false);
      if (!esito.ok) {
        expect(esito.fase).toBe("risposta");
        expect(esito.messaggio).toContain("sqrt(x");
        expect(esito.messaggio).toContain("non valuta a un numero finito");
      }
    });
  });
});
