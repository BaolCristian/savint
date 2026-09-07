import { esercizioEditorSchema } from "./modello";
import type { EsercizioEditor, ParteEditor, Tolleranza, VariabileEditor } from "./modello";
import type { EsercizioFile } from "../format/schema";

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

/** Numbas avvolge testo/prompt/scelte in un unico `<p>...</p>`; l'editor li
 * mostra senza quell'involucro. Un campo è recuperabile solo se non ha
 * marcatori HTML del tutto (come le scelte scritte a mano nel corpus, che
 * non sono avvolte), oppure se è avvolto ESATTAMENTE da quella coppia di
 * tag senza nient'altro dentro: riaprirlo perderebbe qualunque altro
 * marcatore (un secondo `<p>`, un `<br>`, ...). Rifiuta in ogni altro caso. */
function estraiTesto(v: unknown): string | null {
  const s = stringa(v);
  if (s === null) return null;
  if (s.startsWith("<p>") && s.endsWith("</p>") && s.length >= "<p></p>".length) {
    const interno = s.slice(3, -4);
    return interno.includes("<") || interno.includes(">") ? null : interno;
  }
  return s.includes("<") || s.includes(">") ? null : s;
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

const TIPI_SUPPORTATI = new Set(["numberentry", "1_n_2", "jme"]);

type EsitoParte = { ok: true; parte: ParteEditor } | { ok: false; lettura: Lettura };

function leggiParte(raw: unknown, indice: number): EsitoParte {
  const posizione = `la parte ${indice + 1}`;
  const p = record(raw);
  if (p === null) {
    return { ok: false, lettura: rifiutaCostrutto(`${posizione} non è un oggetto riconoscibile.`) };
  }

  const tipo = stringa(p.type);
  if (tipo === null || !TIPI_SUPPORTATI.has(tipo)) {
    return {
      ok: false,
      lettura: rifiutaTipo(
        `${posizione} è di tipo "${String(p.type)}": l'editor gestisce solo numberentry, 1_n_2 e jme.`,
      ),
    };
  }
  // Ridondante per il corpus attuale (solo "gapfill" ha "gaps", ed è già
  // scartato dal controllo sul tipo), ma la specifica lo elenca come
  // criterio a sé: una parte composita non va rappresentata neppure se un
  // giorno un tipo riconosciuto acquisisse un campo "gaps".
  if ("gaps" in p) {
    return {
      ok: false,
      lettura: rifiutaCostrutto(`${posizione} usa gaps (una domanda composita/gapfill): non rappresentabile.`),
    };
  }

  const consegna = estraiTesto(p.prompt);
  if (consegna === null) {
    return {
      ok: false,
      lettura: rifiutaCostrutto(`${posizione}: il prompt contiene marcatori oltre al <p> che lo avvolge.`),
    };
  }

  if (tipo === "numberentry") {
    const punti = numero(p.marks);
    if (punti === null) {
      return { ok: false, lettura: rifiutaCostrutto(`${posizione} non ha un punteggio (marks) numerico valido.`) };
    }
    const intervallo = leggiIntervallo(p);
    if (intervallo === null) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(
          `${posizione}: l'intervallo minValue/maxValue non è né un valore esatto (con eventuale precisione ` +
            `in cifre decimali) né nella forma (valore) - (margine) / (valore) + (margine): impossibile ` +
            `ricostruirlo senza perdere l'intenzione dell'autore.`,
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
      return { ok: false, lettura: rifiutaCostrutto(`${posizione} non ha un punteggio (marks) numerico valido.`) };
    }
    const risposta = stringa(p.answer);
    if (risposta === null || risposta.length === 0) {
      return { ok: false, lettura: rifiutaCostrutto(`${posizione} non ha una risposta (answer) valida.`) };
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
      lettura: rifiutaCostrutto(`${posizione}: choices e matrix mancano o non corrispondono in numero.`),
    };
  }

  const risposte: string[] = [];
  for (const scelta of scelteGrezze) {
    const r = estraiTesto(scelta);
    if (r === null) {
      return {
        ok: false,
        lettura: rifiutaCostrutto(`${posizione}: una risposta contiene marcatori oltre al <p> che la avvolge.`),
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
        lettura: rifiutaCostrutto(`${posizione}: la matrice di marcatura ha una voce non numerica.`),
      };
    }
    if (valore !== 0) {
      if (indiceGiusta !== -1) {
        return {
          ok: false,
          lettura: rifiutaCostrutto(
            `${posizione}: la matrice di marcatura ha più di una risposta con punteggio non nullo.`,
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
      lettura: rifiutaCostrutto(`${posizione}: la matrice di marcatura non indica nessuna risposta corretta.`),
    };
  }

  return { ok: true, parte: { tipo: "scelta", consegna, punti, risposte, indiceGiusta } };
}

// ---- l'esercizio intero ---------------------------------------------

export function daNumbas(file: EsercizioFile): Lettura {
  const q = record(file.question);
  if (q === null) {
    return rifiutaCostrutto("la domanda (question) non è un oggetto riconoscibile.");
  }

  const funzioni = record(q.functions) ?? {};
  if (Object.keys(funzioni).length > 0) {
    return rifiutaCostrutto(
      `l'esercizio definisce funzioni personalizzate (functions: ${Object.keys(funzioni).join(", ")}): ` +
        `l'editor non può rappresentarle, e riaprirlo le cancellerebbe.`,
    );
  }

  const gruppi = lista(q.variable_groups) ?? [];
  if (gruppi.length > 0) {
    return rifiutaCostrutto("l'esercizio raggruppa le variabili (variable_groups), non gestiti dall'editor.");
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
        "ungrouped_variables non contiene esattamente le variabili definite in variables: " +
          "l'ordine con cui l'autore le ha scritte non è ricostruibile.",
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
      return rifiutaCostrutto(`la variabile "${nome}" non ha una definizione valida.`);
    }
    const descrizione = estraiTesto(v.description ?? "");
    if (descrizione === null) {
      return rifiutaCostrutto(`la descrizione della variabile "${nome}" contiene marcatori non gestibili.`);
    }
    variabili.push({ nome, definizione, descrizione });
  }

  const testoEsercizio = estraiTesto(q.statement ?? "");
  if (testoEsercizio === null) {
    return rifiutaCostrutto("il testo dell'esercizio (statement) contiene marcatori oltre al <p> che lo avvolge.");
  }

  let suggerimento = "";
  if (q.advice) {
    const s = estraiTesto(q.advice);
    if (s === null) {
      return rifiutaCostrutto("il suggerimento (advice) contiene marcatori oltre al <p> che lo avvolge.");
    }
    suggerimento = s;
  }

  const variablesTest = record(q.variablesTest);
  const condizione = (variablesTest ? stringa(variablesTest.condition) : null) ?? "";

  const partiGrezze = lista(q.parts);
  if (partiGrezze === null || partiGrezze.length === 0) {
    return rifiutaCostrutto("l'esercizio non ha parti.");
  }
  const parti: ParteEditor[] = [];
  for (let i = 0; i < partiGrezze.length; i++) {
    const esito = leggiParte(partiGrezze[i], i);
    if (!esito.ok) return esito.lettura;
    parti.push(esito.parte);
  }

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
      `il risultato non rispetta i vincoli dell'editor: ${validato.error.issues.map((iss) => iss.message).join("; ")}`,
    );
  }
  return { ok: true, editor: validato.data };
}
