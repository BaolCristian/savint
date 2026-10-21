import type { EsercizioEditor } from "../editor/modello";

/** Il prompt che il docente copia e incolla in un'IA esterna (ChatGPT,
 * Claude, …) per farsi generare esercizi da importare.
 *
 * Il testo vive qui e non nei messaggi di next-intl: è pieno di graffe del
 * JSON e di `\var{…}`, che il formato ICU dei messaggi scambierebbe per
 * segnaposti. Modulo puro e senza dipendenze dal server: lo importa la
 * pagina del prompt nel browser.
 *
 * L'esempio incorporato nel prompt è un oggetto vero, non testo: il test
 * (`__tests__/prompt.test.ts`) lo fa passare per lo schema dell'editor e per
 * la verifica sui venti semi. Se lo schema cambia e l'esempio smette di
 * essere un esercizio valido, lo dice il test, non un docente che importa
 * venti esercizi sbagliati. */

/** Le coordinate di due punti, intere fra -9 e 9. I nomi sono `x1`, `y1`,
 * `x2`, `y2` e non `xA`, `xB`: i nomi delle variabili JME non distinguono
 * maiuscole e minuscole, e l'esempio non deve suggerire all'IA nomi che
 * potrebbero scontrarsi. */
const coordinate = [
  { nome: "x1", definizione: "random(-9..9)", descrizione: "ascissa di A" },
  { nome: "y1", definizione: "random(-9..9)", descrizione: "ordinata di A" },
  { nome: "x2", definizione: "random(-9..9)", descrizione: "ascissa di B" },
  { nome: "y2", definizione: "random(-9..9)", descrizione: "ordinata di B" },
];

/** A = B renderebbe il segmento un punto solo: lo si esclude dai sorteggi. */
const PUNTI_DISTINTI = "x1 <> x2 or y1 <> y2";

const TESTO_DUE_PUNTI = String.raw`Nel piano cartesiano sono dati i punti \(A(\var{x1}; \var{y1})\) e \(B(\var{x2}; \var{y2})\).`;

export const ESEMPIO_IMPORT: { esercizi: EsercizioEditor[] } = {
  esercizi: [
    {
      meta: {
        titolo: "Distanza fra due punti",
        descrizione: "Date le coordinate di due punti del piano cartesiano, calcolare la loro distanza.",
        anno: 2,
        argomento: "piano cartesiano",
        tag: ["piano cartesiano", "distanza"],
        difficolta: 1,
      },
      testo: TESTO_DUE_PUNTI,
      suggerimento: String.raw`La distanza fra due punti è \(AB = \sqrt{(x_B - x_A)^2 + (y_B - y_A)^2}\). Qui \(x_B - x_A = \var{x2 - x1}\) e \(y_B - y_A = \var{y2 - y1}\), quindi \(AB = \sqrt{\var{(x2 - x1)^2 + (y2 - y1)^2}} \approx \var{dpformat(d, 2)}\).`,
      variabili: [...coordinate, { nome: "d", definizione: "sqrt((x2 - x1)^2 + (y2 - y1)^2)", descrizione: "la distanza AB" }],
      condizione: PUNTI_DISTINTI,
      parti: [
        {
          tipo: "numerica",
          consegna: String.raw`Calcola la distanza \(AB\), arrotondata a due cifre decimali.`,
          punti: 2,
          valore: "d",
          tolleranza: { tipo: "decimali", cifre: 2 },
        },
      ],
    },
    {
      meta: {
        titolo: "Punto medio di un segmento",
        descrizione: "Date le coordinate degli estremi di un segmento, calcolare le coordinate del suo punto medio.",
        anno: 2,
        argomento: "piano cartesiano",
        tag: ["piano cartesiano", "punto medio"],
        difficolta: 1,
      },
      testo: TESTO_DUE_PUNTI + String.raw` Calcola le coordinate del punto medio \(M\) del segmento \(AB\).`,
      suggerimento: String.raw`Le coordinate del punto medio sono le medie delle coordinate degli estremi: \(x_M = \dfrac{x_A + x_B}{2} = \var{(x1 + x2)/2}\) e \(y_M = \dfrac{y_A + y_B}{2} = \var{(y1 + y2)/2}\).`,
      variabili: coordinate,
      condizione: PUNTI_DISTINTI,
      parti: [
        { tipo: "numerica", consegna: String.raw`\(x_M =\)`, punti: 1, valore: "(x1 + x2)/2", tolleranza: { tipo: "esatta" } },
        { tipo: "numerica", consegna: String.raw`\(y_M =\)`, punti: 1, valore: "(y1 + y2)/2", tolleranza: { tipo: "esatta" } },
      ],
    },
  ],
};

