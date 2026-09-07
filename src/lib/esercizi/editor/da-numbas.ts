import { esercizioEditorSchema } from "./modello";
import type { EsercizioEditor, ParteEditor, Tolleranza, VariabileEditor } from "./modello";
import { hashContenuto, stabile, type EsercizioFile } from "../format/schema";
import { versoNumbas, escapaTesto } from "./verso-numbas";

/** L'esito della lettura: o un editor ricostruito fedelmente, o un rifiuto
 * motivato. Non esiste una terza via "ricostruito parzialmente": è proprio
 * quella che questo modulo deve evitare, perché aprire un esercizio ricco,
 * mostrarne la metà che si capisce e salvarne una versione con l'altra
 * metà cancellata è il danno peggiore descritto nella specifica. */
export type Lettura =
  | { ok: true; editor: EsercizioEditor }
  | {
      ok: false;
      motivo: "tipo_non_supportato" | "costrutti_non_supportati";
      dettaglio: string;
    };

const rifiutaTipo = (dettaglio: string): Lettura => ({ ok: false, motivo: "tipo_non_supportato", dettaglio });
const rifiutaCostrutto = (dettaglio: string): Lettura => ({ ok: false, motivo: "costrutti_non_supportati", dettaglio });

/** Il suggerimento con cui chiude ogni messaggio che riguarda un esercizio
 * altrimenti valido, solo espresso in un modo che l'editor non sa ancora
 * trattare: una via d'uscita concreta, non solo una porta chiusa.
 *
 * **Rinominata da `SUGGERIMENTO_DUPLICA` (Onda finale, I4)**: il pulsante
 * "duplica" che questo testo raccomandava è stato tolto dall'elenco e dalla
 * pagina di modifica (`redazione-elenco-client.tsx`, `[id]/page.tsx`) — la
 * duplicazione copia il contenuto GREZZO dell'ultima versione, quindi per
 * un esercizio non rappresentabile il duplicato ha lo stesso identico
 * contenuto e riceve lo stesso identico rifiuto da questo modulo: "duplica"
 * non porta MAI a una copia modificabile con l'implementazione attuale.
 * Il vecchio testo, lasciato invariato, avrebbe indicato un pulsante che
 * non esiste più nella pagina che il docente ha davanti. */
const SUGGERIMENTO_REPOSITORIO =
  "Può essere modificato solo intervenendo direttamente nel repository dei contenuti.";

// ---- lettura non fidata di JSON arbitrario -----------------------------
// `question` è tipizzato `unknown` nello schema del file (lo valida solo il
// motore al caricamento): qui lo attraversiamo a mano, un campo alla volta,
// rifiutando appena qualcosa non ha la forma attesa invece di indovinare.

