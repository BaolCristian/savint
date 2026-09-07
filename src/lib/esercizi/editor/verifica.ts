import {
  errorMessageIn,
  jme,
  loadQuestion,
  math,
  parts,
  renderLatex,
  variables,
  type NumbasQuestionJSON,
  type Question,
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

/** Il controllo statico completo sui campi di testo grezzi (vedi
 * `campiTesto`): o un riferimento (via `\var{}`/`\simplify{}`) a una
 * variabile non dichiarata, o un comando LaTeX che `texsplit` non riesce a
 * spezzare (vedi sotto) — entrambi difetti dell'esercizio, riportati allo
 * stesso modo, in fase "testo", nominando il campo. Restituisce l'esito da
 * riportare, o `undefined` se tutti i campi sono a posto. I campi si
 * controllano nell'ordine in cui `campiTesto` li elenca (enunciato,
 * suggerimento, poi parte per parte): non è un ordine arbitrario, è
 * l'ordine in cui il docente li ha scritti nell'editor. */
function erroreTestoStatico(question: NumbasQuestionJSON): EsitoVerifica | undefined {
  const dichiarati = nomiDichiarati(question);
  for (const campo of campiTesto(question)) {
    let identificatori: string[];
    try {
      identificatori = identificatoriTesto(campo.testo);
    } catch (e) {
      // `texsplit` (il motore) riconosce SOLO il prefisso letterale
      // "\var" (jme.js:443-494 upstream, non un difetto del port): un
      // comando LaTeX che comincia con quelle quattro lettere e non è
      // seguito da `{` — `\varphi`, `\vartheta`, `\varepsilon`, le
      // varianti greche che un esercizio di trigonometria usa — fa
      // fallire la ricerca dell'argomento invece di essere riconosciuto
      // come "non è \var". `loadQuestion` incontrerebbe lo STESSO errore
      // più avanti (fase caricamento: verificato che il messaggio è
      // identico) — qui, siccome il controllo statico gira PRIMA del
      // ciclo sui semi, va intercettato con lo stesso trattamento
      // educato: un esito da riportare, non un'eccezione che scappa da
      // `verificaSuSemi`. Limite noto del motore (upstream), non
      // corretto qui — vedi il rapporto del task.
      return { ok: false, seme: 0, fase: "testo", messaggio: `${campo.descrizione}: ${errorMessageIn(e, "it")}` };
    }
    const nome = identificatori.find((n) => !dichiarati.has(n));
    if (nome !== undefined) {
      return {
        ok: false,
        seme: 0,
        fase: "testo",
        messaggio: `la variabile "${nome}" ${campo.descrizione} non è dichiarata`,
      };
    }
  }
  return undefined;
}

/** Ogni campo di testo GIÀ sostituito che `loadQuestion` produce e che
 * finisce sotto gli occhi di uno studente: l'enunciato, il suggerimento, e
 * la consegna sostituita di ogni parte (`promptHtml`, riempito da
 * `substitutePartPrompts` nel costruttore di `Question`). Le risposte a
 * scelta multipla e le loro spiegazioni NON compaiono qui: il motore non
 * le sostituisce affatto al caricamento (restano il testo grezzo che
 * l'autore ha scritto), quindi il controllo su queste — e su ogni altro
 * campo — resta quello statico sopra, che le guarda grezze. */
function testiSostituiti(caricata: Question): CampoTesto[] {
  return [
    { descrizione: "il testo dell'esercizio", testo: caricata.statementHtml },
    { descrizione: "il suggerimento", testo: caricata.adviceHtml },
    ...caricata.allParts().map((parte) => ({
      descrizione: `la consegna della parte ${parte.index + 1}`,
      testo: parte.promptHtml,
    })),
  ];
}

/** Un valore JME "spacchettato" (`jme.unwrapValue` dichiara `unknown`: è
 * la funzione di basso livello, senza il contratto di forma che porta il
 * tipo pubblico `JMEValue`) come numero JS finito? `number`/`bigint` sono
 * già numerici; un razionale (`math.Fraction`, che `unwrapValue`
 * restituisce per un token di tipo "rational") si converte con lo stesso
 * metodo — una divisione reale fra numeratore e denominatore — che
 * distingue un numero vero da un "numero" con denominatore zero, la
 * stessa cosa che `number-entry-part.ts` verifica con
 * `ComplexDecimal#isFinite` per decidere se un estremo è utilizzabile.
 * Non serve gestire un numero complesso qui: una risposta il cui estremo
 * valuta a un complesso fa già fallire `correctAnswer()` (i numeri
 * complessi non si possono ordinare — vedi il rapporto del task) prima di
 * arrivare a questo controllo. */
function comeNumeroFinito(valore: unknown): boolean {
  if (typeof valore === "number") {
    return Number.isFinite(valore);
  }
  if (typeof valore === "bigint") {
    return true;
  }
  if (valore instanceof math.Fraction) {
    return Number.isFinite(valore.toFloat());
  }
  return false;
}

/** Gli estremi (`minValue`/`maxValue`) di una parte "numerica" (Numbas
 * `numberentry`), valutati nello SCOPE CARICATO di questo seme — non la
 * stringa che `correctAnswer()` restituisce per la lettura. Quella
 * stringa è un artefatto di presentazione: `niceNumber` rende un multiplo
 * ESATTO di pi greco in forma simbolica ("4*pi", l'area di un cerchio di
 * raggio 2) quando la precisione non è impostata — cosa che sia la
 * tolleranza esatta sia quella a margine lasciano — e un'espressione
 * simbolica valida non è un esercizio rotto. Gli estremi sono invece ciò
 * che DECIDE se la risposta di uno studente è giusta: sono loro a dover
 * essere numeri finiti, non il modo in cui vengono mostrati.
 *
 * Correla `parte` alla sua definizione grezza in `question.parts` tramite
 * `.index`, che vale solo per una parte di PRIMO livello (nessun gap):
 * per una parte-gap `.index` è la posizione fra i gap del genitore, un
 * indice diverso che punterebbe alla parte SBAGLIATA di `question.parts`.
 * Questo editor non produce mai parti gapfill; per un JSON scritto a mano
 * che ne avesse, qui ci si limita a non applicare il controllo (`true`,
 * "non trovato rotto") invece di rischiare una correlazione sbagliata. */
function estremiFiniti(question: NumbasQuestionJSON, parte: parts.PartBase, scope: jme.Scope): boolean {
  if (parte.path !== `p${parte.index}`) {
    return true;
  }
  const definizione = (question.parts ?? [])[parte.index] as Record<string, unknown> | undefined;
  if (!definizione) {
    return true;
  }
  for (const campo of ["minValue", "maxValue"]) {
    const espressione = definizione[campo];
    if (typeof espressione !== "string") {
      continue;
    }
    const token = scope.evaluate(espressione);
    if (token === null || !comeNumeroFinito(jme.unwrapValue(token))) {
      return false;
    }
  }
  return true;
}

/** Il numero, di un'impostazione della parte (`parte.settings`, campi
 * come `vsetRangeStart`), o il valore predefinito se manca o non è un
 * numero. `settings` è tipizzato largo (`BasePartSettings &
 * Record<string, unknown>`, perché i campi specifici del tipo — questi
 * compresi — vivono nell'indice generico), quindi va controllato a
 * runtime invece che assunto — stessa cautela di `soloStringhe`. */
function numeroImpostazione(settings: Record<string, unknown>, chiave: string, difetto: number): number {
  const valore = settings[chiave];
  return typeof valore === "number" ? valore : difetto;
}

/** Le variabili libere di un'espressione JME che NON sono variabili della
 * domanda — cioè non compaiono, con un valore, in `caricata.variables`.
 * Sono le variabili DELLO STUDENTE: una parte "espressione" (Numbas
 * `jme`) può lasciarne apposta indeterminate nella risposta corretta —
 * l'esercizio 06 del corpus reale, la derivata di `a*x^n`, ha risposta
 * `{a}*{n}*x^({n-1})`: dopo che `correctAnswer()` sostituisce `{a}`/`{n}`
 * con i loro valori resta `x`, libera e non vincolata, la variabile su
 * cui lo studente risponde — non un difetto dell'esercizio.
 *
 * `jme.findvars` (il motore) non sa distinguerle da sola: è un'analisi
 * puramente SINTATTICA dell'albero, e non consulta le variabili della
 * domanda per risolvere un nome — anche un nome come "a", scritto
 * direttamente in un'espressione come "1/a" invece che sostituito con
 * `{a}`, risulta "libero" per `findvars` pur essendo vincolato nello
 * scope caricato. Il filtro qui è quel che manca: un nome libero secondo
 * `findvars` MA presente in `caricata.variables` è una variabile della
 * domanda usata direttamente nell'espressione, non dello studente. */
function variabiliDelloStudente(albero: jme.Tree, caricata: Question): string[] {
  return jme.findvars(albero, [], caricata.scope).filter((nome) => !(nome in caricata.variables));
}

/** La risposta di una parte "espressione" (Numbas `jme`) valuta a un
 * numero finito? `correctAnswer()` restituisce un'espressione JME NON
 * valutata (per una parte con variabili libere, non potrebbe esserlo: non
 * ha un unico valore) — "1/a" con `a` variabile della domanda resta la
 * stringa "1/a", non il numero che ne risulterebbe. Va quindi valutata
 * qui, non solo letta.
 *
 * Se non ci sono variabili libere dello studente, si valuta l'albero
 * direttamente nello SCOPE CARICATO: le variabili della domanda (`a` in
 * "1/a") si risolvono da sole, ed è esattamente il caso — divisione per
 * zero quando `a` vale 0 — che il controllo cattura.
 *
 * Se ce ne sono (la "x" dell'esercizio 06), si campiona: le STESSE
 * primitive che il motore usa per confrontare risposta dello studente e
 * risposta corretta a tempo di correzione (`jme.compare`,
 * `jme/compare.ts`) — `jme.randoms` pesca valori casuali per le variabili
 * libere nell'intervallo `vsetRange`/`vsetRangePoints` DELLA PARTE (letti
 * da `parte.settings`, non da un default fisso: un docente potrebbe
 * averli cambiati), e si valuta l'albero in uno scope esteso con quei
 * valori — non un campionamento riscritto da zero, lo stesso approccio di
 * `compare()`, applicato a UNA sola espressione invece di confrontarne
 * due. Un confronto contro se stessa non basterebbe: le funzioni di
 * confronto del motore trattano un estremo infinito come un valore
 * legittimo da eguagliare (`r1 === Infinity: return r1 === r2`), non da
 * rifiutare — `compare(albero, albero, ...)` darebbe "uguale" anche se
 * ogni valutazione fosse infinita.
 *
 * Si fallisce se ANCHE UN SOLO campione non è finito (o lancia): è lo
 * stesso comportamento di `compare()`, che avvolge l'intero ciclo di
 * campionamento in un unico `try` — un solo punto che lancia rompe l'INTERO
 * confronto, non solo quel punto, quindi la risposta corretta risulterebbe
 * non correggibile per uno studente che scrivesse la stessa identica
 * espressione. Non è un rischio di falso rifiuto per una risposta con
 * variabili libere genuine: `vsetRange` pesca valori continui, e
 * un'espressione come `a*n*x^(n-1)` non ha singolarità da colpire. */
function rispostaJmeFinita(rispostaTesto: string, caricata: Question, parte: parts.PartBase): boolean {
  let albero: jme.Tree | null;
  try {
    albero = jme.compile(rispostaTesto);
  } catch {
    // sintassi già verificata da correctAnswer(): non dovrebbe succedere,
    // ma se succede non è un problema di finitezza, se ne occupa un altro
    // controllo (o il caricamento vero, la prossima volta).
    return true;
  }
  if (!albero) {
    return true;
  }

  const liberi = variabiliDelloStudente(albero, caricata);
  if (liberi.length === 0) {
    const token = caricata.scope.evaluate(albero);
    return token !== null && comeNumeroFinito(jme.unwrapValue(token));
  }

  const settings = parte.settings as Record<string, unknown>;
  const inizio = numeroImpostazione(settings, "vsetRangeStart", 0);
  const fine = numeroImpostazione(settings, "vsetRangeEnd", 1);
  const punti = numeroImpostazione(settings, "vsetRangePoints", 5);
  const campioni = jme.randoms(liberi, inizio, fine, punti, caricata.scope.rng);
  for (const valori of campioni) {
    const scopeEsteso = new jme.Scope([caricata.scope, { variables: valori }]);
    try {
      const token = scopeEsteso.evaluate(albero);
      if (token === null || !comeNumeroFinito(jme.unwrapValue(token))) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
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
  // Anche un comando LaTeX che condivide il prefisso "\var" (\varphi,
  // \vartheta...) e manda in errore la ricerca dell'argomento viene
  // riportato da qui, come esito e non come eccezione — vedi il commento
  // su `erroreTestoStatico`.
  const erroreStatico = erroreTestoStatico(question as NumbasQuestionJSON);
  if (erroreStatico !== undefined) {
    return erroreStatico;
  }

  for (let seme = 0; seme < quanti; seme++) {
    let caricata;
    try {
      caricata = loadQuestion(question as NumbasQuestionJSON, { seed: String(seme), locale: "it" });
    } catch (e) {
      return { ok: false, seme, fase: "caricamento", messaggio: errorMessageIn(e, "it") };
    }

    // Nessuno dei testi GIÀ sostituiti (enunciato, suggerimento, consegna
    // di ogni parte — vedi `testiSostituiti`) deve lasciare un marcatore
    // `\var{` non risolto o la stringa "undefined": o finirebbe stampato,
    // letteralmente, davanti allo studente. Le risposte a scelta multipla
    // e le loro spiegazioni non compaiono qui apposta: il motore non le
    // sostituisce al caricamento, quindi il controllo statico sopra —
    // che le guarda grezze — è l'unico che le copre.
    for (const campo of testiSostituiti(caricata)) {
      if (campo.testo.includes("\\var{")) {
        return {
          ok: false,
          seme,
          fase: "testo",
          messaggio: `${campo.descrizione} contiene ancora un marcatore \\var{} non risolto`,
        };
      }
      if (campo.testo.includes("undefined")) {
        return {
          ok: false,
          seme,
          fase: "testo",
          messaggio: `${campo.descrizione} contiene la stringa "undefined"`,
        };
      }
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
      // controllo), ma non per questo resta senza verifica: i suoi estremi
      // (minValue/maxValue, ciò che decide DAVVERO se una risposta è
      // giusta — non la stringa che `correctAnswer()` restituisce per la
      // lettura, un artefatto di presentazione, vedi `estremiFiniti`)
      // devono essere numeri finiti veri, non il valore "infinito" che il
      // motore produce senza lanciare quando la definizione divide per
      // zero.
      if (parte.type === "numberentry" && !estremiFiniti(question as NumbasQuestionJSON, parte, caricata.scope)) {
        return {
          ok: false,
          seme,
          fase: "risposta",
          messaggio: `la parte "${parte.path}" ha un estremo (minimo o massimo) non finito`,
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

        // "1/a" con `a` variabile della domanda che vale 0: `correctAnswer()`
        // restituisce la stringa simbolica "1/a" senza valutarla (nessuno
        // dei due controlli sopra scatta: la risposta esiste, e
        // renderLatex("1/a") rende "\frac{1}{a}", validissimo). A tempo di
        // correzione quella parte non è correggibile per questo seme — vedi
        // `rispostaJmeFinita` per come si distingue questo caso da una
        // risposta con variabili libere GENUINE dello studente (l'esercizio
        // 06 del corpus, {a}*{n}*x^({n-1})), che deve restare accettata.
        if (!rispostaJmeFinita(risposta, caricata, parte)) {
          return {
            ok: false,
            seme,
            fase: "risposta",
            messaggio: `la parte "${parte.path}" ha come risposta "${risposta}", che non valuta a un numero finito`,
          };
        }
      }
    }
  }

  return { ok: true };
}