export interface DatiPrompt {
  argomento: string;
  classe: number; // 1..5, la classe della secondaria di secondo grado → meta.anno
  quanti: number; // 1..30
}

function promptItaliano({ argomento, classe, quanti }: DatiPrompt, esempio: string): string {
  const quantiEsercizi = quanti === 1 ? "1 esercizio" : `${quanti} esercizi`;
  return String.raw`Sei un docente di matematica della scuola secondaria di secondo grado italiana. Scrivi ${quantiEsercizi} di matematica sull'argomento "${argomento}" per la classe ${classe}ª superiore, da importare nella piattaforma Savint.

RISPONDI SOLO CON IL JSON: niente testo prima o dopo, niente commenti, niente blocchi di codice. Usa le virgolette dritte " (non “ ”). Il JSON deve essere valido.

STRUTTURA
{ "esercizi": [ esercizio, esercizio, ... ] } con esattamente ${quanti} elementi.

Ogni esercizio ha TUTTI questi campi:
- "meta": oggetto con
  - "titolo": stringa breve, non vuota;
  - "descrizione": una frase su cosa si chiede (può essere "");
  - "anno": il numero ${classe}, cioè "anno": ${classe} (numero, non stringa);
  - "argomento": stringa non vuota, per esempio "${argomento}";
  - "tag": array di stringhe (può essere []);
  - "difficolta": 1 (facile), 2 (media) o 3 (difficile) — scegli tu, variando fra gli esercizi.
- "testo": la consegna generale dell'esercizio.
- "suggerimento": la spiegazione di come si risolve, mostrata allo studente dopo la risposta (può essere "", ma è meglio scriverla).
- "variabili": array di { "nome", "definizione", "descrizione" } (può essere []).
- "condizione": espressione che i valori sorteggiati devono rispettare, oppure "".
- "parti": array con almeno una parte (le domande a cui lo studente risponde).

TIPI DI PARTE (scegli tu il tipo più adatto a ogni domanda). Ogni parte ha "tipo", "consegna" (stringa) e "punti" (numero, almeno 1), più:
- "numerica": risposta numerica.
  "valore": espressione che dà il risultato esatto, scritta con le variabili (es. "-b/a"), con il punto decimale (0.5, non 0,5);
  "tolleranza": uno fra
    { "tipo": "esatta" } — risposta esatta (va bene per interi e decimali finiti);
    { "tipo": "margine", "margine": "0.01" } — accetta valore ± margine (il margine è una stringa);
    { "tipo": "decimali", "cifre": 2 } — lo studente arrotonda a quel numero di cifre decimali (da 0 a 6); usala per i risultati irrazionali o periodici e scrivi nella consegna a quante cifre arrotondare.
- "scelta": una sola risposta giusta.
  "risposte": da 2 a 6 stringhe; "indiceGiusta": posizione della risposta giusta, contando da 0 (0 = la prima). Le risposte vengono mescolate per lo studente.
  Facoltativo "spiegazioni": array lungo quanto "risposte", con il commento per chi sceglie quella risposta ("" per la risposta giusta).
- "sceltaMultipla": più risposte giuste, corretta tutto o niente.
  "risposte": da 2 a 8 stringhe; "corrette": array di true/false lungo esattamente quanto "risposte", con almeno un true. Facoltativo "spiegazioni" come sopra.
- "espressione": la risposta è un'espressione o un polinomio.
  "risposta": l'espressione corretta in sintassi JME (es. "2*x^2 - 3*x"); viene confrontata numericamente, quindi le forme equivalenti sono accettate.

VARIABILI CASUALI (sintassi JME di Numbas)
Ogni studente riceve numeri diversi. Una variabile ha un "nome" (lettere, cifre e _, inizia con una lettera; maiuscole e minuscole NON contano, quindi non usare due nomi che differiscono solo per le maiuscole, e non usare nomi riservati come e, i, pi, x se x è l'incognita), una "definizione" e una "descrizione".
Definizioni utili:
- random(1..10) intero fra 1 e 10; random(-9..9 except 0) esclude lo 0; random(2, 3, 5, 7) uno fra i valori elencati;
- operazioni + - * / ^, parentesi, sqrt(x), abs(x), precround(x, 2) arrotonda a 2 decimali;
- una variabile può usare quelle definite prima (es. "d": "sqrt((x2 - x1)^2 + (y2 - y1)^2)").
Preferisci costruire l'esercizio a ritroso, partendo dalla soluzione, così che i numeri vengano "puliti" (es. scegli la soluzione s e il coefficiente a, poi b = -a*s).
"condizione" scarta i sorteggi degeneri e il motore risorteggia: per esempio "x1 <> x2 or y1 <> y2" esclude A = B; "a <> 0", "delta > 0". Lascia "" se non serve. Non renderla troppo stretta: deve essere vera per buona parte dei sorteggi.

COME SCRIVERE I TESTI ("testo", "suggerimento", "consegna", "risposte", "spiegazioni")
- Testo semplice in italiano: niente HTML, niente Markdown.
- Ogni formula, numero con segno o variabile va tra \( e \), in LaTeX: \(x^2 - 4 = 0\), \(\dfrac{a}{b}\), \(\sqrt{2}\).
- Il valore di una variabile si scrive \var{nome}, SEMPRE dentro \( \): \(\var{a}\). Fuori da \( \) non viene sostituito. Dentro \var{} puoi mettere un'espressione: \(\var{x2 - x1}\), \(\var{dpformat(d, 2)}\) (2 cifre decimali).
- Per un polinomio con coefficienti casuali usa \simplify{ } con ogni variabile tra graffe: \(\simplify{ {a}x + {b} } = 0\) (sistema da solo segni e coefficienti 1).
- Coordinate alla maniera italiana, con il punto e virgola: \(A(\var{x1}; \var{y1})\).
- Nel JSON ogni barra rovesciata va raddoppiata: \( si scrive "\\(", \var si scrive "\\var", \dfrac si scrive "\\dfrac".

DIVIETI
- Niente grafici, figure geometriche disegnate, diagrammi, immagini, tabelle, link: solo testo e formule.
- Ogni esercizio viene rigenerato con 20 sorteggi diversi e deve funzionare per tutti: nessuna divisione per zero, nessuna radice di un numero negativo, nessun risultato infinito, nessuna variabile usata nei testi senza essere dichiarata in "variabili".

ESEMPIO (due esercizi completi e validi; imitane la forma, non l'argomento)
${esempio}

Ora scrivi ${quantiEsercizi} su "${argomento}" per la classe ${classe}ª ("anno": ${classe}). Rispondi solo con il JSON.`;
}