function record(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function stringa(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function lista(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}
function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** L'inverso di `escapaTesto` (verso-numbas.ts): disfa gli ordini in ordine
 * opposto a come sono stati fatti. `escapaTesto` scappa prima `&`, poi
 * `<`/`>`, perché altrimenti un `<` del docente diventerebbe `&lt;` e quell'
 * `&` verrebbe scappato di nuovo. Per la stessa ragione al contrario, qui
 * `&lt;`/`&gt;` vanno disfatti PRIMA di `&amp;`: un `&lt;` scritto a mano dal
 * docente come testo letterale (non un vero `<` scappato) diventa `&amp;lt;`
 * in scrittura — disfacendo `&amp;` per primo in lettura, quel testo
 * tornerebbe un `<` vero, che non è mai stato. */
function unescapaTesto(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

/** Il contenuto grezzo di un campo di testo, tolto solo l'involucro
 * `<p>...</p>` quando c'è — né scappato né disfatto, i byte esatti del
 * file. Usata sia da `estraiTesto` per decidere cosa validare, sia dal
 * confronto strutturale più sotto: quest'ultimo deve guardare i byte del
 * file, non un valore ricalcolato dal modello (il difetto scoperto dalla
 * review nella correzione 2: `escapaTesto(valore-già-estratto)` è sempre
 * uguale a se stesso, qualunque cosa contenesse davvero il file). */
function contenutoGrezzo(v: unknown): string | null {
  const s = stringa(v);
  if (s === null) return null;
  return s.startsWith("<p>") && s.endsWith("</p>") && s.length >= "<p></p>".length ? s.slice(3, -4) : s;
}

/** Numbas avvolge testo/prompt/scelte in un unico `<p>...</p>`; l'editor li
 * mostra senza quell'involucro. Un campo è rappresentabile solo se il suo
 * contenuto grezzo è GIÀ nella forma canonica che produrrebbe
 * `escapaTesto`: cioè se disfarlo e riscapparlo torna identico byte per
 * byte. Non è un test euristico ("sembra un tag?"): `x<y` scritto a mano e
 * un `<em>` vero sono indistinguibili guardando solo il carattere `<`, e
 * indovinare in un senso o nell'altro sbaglierebbe da qualche parte che
 * conta (la review lo ha dimostrato costruendo un file con `<em>` vero,
 * accettato e poi distrutto al salvataggio successivo). Un `<em>...</em>`
 * vero e un `<` scritto a mano senza pensare all'HTML falliscono allo
 * stesso identico controllo: il campo è rifiutato in entrambi i casi.
 * È la direzione giusta in cui sbagliare — un file così è ambiguo tanto
 * per questo editor quanto per un browser — e resta modificabile con
 * "duplica" direttamente in Numbas. */
function estraiTesto(v: unknown): string | null {
  const grezzo = contenutoGrezzo(v);
  if (grezzo === null) return null;
  const testo = unescapaTesto(grezzo);
  return escapaTesto(testo) === grezzo ? testo : null;
}

/** Il messaggio, in lingua da docente, per un campo di testo che non ha
 * superato il controllo di `estraiTesto`. Non prova a indovinare se il
 * `<`/`>` incontrato fosse una disuguaglianza scritta a mano o una
 * formattazione HTML vera: sono indistinguibili, e il messaggio lo dice
 * onestamente invece di far finta di saperlo. Il nome tecnico del campo
 * resta fra parentesi, in fondo, per chi deve incrociarlo col file. */
function messaggioTestoAmbiguo(soggetto: string, campoTecnico: string): string {
  return (
    `${soggetto} potrebbe contenere un simbolo di disuguaglianza scritto a mano (come "<" o ">"), oppure una ` +
    `formattazione HTML vera (corsivo, un link, ...): l'editor non riesce a distinguerli in sicurezza, e in ` +
    `entrambi i casi salvare di nuovo lo cambierebbe. ${SUGGERIMENTO_REPOSITORIO} (${campoTecnico})`
  );
}

// ---- l'intervallo minValue/maxValue ------------------------------------

/** Toglie una coppia di parentesi che avvolge l'INTERA stringa: è l'unico
 * caso che conta qui, quello aggiunto meccanicamente da `versoNumbas`
 * attorno a valore e margine. Una stringa come "(c-b)/a", dove la
 * parentesi iniziale si richiude prima della fine, non viene toccata: fa
 * parte del valore, non è un involucro. */
function togliParentesiEsterne(s: string): string {
  if (s.length < 2 || s[0] !== "(" || s[s.length - 1] !== ")") return s;
  let profondita = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") profondita++;
    else if (s[i] === ")") {
      profondita--;
      if (profondita === 0) return i === s.length - 1 ? s.slice(1, -1) : s;
    }
  }
  return s;
}

function prefissoComune(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}
function suffissoComune(a: string, b: string, max: number): number {
  const n = Math.min(a.length, b.length, max);
  let i = 0;
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/** minValue/maxValue diversi sono rappresentabili solo nella forma
 * `(valore) - (margine)` / `(valore) + (margine)` scritta da `versoNumbas`
 * — o, come nel corpus reale, senza le parentesi attorno a valore e
 * margine (`e^k - 0.05` / `e^k + 0.05`) — con valore e margine IDENTICI fra
 * i due estremi. Il confronto è per prefisso/suffisso comune fra le due
 * stringhe, non per una posizione fissa delle parentesi o uno split su
 * " - (": così un valore che contiene già delle parentesi (`(c-b)/a`) o un
 * `-` al suo interno (`e^k`) non confonde lo split, perché prefisso e
 * suffisso comuni si fermano esattamente al carattere che differisce fra
 * minValue e maxValue, qualunque cosa ci sia prima o dopo.
 *
 * Se minValue e maxValue non differiscono per un singolo carattere `-`/`+`
 * nella stessa posizione (circondato da uno spazio da entrambi i lati),
 * l'intervallo non è ricostruibile: è un esercizio scritto a mano con un
 * intervallo asimmetrico, e reinterpretarlo perderebbe l'intenzione. */
function intervalloAMargine(minValue: string, maxValue: string): { valore: string; margine: string } | null {
  const p = prefissoComune(minValue, maxValue);
  const s = suffissoComune(minValue, maxValue, Math.min(minValue.length, maxValue.length) - p);
  const centroMin = minValue.slice(p, minValue.length - s);
  const centroMax = maxValue.slice(p, maxValue.length - s);
  if (centroMin !== "-" || centroMax !== "+") return null;

  let prefisso = minValue.slice(0, p);
  let suffisso = minValue.slice(minValue.length - s);
  if (!prefisso.endsWith(" ") || !suffisso.startsWith(" ")) return null;
  prefisso = prefisso.slice(0, -1);
  suffisso = suffisso.slice(1);
  if (prefisso.length === 0 || suffisso.length === 0) return null;

  return { valore: togliParentesiEsterne(prefisso), margine: togliParentesiEsterne(suffisso) };
}

/** Un margine (`minValue !== maxValue`) e una precisione in cifre decimali
 * sono due meccanismi distinti in Numbas e possono comparire insieme sulla
 * stessa parte (è il caso del file 07 del corpus: `e^k ± 0.05` corretto a
 * due cifre decimali). Il modello dell'editor rappresenta l'uno o l'altro,
 * non la combinazione: costruire comunque un margine ignorando la
 * precisione cancellerebbe silenziosamente l'arrotondamento richiesto (e
 * con esso il credito parziale che Numbas dà a un valore giusto scritto
 * con precisione sbagliata). Va rifiutata esplicitamente, con un messaggio
 * che dica perché — non lasciata al confronto strutturale generico, che
 * direbbe solo "non torna", non il perché. */
function motivoIntervalloEsplicito(p: Record<string, unknown>): string | null {
  const min = stringa(p.minValue);
  const max = stringa(p.maxValue);
  if (min !== null && max !== null && min !== max && (p.precision !== undefined || p.precisionType !== undefined)) {
    return (
      "la risposta accetta sia un margine di tolleranza sia un arrotondamento a un certo numero di cifre " +
      `decimali insieme: l'editor sa rappresentare l'uno o l'altro, non insieme. ${SUGGERIMENTO_REPOSITORIO} ` +
      "(precision + minValue/maxValue)"
    );
  }
  return null;
}

/** La coppia minValue/maxValue tradotta in valore + tolleranza: uguali e
 * senza precision -> esatta; uguali con precision -> decimali (solo se
 * espressa in cifre decimali, `precisionType: "dp"`: altre forme di
 * precisione non sono rappresentabili); diversi nella forma a margine ->
 * margine. Ogni altra coppia non è rappresentabile. */
function leggiIntervallo(p: Record<string, unknown>): { valore: string; tolleranza: Tolleranza } | null {
  const min = stringa(p.minValue);
  const max = stringa(p.maxValue);
  if (min === null || max === null) return null;

  if (min === max) {
    if (p.precision === undefined || p.precision === null) {
      return { valore: min, tolleranza: { tipo: "esatta" } };
    }
    if (p.precisionType !== "dp") return null;
    const cifreTesto = stringa(p.precision);
    if (cifreTesto === null || !/^\d+$/.test(cifreTesto)) return null;
    const cifre = Number(cifreTesto);
    if (cifre < 0 || cifre > 6) return null;
    return { valore: min, tolleranza: { tipo: "decimali", cifre } };
  }

  const margine = intervalloAMargine(min, max);
  return margine === null ? null : { valore: margine.valore, tolleranza: { tipo: "margine", margine: margine.margine } };
}

// ---- le parti -----------------------------------------------------------

/** Descrizione in lingua da docente di ciò che una domanda CHIEDE, per ogni
 * tipo di parte Numbas non gestito che il corpus reale ha mostrato — non un
 * codice interno. Un tipo fuori da questa mappa (un tipo Numbas che il
 * corpus non ha mai mostrato) ricade in una descrizione generica. */
const DESCRIZIONE_TIPO_PARTE: Record<string, string> = {
  gapfill: "è divisa in più spazi da riempire dentro lo stesso testo (una domanda composita)",
  m_n_2: "chiede allo studente di scegliere più di una risposta, non una sola",
  m_n_x: "chiede di abbinare ogni voce a una corrispondente, non di scegliere fra risposte proposte",
  patternmatch: "controlla la risposta confrontandola con un modello di testo (un'espressione regolare)",
};

const TIPI_SUPPORTATI = new Set(["numberentry", "1_n_2", "jme"]);

type EsitoParte = { ok: true; parte: ParteEditor } | { ok: false; lettura: Lettura };

function leggiParte(raw: unknown, indice: number): EsitoParte {
  const posizione = `la parte ${indice + 1}`;
  const p = record(raw);
  if (p === null) {
    return { ok: false, lettura: rifiutaCostrutto(`${posizione} non è una domanda riconoscibile.`) };
  }

  const tipoGrezzo = stringa(p.type);
  if (tipoGrezzo === null || !TIPI_SUPPORTATI.has(tipoGrezzo)) {
    const nomeTipo = tipoGrezzo ?? String(p.type);
    const descrizione = DESCRIZIONE_TIPO_PARTE[nomeTipo] ?? "è di un tipo che questo editor non riconosce";
    return {
      ok: false,
      lettura: rifiutaTipo(
        `${posizione} ${descrizione} (tipo "${nomeTipo}"): l'editor gestisce solo domande numeriche, a ` +
          `scelta multipla singola, o con risposta in formula matematica. ${SUGGERIMENTO_REPOSITORIO}`,
      ),
    };
  }
  const tipo = tipoGrezzo;
  // Ridondante per il corpus attuale (solo "gapfill" ha "gaps", ed è già
  // scartato dal controllo sul tipo), ma la specifica lo elenca come
  // criterio a sé: una parte composita non va rappresentata neppure se un
  // giorno un tipo riconosciuto acquisisse un campo "gaps".
  if ("gaps" in p) {
    return {
      ok: false,
      lettura: rifiutaCostrutto(
        `${posizione} è divisa in più spazi da riempire dentro lo stesso testo (gaps), non rappresentabile.`,
      ),
    };
  }

  const consegna = estraiTesto(p.prompt);
  if (consegna === null) {
    return { ok: false, lettura: rifiutaCostrutto(messaggioTestoAmbiguo(`la consegna della ${posizione}`, "prompt")) };
  }

  if (tipo === "numberentry") {
    const punti = numero(p.marks);
    if (punti === null) {
      return { ok: false, lettura: rifiutaCostrutto(`${posizione} non ha un punteggio valido (marks).`) };
    }
    const motivoEsplicito = motivoIntervalloEsplicito(p);
    if (motivoEsplicito !== null) {
      return { ok: false, lettura: rifiutaCostrutto(`${posizione}: ${motivoEsplicito}.`) };
    }
    const intervallo = leggiIntervallo(p);
    if (intervallo === null) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(
          `${posizione}: l'intervallo di risposte accettate non è in una forma che l'editor sa interpretare ` +
            "(un valore esatto, un margine di tolleranza, o un arrotondamento a un certo numero di cifre " +
            "decimali) — potrebbe essere un intervallo scritto a mano in modo asimmetrico. " +
            `${SUGGERIMENTO_REPOSITORIO} (minValue/maxValue)`,
        ),
      };
    }
    return {
      ok: true,
      parte: { tipo: "numerica", consegna, punti, valore: intervallo.valore, tolleranza: intervallo.tolleranza },
    };
  }

  if (tipo === "jme") {
    const punti = numero(p.marks);
    if (punti === null) {
      return { ok: false, lettura: rifiutaCostrutto(`${posizione} non ha un punteggio valido (marks).`) };
    }
    const risposta = stringa(p.answer);
    if (risposta === null || risposta.length === 0) {
      return { ok: false, lettura: rifiutaCostrutto(`${posizione} non ha una risposta valida (answer).`) };
    }
    // checkVariableNames/expectedVariableNames controllano che lo studente
    // usi solo certi nomi di variabile nella propria risposta; valuegenerators
    // genera valori di anteprima per quei nomi. Il modello dell'editor non
    // rappresenta nessuno dei due: costruire comunque la parte spegnerebbe
    // silenziosamente quel controllo (uno studente che scrive "2*y" invece
    // di "2*x" smetterebbe di essere segnalato). Va rifiutata esplicitamente.
    const controllaNomi = p.checkVariableNames === true;
    const nomiAttesi = (lista(p.expectedVariableNames)?.length ?? 0) > 0;
    const generatori = (lista(p.valuegenerators)?.length ?? 0) > 0;
    if (controllaNomi || nomiAttesi || generatori) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(
          `${posizione} controlla quali lettere (nomi di variabile) lo studente usa nella propria risposta, o ` +
            `genera valori di anteprima per la formula: non ancora supportato dall'editor. ${SUGGERIMENTO_REPOSITORIO} ` +
            "(checkVariableNames/expectedVariableNames/valuegenerators)",
        ),
      };
    }
    return { ok: true, parte: { tipo: "espressione", consegna, punti, risposta } };
  }

  // tipo === "1_n_2": i punti stanno nella matrice di marcatura, non in
  // "marks" (che vale sempre 0 per convenzione, vedi verso-numbas.ts).
  const scelteGrezze = lista(p.choices);
  const matriceGrezza = lista(p.matrix);
  if (scelteGrezze === null || matriceGrezza === null || scelteGrezze.length !== matriceGrezza.length) {
    return {
      ok: false,
      lettura: rifiutaCostrutto(
        `${posizione}: le risposte proposte e i punteggi assegnati a ciascuna non corrispondono in numero ` +
          "(choices/matrix).",
      ),
    };
  }

  const risposte: string[] = [];
  for (const scelta of scelteGrezze) {
    const r = estraiTesto(scelta);
    if (r === null) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(messaggioTestoAmbiguo(`una delle risposte proposte nella ${posizione}`, "choices")),
      };
    }
    risposte.push(r);
  }

  let indiceGiusta = -1;
  let punti = 0;
  for (let i = 0; i < matriceGrezza.length; i++) {
    const voce = matriceGrezza[i];
    const valore = typeof voce === "number" ? voce : typeof voce === "string" ? Number(voce) : NaN;
    if (!Number.isFinite(valore)) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(`${posizione}: il punteggio assegnato a una risposta non è un numero (matrix).`),
      };
    }
    if (valore !== 0) {
      if (indiceGiusta !== -1) {
        return {
          ok: false,
          lettura: rifiutaCostrutto(
            `${posizione}: più di una risposta ha un punteggio diverso da zero — l'editor gestisce solo una ` +
              "scelta multipla con un'unica risposta corretta (matrix).",
          ),
        };
      }
      indiceGiusta = i;
      punti = valore;
    }
  }
  if (indiceGiusta === -1) {
    return {
      ok: false,
      lettura: rifiutaCostrutto(
        `${posizione}: nessuna risposta ha un punteggio diverso da zero, quindi non è chiaro quale sia quella ` +
          "corretta (matrix).",
      ),
    };
  }

  // distractors: il commento che lo studente legge dopo una risposta
  // sbagliata (una spiegazione del perché è sbagliata). Assente in giro 1:
  // silenziosamente scartato da versoNumbas, che scriveva sempre stringhe
  // vuote. Letto quando presente, non solo per completezza: senza, il
  // confronto strutturale rifiuterebbe qualunque file che lo usa davvero
  // (il file 02 del corpus, per esempio).
  let spiegazioni: string[] | undefined;
  if (p.distractors !== undefined) {
    const distractorsGrezzi = lista(p.distractors);
    if (distractorsGrezzi === null || distractorsGrezzi.length !== risposte.length) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(
          `${posizione}: le spiegazioni delle risposte sbagliate non corrispondono in numero alle risposte ` +
            "stesse (distractors).",
        ),
      };
    }
    const spiegazioniEstratte: string[] = [];
    for (const d of distractorsGrezzi) {
      const s = estraiTesto(d);
      if (s === null) {
        return {
          ok: false,
          lettura: rifiutaCostrutto(
            messaggioTestoAmbiguo(`la spiegazione di una risposta sbagliata nella ${posizione}`, "distractors"),
          ),
        };
      }
      spiegazioniEstratte.push(s);
    }
    // Nessuna spiegazione scritta per nessuna risposta è indistinguibile,
    // per un docente, dal campo mai toccato: `versoNumbas` scrive comunque
    // stringhe vuote (Numbas vuole l'array), quindi senza questo collasso
    // un esercizio salvato senza spiegazioni e poi riaperto acquisirebbe un
    // `spiegazioni: ["", ...]` che l'originale non aveva mai avuto.
    spiegazioni = spiegazioniEstratte.some((s) => s !== "") ? spiegazioniEstratte : undefined;
  }

  return { ok: true, parte: { tipo: "scelta", consegna, punti, risposte, indiceGiusta, spiegazioni } };
}

