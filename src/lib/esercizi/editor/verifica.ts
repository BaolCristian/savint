import {
  errorMessageIn,
  jme,
  loadQuestion,
  math,
  renderLatex,
  variables,
  type NumbasQuestionJSON,
} from "@savint/engine";

/** Quante volte la verifica prova, per difetto: vedi la nota sotto
 * `verificaSuSemi` sul perche' venti e non un altro numero. */
const SEMI_PREDEFINITI = 20;

/** Gli identificatori JME liberi (non vincolati, non costanti) in
 * un'espressione. Una sintassi non compilabile non è un problema di NOME —
 * è un errore diverso che il caricamento vero segnalerà da sé (fase
 * `caricamento`) — quindi qui viene ignorata, non riportata due volte. */
function identificatoriEspressione(espressione: string): string[] {
  let albero;
  try {
    albero = jme.compile(espressione);
  } catch {
    return [];
  }
  return jme.findvars(albero);
}

/** Gli identificatori che il testo grezzo referenzia dentro `\var{...}` e
 * dentro le sotto-espressioni `{...}` di `\simplify{...}`, SOLO nelle zone
 * matematiche (`$...$`, `\(...\)`, `\[...\]`, `\begin{...}...\end{...}`) —
 * fuori da lì `\var`/`\simplify` non vengono affatto elaborati dal motore
 * (`substituteHtml`), quindi non sono riferimenti a variabili.
 *
 * Riusa gli stessi spezzatori del motore (`math.contentsplitbrackets` per
 * isolare le zone matematiche, `jme.texsplit` per trovare i comandi
 * `\var`/`\simplify` con l'argomento fra graffe bilanciate) invece di
 * reimplementare il riconoscimento delle graffe: è quello che GARANTISCE
 * che `x^{2}` o `\frac{a}{b}` — graffe di raggruppamento LaTeX, non
 * marcatori di sostituzione — non vengano scambiate per riferimenti a
 * variabili. Non contengono il comando letterale `\var`/`\simplify`, quindi
 * `texsplit` non le trova nemmeno. */
function identificatoriTesto(testoGrezzo: string): string[] {
  const trovati: string[] = [];
  const zone = math.contentsplitbrackets(testoGrezzo);
  for (let i = 0; i + 3 < zone.length; i += 4) {
    const comandi = jme.texsplit(zone[i + 2] as string);
    for (let j = 0; j + 3 < comandi.length; j += 4) {
      const comando = comandi[j + 1];
      const argomento = comandi[j + 3] as string;
      if (comando === "var") {
        trovati.push(...identificatoriEspressione(argomento));
      } else if (comando === "simplify") {
        // Dentro \simplify{...} la sostituzione e' un secondo livello di
        // graffe (`{a}x+{b}`): il resto dell'argomento resta simbolico
        // apposta (qui la "x"), quindi non va guardato.
        const sottoespressioni = math.splitbrackets(argomento, "{", "}", "(", ")");
        for (let k = 1; k < sottoespressioni.length; k += 2) {
          trovati.push(...identificatoriEspressione(sottoespressioni[k] as string));
        }
      }
    }
  }
  return trovati;
}

/** Un campo di testo grezzo da controllare, con una descrizione in
 * linguaggio da docente di dove si trova — usata nel messaggio d'errore
 * così che chi legge sappia DOVE guardare, non solo quale nome cercare. */
interface CampoTesto {
  descrizione: string;
  testo: string;
}

/** I soli elementi di un valore che sono stringhe: `choices`/`distractors`
 * arrivano dal JSON generico (`PartJSON` li dichiara solo tramite l'indice
 * `[k: string]: unknown`), quindi vanno controllati a runtime invece che
 * assunti. */
function soloStringhe(valore: unknown): string[] {
  return Array.isArray(valore) ? valore.filter((v): v is string => typeof v === "string") : [];
}

/** Ogni campo di testo che il motore sostituisce e che finisce, prima o
 * poi, sotto gli occhi di uno studente: l'enunciato, il suggerimento (il
 * "come si risolve" che il player mostra dopo una risposta sbagliata — nel
 * corpus reale è il campo più denso di riferimenti a variabili, non il
 * meno), la consegna di ogni parte, e per le parti a scelta multipla le
 * risposte proposte e la spiegazione di ognuna. Le consegne delle parti
 * sono vuote in tutto il corpus oggi, ma non c'è motivo di lasciarle senza
 * controllo: è la stessa sostituzione, sullo stesso motore. */
function campiTesto(question: NumbasQuestionJSON): CampoTesto[] {
  const campi: CampoTesto[] = [
    { descrizione: "nel testo dell'esercizio", testo: question.statement ?? "" },
    { descrizione: "nel suggerimento", testo: question.advice ?? "" },
  ];
  (question.parts ?? []).forEach((parte, indice) => {
    const numero = indice + 1;
    campi.push({ descrizione: `nella consegna della parte ${numero}`, testo: parte.prompt ?? "" });
    soloStringhe(parte["choices"]).forEach((scelta, i) => {
      campi.push({ descrizione: `nella risposta ${i + 1} della parte ${numero}`, testo: scelta });
    });
    soloStringhe(parte["distractors"]).forEach((spiegazione, i) => {
      campi.push({
        descrizione: `nella spiegazione della risposta ${i + 1} della parte ${numero}`,
        testo: spiegazione,
      });
    });
  });
  return campi;
}

