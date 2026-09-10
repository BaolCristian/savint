import { jme, renderLatex, errorMessageIn } from "@savint/engine";

/** L'esito di `ecoDi` per un campo JME.
 *
 * `"vuoto"` copre due casi ben diversi che il docente deve però vedere allo
 * stesso modo — nessuna eco: il campo non contiene nulla, oppure contiene
 * qualcosa che il motore sa compilare ma non sa ancora rendere (vedi la
 * trappola 1 sotto). Nell'uno e nell'altro caso non c'è niente di onesto da
 * mostrare, e mostrare comunque qualcosa mentirebbe. */
export type EsitoEco = { stato: "vuoto" } | { stato: "reso"; latex: string } | { stato: "errore"; messaggio: string };

/** L'eco del motore su un'espressione JME: come il motore l'ha capita,
 * prima che l'esercizio venga salvato o verificato.
 *
 * In due passi, non uno:
 *
 * 1. `jme.compile` valida la SINTASSI. Se lancia, l'espressione è
 *    sgrammaticata — `"errore"`, col messaggio tradotto (mai la chiave
 *    inglese: vedi la trappola 2).
 * 2. Solo se compila, `renderLatex` prova a RENDERE l'albero in LaTeX.
 *    Questo è un passo distinto perché il motore ha una sintassi più ampia
 *    di quanto sappia disegnare: `sqrt()` — l'argomento mancante appena
 *    premuto il tasto radice della tastiera, prima che lo studente scriva
 *    qualcosa — compila (una chiamata a zero argomenti è sintassi valida)
 *    ma la resa lancia (arità sbagliata) o, in altre versioni del motore,
 *    non lancia affatto e produce invece `"\sqrt{ undefined }"` — un buco
 *    del motore, non un errore del docente. Le due varianti sono difese
 *    insieme: si scarta sia il lancio sia la stringa che contiene
 *    "undefined" (la stessa regola già in `player/parti/espressione.tsx`).
 *    In entrambi i casi il risultato è `"vuoto"`, non `"errore"`: un
 *    messaggio come «sqrt è chiamata con 0 argomenti» sarebbe tecnicamente
 *    vero ma allarmante mentre si sta ancora scrivendo l'argomento, per
 *    un'espressione la cui sintassi — quella che il docente controlla
 *    davvero — è corretta.
 *
 * Il caso motivante di tutta la funzione è `"sin x"`: compila E rende, ma
 * come moltiplicazione fra una variabile "sin" e "x" (`\texttt{sin} \times
 * x`), non come seno di x. Non è un errore da intercettare — è proprio
 * quello che il motore fa, e l'eco esiste per farlo vedere. */
export function ecoDi(espressione: string): EsitoEco {
  const testo = espressione.trim();
  if (!testo) return { stato: "vuoto" };

  try {
    jme.compile(testo);
  } catch (e) {
    // Locale fissato a "it": stessa scelta di `verifica.ts` e
    // `redazione.ts`, non legata alla lingua dell'interfaccia (vedi
    // `<Anteprima locale="it" .../>` in `editor-esercizio.tsx`).
    return { stato: "errore", messaggio: errorMessageIn(e, "it") };
  }

  try {
    const latex = renderLatex(testo);
    if (/\bundefined\b/.test(latex)) return { stato: "vuoto" };
    return { stato: "reso", latex };
  } catch {
    // La sintassi è valida (il `compile` sopra non ha lanciato): un
    // fallimento qui è un limite della resa, non un errore del docente.
    return { stato: "vuoto" };
  }
}