function promptInglese({ argomento, classe, quanti }: DatiPrompt, esempio: string): string {
  const quantiEsercizi = quanti === 1 ? "1 exercise" : `${quanti} exercises`;
  return String.raw`You are a mathematics teacher at an Italian upper secondary school. Write ${quantiEsercizi} on the topic "${argomento}" for year ${classe} of upper secondary school, to be imported into the Savint platform. Write the exercise texts in English; the JSON field names stay exactly as shown (they are in Italian).

REPLY ONLY WITH THE JSON: no text before or after, no comments, no code blocks. Use straight double quotes " (not “ ”). The JSON must be valid.

STRUCTURE
{ "esercizi": [ exercise, exercise, ... ] } with exactly ${quanti} elements.

Every exercise has ALL of these fields:
- "meta": object with
  - "titolo": short title, not empty;
  - "descrizione": one sentence on what is asked (may be "");
  - "anno": the number ${classe}, i.e. "anno": ${classe} (a number, not a string);
  - "argomento": non-empty topic, e.g. "${argomento}";
  - "tag": array of strings (may be []);
  - "difficolta": 1 (easy), 2 (medium) or 3 (hard) — you choose, varying across exercises.
- "testo": the general statement of the exercise.
- "suggerimento": the worked explanation shown to the student after answering (may be "", but better to write it).
- "variabili": array of { "nome", "definizione", "descrizione" } (may be []).
- "condizione": an expression the random values must satisfy, or "".
- "parti": array with at least one part (the questions the student answers).

PART TYPES (choose the most suitable type for each question). Every part has "tipo", "consegna" (string) and "punti" (number, at least 1), plus:
- "numerica": numeric answer.
  "valore": expression giving the exact result, written with the variables (e.g. "-b/a"), with a decimal point (0.5);
  "tolleranza": one of
    { "tipo": "esatta" } — exact answer (fine for integers and terminating decimals);
    { "tipo": "margine", "margine": "0.01" } — accepts value ± margin (the margin is a string);
    { "tipo": "decimali", "cifre": 2 } — the student rounds to that many decimal places (0 to 6); use it for irrational or repeating results and say in the "consegna" how many places to round to.
- "scelta": exactly one correct answer.
  "risposte": 2 to 6 strings; "indiceGiusta": position of the correct answer, counting from 0 (0 = the first). Answers are shuffled for the student.
  Optional "spiegazioni": array as long as "risposte", with the comment for whoever picks that answer ("" for the correct one).
- "sceltaMultipla": several correct answers, marked all or nothing.
  "risposte": 2 to 8 strings; "corrette": array of true/false exactly as long as "risposte", with at least one true. Optional "spiegazioni" as above.
- "espressione": the answer is an expression or polynomial.
  "risposta": the correct expression in JME syntax (e.g. "2*x^2 - 3*x"); it is compared numerically, so equivalent forms are accepted.

RANDOM VARIABLES (Numbas JME syntax)
Every student gets different numbers. A variable has a "nome" (letters, digits and _, starting with a letter; names are case-insensitive, so never use two names differing only in case, and avoid reserved names such as e, i, pi, or x when x is the unknown), a "definizione" and a "descrizione".
Useful definitions:
- random(1..10) integer from 1 to 10; random(-9..9 except 0) excludes 0; random(2, 3, 5, 7) one of the listed values;
- operators + - * / ^, parentheses, sqrt(x), abs(x), precround(x, 2) rounds to 2 decimals;
- a variable may use those defined before it (e.g. "d": "sqrt((x2 - x1)^2 + (y2 - y1)^2)").
Prefer building the exercise backwards from the solution so the numbers come out clean (e.g. pick the solution s and the coefficient a, then b = -a*s).
"condizione" discards degenerate draws and the engine draws again: e.g. "x1 <> x2 or y1 <> y2" excludes A = B; "a <> 0", "delta > 0". Leave "" if not needed. Do not make it too strict: it must hold for most draws.

HOW TO WRITE THE TEXTS ("testo", "suggerimento", "consegna", "risposte", "spiegazioni")
- Plain text: no HTML, no Markdown.
- Every formula, signed number or variable goes between \( and \), in LaTeX: \(x^2 - 4 = 0\), \(\dfrac{a}{b}\), \(\sqrt{2}\).
- A variable's value is written \var{name}, ALWAYS inside \( \): \(\var{a}\). Outside \( \) it is not substituted. Inside \var{} you may put an expression: \(\var{x2 - x1}\), \(\var{dpformat(d, 2)}\) (2 decimal places).
- For a polynomial with random coefficients use \simplify{ } with every variable in braces: \(\simplify{ {a}x + {b} } = 0\) (it tidies signs and coefficients equal to 1).
- Coordinates in Italian notation, with a semicolon: \(A(\var{x1}; \var{y1})\).
- In JSON every backslash must be doubled: \( is written "\\(", \var is written "\\var", \dfrac is written "\\dfrac".

FORBIDDEN
- No graphs, drawn geometric figures, charts, images, tables or links: only text and formulas.
- Every exercise is regenerated with 20 different draws and must work for all of them: no division by zero, no square root of a negative number, no infinite result, no variable used in the texts without being declared in "variabili".

EXAMPLE (two complete, valid exercises; copy their form, not their topic)
${esempio}

Now write ${quantiEsercizi} on "${argomento}" for year ${classe} ("anno": ${classe}). Reply only with the JSON.`;
}

/** Il prompt completo per l'IA, con l'esempio verificato incorporato così
 * com'è (`JSON.stringify` indentato: è la stessa forma che l'IA deve
 * restituire). */
export function promptEsercizi(dati: DatiPrompt, locale: "it" | "en"): string {
  const esempio = JSON.stringify(ESEMPIO_IMPORT, null, 2);
  return locale === "en" ? promptInglese(dati, esempio) : promptItaliano(dati, esempio);
}