/** I nomi di variabile dichiarati da `question.variables`: la fonte
 * autorevole per il motore stesso (question.js:621, `Object.values`, mai le
 * chiavi dell'oggetto — vedi il commento su `QuestionVariableJSON.name` in
 * `@savint/engine`), con lo stesso spacchettamento delle assegnazioni
 * multiple (`"a,b"` -> `["a","b"]`) che usa il motore. */
function nomiDichiarati(question: NumbasQuestionJSON): Set<string> {
  const nomi = new Set<string>();
  for (const def of Object.values(question.variables ?? {})) {
    for (const nome of variables.splitVariableNames(def.name ?? "")) {
      nomi.add(nome);
    }
  }
  return nomi;
}

/** Il primo riferimento (via `\var{}` o `\simplify{}`, in un qualunque
 * campo di testo — vedi `campiTesto`) a una variabile non dichiarata, con
 * la descrizione di dove si trova; `undefined` se sono tutti dichiarati.
 * I campi si controllano nell'ordine in cui `campiTesto` li elenca
 * (enunciato, suggerimento, poi parte per parte): non è un ordine
 * arbitrario, è l'ordine in cui il docente li ha scritti nell'editor. */
function primoRiferimentoNonDichiarato(
  question: NumbasQuestionJSON,
): { identificatore: string; descrizione: string } | undefined {
  const dichiarati = nomiDichiarati(question);
  for (const campo of campiTesto(question)) {
    const nome = identificatoriTesto(campo.testo).find((n) => !dichiarati.has(n));
    if (nome !== undefined) {
      return { identificatore: nome, descrizione: campo.descrizione };
    }
  }
  return undefined;
}

/** La risposta di una parte "numerica" (Numbas `numberentry`) è già
 * formattata per la lettura in stile europeo — virgola decimale, es.
 * `"-0,25"` — non un'espressione JME (vedi il commento più sotto sul
 * perché il controllo LaTeX non la tocca). Qui basta verificare che sia
 * davvero un numero finito: il motore non lancia mai su una divisione per
 * zero (produce un valore "infinito" valido, reso come la stringa
 * `"infinity"`/`"-infinity"` — vedi il rapporto del task), e senza questo
 * controllo quella stringa passerebbe come "una risposta c'è". */
function eNumeroFinito(rispostaFormattata: string): boolean {
  return Number.isFinite(Number(rispostaFormattata.replace(",", ".")));
}

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
  // Controllo statico, non per-seme: quali identificatori i testi
  // referenziano via \var{}/\simplify{} non dipende dal seme (solo i
  // VALORI delle variabili dipendono da esso, non i loro nomi) — girarlo
  // venti volte dentro il ciclo sarebbe lavoro ripetuto senza motivo. Lo si
  // fa PRIMA di provare a caricare: un nome sciolto usato da solo dentro
  // \var{} (es. `\var{zeta}`) il motore lo tratta come un simbolo libero e
  // NON lancia (vedi il rapporto del task) — aspettare che lanciasse
  // avrebbe lasciato passare esattamente l'errore di battitura più comune
  // in un esercizio a variabili. Copre ogni campo che finisce sotto gli
  // occhi di uno studente (enunciato, suggerimento, consegne, risposte a
  // scelta multipla e le loro spiegazioni — vedi `campiTesto`), non solo
  // l'enunciato: il suggerimento in particolare è il testo "come si
  // risolve" mostrato dopo una risposta sbagliata, ed è il campo più denso
  // di riferimenti a variabili nel corpus reale. `seme: 0` perché non c'è
  // un seme a cui attribuire un difetto che non dipende da nessun seme.
  const riferimento = primoRiferimentoNonDichiarato(question as NumbasQuestionJSON);
  if (riferimento !== undefined) {
    return {
      ok: false,
      seme: 0,
      fase: "testo",
      messaggio: `la variabile "${riferimento.identificatore}" ${riferimento.descrizione} non è dichiarata`,
    };
  }

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

      // Una parte "numerica" (Numbas `numberentry`) non passa dal
      // controllo LaTeX qui sotto (vedi il perché nel commento su quel
      // controllo), ma non per questo resta senza verifica: la sua
      // risposta deve comunque essere un numero finito vero, non la
      // stringa "infinity" che il motore produce senza lanciare quando la
      // definizione divide per zero.
      if (parte.type === "numberentry" && typeof risposta === "string" && !eNumeroFinito(risposta)) {
        return {
          ok: false,
          seme,
          fase: "risposta",
          messaggio: `la parte "${parte.path}" ha come risposta corretta "${risposta}", che non è un numero finito`,
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