// ---- il confronto strutturale ------------------------------------------
// Il controllo che decide davvero se un esercizio è rappresentabile: non
// "ho letto ogni campo che mi aspettavo", ma "rigenerare il file da quello
// che ho letto riproduce esattamente l'originale". I controlli sopra
// spiegano i casi anticipati con un messaggio leggibile da un docente;
// questo intercetta tutto il resto — un campo che nessuno aveva pensato di
// controllare — confrontando le stesse serializzazioni stabili di
// hashContenuto (format/schema.ts), non una seconda nozione di uguaglianza.

/** Ricostruisce, a partire dal JSON grezzo di una parte, la stessa parte con
 * le sole equivalenze già usate in lettura risolte a favore della forma
 * canonica che `versoNumbas` scrive: prompt/scelte/distractors riavvolti in
 * `<p>...</p>` (dove previsto) attorno al CONTENUTO GREZZO del file
 * (`contenutoGrezzo`, gli stessi byte, non un valore ricalcolato dal
 * modello — il difetto scoperto dalla review nella correzione 2, dove
 * `escapaTesto(valore-già-estratto)` era sempre uguale a se stesso qualunque
 * cosa contenesse davvero il file); voci della matrice come stringa.
 *
 * `minValue`/`maxValue` di una parte a margine NON vengono qui ricalcolati
 * dal modello (`estratta.valore`/`estratta.tolleranza.margine`): restano i
 * byte grezzi già presenti in `raw` tramite `{...raw}` sopra. È la STESSA
 * correzione applicata ai campi di testo, un round in più (Onda di
 * correzioni finale, C3): la review ha dimostrato che ricostruire
 * `(${estratta.valore}) - (${estratta.tolleranza.margine})` qui era un
 * confronto tautologico X === X, perché `versoNumbas` (chiamato sotto per
 * produrre `rigenerato`) scrive ESATTAMENTE la stessa formula dagli STESSI
 * dati — non poteva mai fallire, qualunque cosa avesse spezzato
 * `intervalloAMargine` (che spezza per prefisso/suffisso comune, ignorando
 * la profondità delle parentesi: un margine scritto dentro una chiamata,
 * `exp(k - 0.05)`, viene spezzato in `valore="exp(k"` e
 * `margine="0.05)"` — sintatticamente plausibile, semanticamente un
 * intervallo diverso). Confrontando invece i byte grezzi contro il
 * rigenerato dal modello, l'unica forma accettata è quella già
 * byte-per-byte identica a quella che `versoNumbas` produce — la stessa
 * garanzia "canonica o rifiutata" di `estraiTesto` per il testo, non una
 * riscrittura più permissiva che perdona parentesi mancanti. Non si
 * introduce uno spezzatore più furbo (consapevole delle parentesi): la
 * lezione di tre giri di correzioni è che qualunque cosa ricostruita dal
 * modello non può essere il termine di paragone. */
