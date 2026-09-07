import { errorMessageIn, loadQuestion, renderLatex, type NumbasQuestionJSON } from "@savint/engine";

/** Quante volte la verifica prova, per difetto: vedi la nota sotto
 * `verificaSuSemi` sul perche' venti e non un altro numero. */
const SEMI_PREDEFINITI = 20;

export type EsitoVerifica =
  | { ok: true }
  | {
      ok: false;
      seme: number;
      fase: "caricamento" | "testo" | "risposta";
      messaggio: string;
    };

/** Un esercizio a variabili casuali funziona per il seme che il docente ha
 * visto in anteprima e può comunque rompersi per un altro studente: una
 * variabile che divide per zero solo per certi valori, una `\var{}` che
 * nomina una variabile inesistente, una condizione così stretta che il
 * motore non riesce mai a soddisfarla, una risposta attesa incompleta che
 * il motore non segnala. Questa funzione è l'unico posto che lo scopre
 * PRIMA che lo scopra uno studente: rigenera l'esercizio da zero, seme dopo
 * seme, e si ferma al primo che non regge — al docente serve un caso da
 * guardare, non un elenco di venti.
 *
 * `quanti` è 20 per difetto: sotto il secondo su una macchina normale
 * (misurato nel rapporto del task). Non è un limite tecnico del motore, è
 * un compromesso dichiarato fra copertura e costo per ogni salvataggio —
 * va discusso se la misura cambia, non alzato in silenzio. */
export function verificaSuSemi(question: unknown, quanti: number = SEMI_PREDEFINITI): EsitoVerifica {
  for (let seme = 0; seme < quanti; seme++) {
    let caricata;
    try {
      caricata = loadQuestion(question as NumbasQuestionJSON, { seed: String(seme), locale: "it" });
    } catch (e) {
      return { ok: false, seme, fase: "caricamento", messaggio: errorMessageIn(e, "it") };
    }

    // Il testo sostituito non deve lasciare marcatori `\var{` non risolti
    // né la stringa "undefined": un marcatore rimasto grezzo o un valore
    // mancante finirebbe stampato, letteralmente, davanti allo studente.
    if (caricata.statementHtml.includes("\\var{")) {
      return {
        ok: false,
        seme,
        fase: "testo",
        messaggio: "il testo sostituito contiene ancora un marcatore \\var{} non risolto",
      };
    }
    if (caricata.statementHtml.includes("undefined")) {
      return {
        ok: false,
        seme,
        fase: "testo",
        messaggio: "il testo sostituito contiene la stringa \"undefined\"",
      };
    }

    for (const parte of caricata.allParts()) {
      let risposta;
      try {
        risposta = parte.correctAnswer();
      } catch (e) {
        return { ok: false, seme, fase: "risposta", messaggio: errorMessageIn(e, "it") };
      }
      if (risposta === null || risposta === undefined) {
        return {
          ok: false,
          seme,
          fase: "risposta",
          messaggio: `la parte "${parte.path}" non ha una risposta corretta`,
        };
      }

      // Il controllo esiste per un difetto noto e registrato del motore:
      // `renderLatex("sqrt()")` restituisce `\sqrt{ undefined }` invece di
      // lanciare (vedi il rapporto del task). Senza questo controllo una
      // risposta attesa incompleta di una parte "espressione" (tipo
      // Numbas `jme`) passerebbe in silenzio: `correctAnswer()` per quel
      // tipo restituisce proprio l'espressione JME della risposta.
      //
      // Si applica SOLO alle parti "jme": una parte "numerica" (Numbas
      // `numberentry`) restituisce invece un numero già formattato per la
      // lettura (stile europeo, virgola decimale — es. "-0,25"), che non è
      // sintassi JME valida e romperebbe `renderLatex` per un motivo che
      // non ha niente a che fare con l'esercizio. Una parte a scelta
      // multipla restituisce la matrice dei punteggi, senza un rendering
      // LaTeX da controllare.
      if (parte.type === "jme" && typeof risposta === "string") {
        let latex: string;
        try {
          latex = renderLatex(risposta, { locale: "it" });
        } catch (e) {
          return { ok: false, seme, fase: "risposta", messaggio: errorMessageIn(e, "it") };
        }
        if (latex.includes("undefined")) {
          return {
            ok: false,
            seme,
            fase: "risposta",
            messaggio: `la parte "${parte.path}" rende una risposta con "undefined": ${latex}`,
          };
        }
      }
    }
  }

  return { ok: true };
}
