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
});