function normalizzaParte(raw: Record<string, unknown>, estratta: ParteEditor): Record<string, unknown> {
  const normalizzato: Record<string, unknown> = { ...raw, prompt: `<p>${contenutoGrezzo(raw.prompt) ?? ""}</p>` };
  if (estratta.tipo === "scelta") {
    const scelteGrezze = lista(raw.choices) ?? [];
    normalizzato.choices = scelteGrezze.map((c) => `<p>${contenutoGrezzo(c) ?? ""}</p>`);
    normalizzato.matrix = estratta.risposte.map((_, i) => (i === estratta.indiceGiusta ? String(estratta.punti) : "0"));
    if ("distractors" in raw) {
      const distractorsGrezzi = lista(raw.distractors) ?? [];
      normalizzato.distractors = distractorsGrezzi.map((d) => contenutoGrezzo(d) ?? "");
    }
  }
  return normalizzato;
}

/** Le prime differenze fra due valori, come dettaglio tecnico secondario di
 * un messaggio che deve comunque poter guidare un'azione: percorsi JSON
 * grezzi, utili per chi confronta il file, ma mai la SOSTANZA del
 * messaggio (vedi il chiamante). Riusa `stabile` — la stessa
 * serializzazione di hashContenuto — per decidere l'uguaglianza a ogni
 * nodo. */
function primeDifferenze(a: unknown, b: unknown, percorso: string, out: string[], limite: number): void {
  if (out.length >= limite || stabile(a) === stabile(b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    const lunghezza = Math.max(a.length, b.length);
    for (let i = 0; i < lunghezza && out.length < limite; i++) {
      primeDifferenze(a[i], b[i], `${percorso}[${i}]`, out, limite);
    }
    return;
  }
  const aRec = record(a);
  const bRec = record(b);
  if (aRec !== null && bRec !== null) {
    for (const k of new Set([...Object.keys(aRec), ...Object.keys(bRec)])) {
      if (out.length >= limite) return;
      primeDifferenze(aRec[k], bRec[k], `${percorso}.${k}`, out, limite);
    }
    return;
  }
  out.push(`${percorso}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
}

// ---- l'esercizio intero ---------------------------------------------

export function daNumbas(file: EsercizioFile): Lettura {
  const q = record(file.question);
  if (q === null) {
    return rifiutaCostrutto("il file non ha la struttura di un esercizio Numbas riconoscibile.");
  }

  const funzioni = record(q.functions) ?? {};
  if (Object.keys(funzioni).length > 0) {
    return rifiutaCostrutto(
      `questo esercizio usa funzioni scritte apposta per lui, in codice Numbas (functions: ` +
        `${Object.keys(funzioni).join(", ")}): l'editor non sa mostrarle, e salvarlo di nuovo le cancellerebbe. ` +
        SUGGERIMENTO_REPOSITORIO,
    );
  }

  const gruppi = lista(q.variable_groups) ?? [];
  if (gruppi.length > 0) {
    return rifiutaCostrutto(
      `questo esercizio raggruppa le variabili in gruppi (variable_groups): l'editor non gestisce i gruppi. ` +
        SUGGERIMENTO_REPOSITORIO,
    );
  }

  // Le domande vengono controllate prima del testo generale (statement,
  // advice, descrizioni delle variabili): un tipo di domanda non
  // supportato o un costrutto Numbas mancante nel modello sono il motivo
  // più diretto da comunicare, e non dipendono da come è scritto il resto
  // dell'esercizio.
  const partiGrezze = lista(q.parts);
  if (partiGrezze === null || partiGrezze.length === 0) {
    return rifiutaCostrutto("l'esercizio non ha nessuna domanda al suo interno (parts).");
  }
  const parti: ParteEditor[] = [];
  for (let i = 0; i < partiGrezze.length; i++) {
    const esito = leggiParte(partiGrezze[i], i);
    if (!esito.ok) return esito.lettura;
    parti.push(esito.parte);
  }

  // L'ordine delle variabili vive in ungrouped_variables quando presente
  // (è un array ordinato, la fonte d'ordine dell'autore): l'ordine delle
  // chiavi di un oggetto JS non è garanzia sufficiente in generale, anche
  // se qui coincide perché V8 preserva l'ordine di apparizione delle
  // chiavi stringa. Quando ungrouped_variables manca (come nel corpus,
  // tranne il file 01), l'ordine delle chiavi è l'unica fonte disponibile.
  const variabiliGrezze = record(q.variables) ?? {};
  const chiavi = Object.keys(variabiliGrezze);
  const ordineGrezzo = lista(q.ungrouped_variables);
  let ordine: string[];
  if (ordineGrezzo !== null) {
    const tutteStringhe = ordineGrezzo.every((v): v is string => typeof v === "string");
    const dichiarate = tutteStringhe ? (ordineGrezzo as string[]) : [];
    const corrisponde =
      tutteStringhe &&
      dichiarate.length === chiavi.length &&
      new Set(dichiarate).size === chiavi.length &&
      dichiarate.every((n) => chiavi.includes(n));
    if (!corrisponde) {
      return rifiutaCostrutto(
        "l'ordine con cui sono elencate le variabili non è ricostruibile in modo sicuro: potrebbe non " +
          "corrispondere a quello con cui il docente le ha scritte (ungrouped_variables).",
      );
    }
    ordine = dichiarate;
  } else {
    ordine = chiavi;
  }

  const variabili: VariabileEditor[] = [];
  for (const nome of ordine) {
    const v = record(variabiliGrezze[nome]);
    const definizione = v ? stringa(v.definition) : null;
    if (v === null || definizione === null) {
      return rifiutaCostrutto(`la variabile "${nome}" non ha una definizione valida (definition).`);
    }
    const descrizione = estraiTesto(v.description ?? "");
    if (descrizione === null) {
      return rifiutaCostrutto(messaggioTestoAmbiguo(`la descrizione della variabile "${nome}"`, "description"));
    }
    variabili.push({ nome, definizione, descrizione });
  }

  const testoEsercizio = estraiTesto(q.statement ?? "");
  if (testoEsercizio === null) {
    return rifiutaCostrutto(messaggioTestoAmbiguo("il testo dell'esercizio", "statement"));
  }

  let suggerimento = "";
  if (q.advice) {
    const s = estraiTesto(q.advice);
    if (s === null) {
      return rifiutaCostrutto(messaggioTestoAmbiguo("il suggerimento mostrato dopo un tentativo", "advice"));
    }
    suggerimento = s;
  }

  const variablesTest = record(q.variablesTest);
  const condizione = (variablesTest ? stringa(variablesTest.condition) : null) ?? "";

  const savint = file.savint;
  const editor: EsercizioEditor = {
    meta: {
      titolo: savint.title,
      descrizione: savint.description ?? "",
      anno: savint.yearLevel,
      argomento: savint.topic,
      tag: savint.tags,
      difficolta: savint.difficulty,
    },
    testo: testoEsercizio,
    suggerimento,
    variabili,
    condizione,
    parti,
  };

  // Rete di sicurezza finale: qualunque invariante dell'editor non già
  // controllato sopra (identificatori di variabile, lunghezza delle
  // risposte, indiceGiusta in intervallo, ...) fa comunque rifiutare
  // invece di produrre un editor che poi la form non accetterebbe.
  const validato = esercizioEditorSchema.safeParse(editor);
  if (!validato.success) {
    return rifiutaCostrutto(
      `questo esercizio non rispetta un vincolo dell'editor: ${validato.error.issues.map((iss) => iss.message).join("; ")}`,
    );
  }

  // Il controllo strutturale: rigenerare il file dall'editor appena
  // ricostruito deve riprodurre l'originale, a meno delle equivalenze già
  // usate in lettura (un campo dell'involucro assente rispetto al valore
  // vuoto che Numbas stesso usa quando manca — verificato in
  // packages/engine/src/question/load.ts, non assunto — un testo avvolto o
  // no in `<p>`, una voce di matrice numero invece che stringa, un margine
  // scritto senza le parentesi che `versoNumbas` aggiunge sempre). I campi
  // di testo usano `contenutoGrezzo`, cioè i byte del file com'erano: non
  // `escapaTesto(il-valore-già-estratto)`, che sarebbe sempre uguale a se
  // stesso qualunque cosa contenesse il file — il confronto tautologico che
  // la review ha dimostrato nella correzione 2. La fedeltà di quei campi è
  // già garantita altrove, da `estraiTesto` (che rifiuta se il contenuto
  // grezzo non è già nella forma canonica), non da questa normalizzazione.
  const variabiliNormalizzate = Object.fromEntries(
    ordine.map((nome) => {
      const rec = record(variabiliGrezze[nome]) ?? {};
      return [nome, { ...rec, description: contenutoGrezzo(rec.description) ?? "" }];
    }),
  );
  const originaleNormalizzato: Record<string, unknown> = {
    ...q,
    functions: funzioni,
    variable_groups: gruppi,
    rulesets: record(q.rulesets) ?? {},
    variablesTest: variablesTest ?? { condition: condizione, maxRuns: 10 },
    ungrouped_variables: ordine,
    variables: variabiliNormalizzate,
    statement: `<p>${contenutoGrezzo(q.statement) ?? ""}</p>`,
    advice: suggerimento ? `<p>${contenutoGrezzo(q.advice) ?? ""}</p>` : "",
    parts: partiGrezze.map((raw, i) => normalizzaParte(record(raw) ?? {}, parti[i])),
  };
  const rigenerato = versoNumbas(validato.data);

  if (hashContenuto(originaleNormalizzato) !== hashContenuto(rigenerato)) {
    const differenze: string[] = [];
    primeDifferenze(originaleNormalizzato, rigenerato, "$", differenze, 5);
    return rifiutaCostrutto(
      "questo esercizio ha un dettaglio che l'editor non sa ancora rappresentare fedelmente: salvarlo di nuovo " +
        `lo cambierebbe. ${SUGGERIMENTO_REPOSITORIO} (dettaglio tecnico: ${differenze.join("; ")})`,
    );
  }

  return { ok: true, editor: validato.data };
}
