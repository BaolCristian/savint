import { prisma } from "@/lib/db/client";
import { Prisma, type Esercizio } from "@prisma/client";
import { errorMessageIn } from "@savint/engine";
import type { EsercizioEditor } from "./editor/modello";
import { versoNumbas } from "./editor/verso-numbas";
import { daNumbas } from "./editor/da-numbas";
import { verificaSuSemi, type EsitoVerifica } from "./editor/verifica";
import { hashContenuto, type EsercizioFile } from "./format/schema";

export type EsitoRedazione =
  | { ok: true; esercizioId: string; versione: number }
  | {
      ok: false;
      motivo: "non_trovato" | "non_rappresentabile" | "verifica_fallita" | "versione_in_conflitto";
      dettaglio?: unknown;
    };

export type VoceRedazione = {
  id: string;
  titolo: string;
  argomento: string;
  anno: number;
  ultimaVersione: number;
  modificabile: boolean;
  autoreNome: string | null;
  aggiornatoIl: Date;
  /** Il `dettaglio` di `daNumbas` per un esercizio non modificabile,
   * `null` per uno modificabile. Onda finale, I5: `daNumbas(...)` viene
   * già chiamato qui sotto per calcolare `modificabile` — prima questo
   * campo veniva scartato, e `redazione/page.tsx` doveva rileggere ogni
   * esercizio non modificabile con `caricaPerEditor` (riga, versione,
   * autore: tre query) solo per riavere lo stesso motivo che questa
   * funzione aveva già calcolato e buttato via — ~68 query e 864 ms in
   * più misurati su 24 esercizi. Conservarlo qui elimina quel secondo
   * giro senza cambiare cosa il docente vede. */
  motivo: string | null;
};

/** I campi della colonna `Esercizio` necessari per ricostruire il blocco
 * `savint` di un `EsercizioFile`. La colonna è la SOLA fonte per questi
 * valori: `EsercizioVersione.content` (vedi `seed.ts`, `tentativo.ts`,
 * `marking.ts`) è sempre e solo il blocco `question` grezzo che il motore
 * consuma, mai l'involucro `{savint, question}` — un salvataggio non può
 * scrivere altro, perché quei due moduli leggono `content` direttamente
 * come `NumbasQuestionJSON` e smetterebbero di funzionare per gli esercizi
 * salvati da questo editor. Questo rende la riga l'unica fonte reale per i
 * metadati: la regola "la riga vince" (vedi il rapporto del task) è quindi
 * garantita per costruzione, non solo da un controllo difensivo. */
function savintDaRiga(
  e: Pick<Esercizio, "title" | "description" | "yearLevel" | "topic" | "tags" | "difficulty">,
): EsercizioFile["savint"] {
  return {
    version: 1,
    title: e.title,
    description: e.description ?? "",
    yearLevel: e.yearLevel,
    topic: e.topic,
    tags: e.tags,
    difficulty: e.difficulty,
  };
}

/** Il `savint` da passare a `daNumbas`, che non è lo stesso di
 * `savintDaRiga`: `versoNumbas` (Task 1) scrive `name: meta.titolo` DENTRO
 * il blocco `question` stesso, il solo campo di metadato con un'eco
 * dentro `content` — `topic`/`tags`/`difficulty`/`yearLevel`/`description`
 * non hanno equivalente lì, esistono solo sulla riga. Il controllo
 * strutturale di `daNumbas` rigenera il file e lo confronta byte per byte:
 * se gli si passasse il titolo CORRENTE della riga dopo che questa è stata
 * corretta (un nuovo salvataggio, che aggiorna riga e contenuto insieme,
 * li tiene comunque sincronizzati — vedi `salvaNuovaVersione`), `name`
 * rigenerato e `name` nel contenuto salvato divergerebbero e l'esercizio
 * verrebbe dichiarato erroneamente non rappresentabile per un disallineamento
 * che non ha niente a che fare con la sua struttura. Qui si usa perciò il
 * titolo che il contenuto porta già scritto (`content.name`), quando c'è: la
 * riga resta comunque autorevole per l'`editor.meta` restituito al chiamante
 * — `caricaPerEditor` lo sovrascrive subito dopo aver chiamato `daNumbas`. */
function savintPerLettura(
  e: Pick<Esercizio, "title" | "description" | "yearLevel" | "topic" | "tags" | "difficulty">,
  content: unknown,
): EsercizioFile["savint"] {
  const nomeGrezzo =
    typeof content === "object" && content !== null && "name" in content
      ? (content as { name: unknown }).name
      : undefined;
  return {
    ...savintDaRiga(e),
    title: typeof nomeGrezzo === "string" && nomeGrezzo.length > 0 ? nomeGrezzo : e.title,
  };
}

/** `verificaSuSemi` (Task 3) è un controllo statico più venti caricamenti
 * veri del motore: un testo scritto a mano può fargli fare cose che un
 * `EsitoVerifica` negativo non anticipa — osservato durante questo task,
 * fuori da `verificaSuSemi` stesso (Task 3 non si tocca qui): un comando
 * LaTeX legittimo come `\varphi` (o `\varepsilon`, `\vartheta`, ...) inizia
 * con lo stesso prefisso di `\var{...}` e può far LANCIARE lo spezzatore
 * invece di restituire un esito. La garanzia di questo modulo — un
 * fallimento è un rifiuto, mai una scrittura parziale — non deve dipendere
 * dal fatto che ogni caso patologico venga già intercettato più a monte:
 * un docente che scrive una formula un po' storta deve vedere un
 * messaggio di rifiuto, non un errore del server.
 *
 * `fase: "testo"`, non "caricamento": ciò che può sfuggire da qui è sempre
 * il controllo statico sui campi di testo (lo spezzatore invocato da
 * `erroreTestoStatico`), mai un caricamento vero del motore — quello
 * lancia dentro il proprio ciclo sui semi e torna già come un `EsitoVerifica`
 * con `fase: "caricamento"`, senza bisogno di questa rete. Un'etichetta
 * sbagliata manda il docente a cercare il difetto nel posto sbagliato.
 * Il messaggio passa da `errorMessageIn(e, "it")`, come ogni altro rifiuto
 * di `verifica.ts`: `e.message` da solo è nella lingua predefinita del
 * PROCESSO al momento del lancio (vedi `errors.ts`), non necessariamente
 * l'italiano che il docente legge altrove in questo stesso esito. */
function verificaInSicurezza(question: unknown): EsitoVerifica {
  try {
    return verificaSuSemi(question);
  } catch (e) {
    return {
      ok: false,
      seme: 0,
      fase: "testo",
      messaggio: errorMessageIn(e, "it"),
    };
  }
}

/** La stessa verifica che `creaEsercizio` e `salvaNuovaVersione` fanno
 * correre prima di scrivere, qui senza scrivere nulla: è quello che il
 * pulsante "controlla" del modulo di redazione chiama. Passa dalla stessa
 * `verificaInSicurezza` — un esercizio scritto storto deve produrre lo
 * stesso rifiuto educato (mai un errore del server) sia che il docente
 * prema "controlla" sia che prema "salva"; due percorsi diversi per la
 * stessa garanzia sarebbero due posti in cui poterla rompere. */
export function verificaEsercizio(input: EsercizioEditor): EsitoVerifica {
  return verificaInSicurezza(versoNumbas(input));
}

async function nomeAutore(authorId: string | null): Promise<string | null> {
  if (!authorId) return null;
  const autore = await prisma.user.findUnique({ where: { id: authorId }, select: { name: true } });
  return autore?.name ?? null;
}

/** Crea un esercizio nuovo: verifica PRIMA di scrivere, poi la riga e la sua
 * prima versione insieme, in una sola transazione. Un fallimento della
 * verifica non tocca il database — nessuna query è stata ancora eseguita a
 * quel punto. */
export async function creaEsercizio(input: EsercizioEditor, authorId: string): Promise<EsitoRedazione> {
  const question = versoNumbas(input);
  const esito = verificaInSicurezza(question);
  if (!esito.ok) return { ok: false, motivo: "verifica_fallita", dettaglio: esito };

  const hash = hashContenuto(question);
  const esercizio = await prisma.$transaction(async (tx) => {
    const e = await tx.esercizio.create({
      data: {
        title: input.meta.titolo,
        description: input.meta.descrizione,
        authorId,
        yearLevel: input.meta.anno,
        topic: input.meta.argomento,
        tags: input.meta.tag,
        difficulty: input.meta.difficolta,
      },
    });
    await tx.esercizioVersione.create({
      data: { esercizioId: e.id, version: 1, content: question as object, hash },
    });
    return e;
  });

  return { ok: true, esercizioId: esercizio.id, versione: 1 };
}

/** Salva una versione nuova: `version = max(version) + 1`, mai un
 * aggiornamento di una `EsercizioVersione` esistente — è l'unico modo in
 * cui un compito già assegnato, che referenzia una versione per id, può
 * restare stabile mentre l'esercizio continua a essere corretto. I
 * metadati (titolo, anno, argomento, tag, difficoltà) si aggiornano sulla
 * riga `Esercizio`; il contenuto vive solo nelle versioni. Come
 * `creaEsercizio`, la verifica corre prima di qualunque scrittura: un
 * rifiuto non crea una versione nuova né tocca i metadati della riga.
 *
 * Il `findFirst` che legge `ultima` e il `create` che scrive `prossima` non
 * sono atomici fra loro rispetto a un ALTRO salvataggio dello stesso
 * esercizio: due transazioni che leggono "l'ultima è la 3" nello stesso
 * istante calcolano entrambe `prossima = 4` e solo una delle due `create`
 * riesce — il vincolo `@@unique([esercizioId, version])` sullo schema
 * impedisce la corruzione (mai due righe con lo stesso numero), ma senza
 * questo catch la transazione persa uscirebbe da qui come un
 * `PrismaClientKnownRequestError` P2002 non gestito, e la rotta lo
 * trasformerebbe in un 500 — la stessa disciplina che motiva
 * `verificaInSicurezza` sopra: un fallimento prevedibile è un rifiuto
 * strutturato, mai un errore del server. Un docente con due schede aperte
 * sullo stesso esercizio deve poter riprovare, non vedere un errore
 * generico. */
export async function salvaNuovaVersione(esercizioId: string, input: EsercizioEditor): Promise<EsitoRedazione> {
  const esistente = await prisma.esercizio.findUnique({ where: { id: esercizioId } });
  if (!esistente) {
    return { ok: false, motivo: "non_trovato", dettaglio: `nessun esercizio con id "${esercizioId}"` };
  }

  const question = versoNumbas(input);
  const esito = verificaInSicurezza(question);
  if (!esito.ok) return { ok: false, motivo: "verifica_fallita", dettaglio: esito };

  const hash = hashContenuto(question);
  try {
    const nuovaVersione = await prisma.$transaction(async (tx) => {
      const ultima = await tx.esercizioVersione.findFirst({
        where: { esercizioId },
        orderBy: { version: "desc" },
      });
      const prossima = (ultima?.version ?? 0) + 1;
      await tx.esercizioVersione.create({
        data: { esercizioId, version: prossima, content: question as object, hash },
      });
      await tx.esercizio.update({
        where: { id: esercizioId },
        data: {
          title: input.meta.titolo,
          description: input.meta.descrizione,
          yearLevel: input.meta.anno,
          topic: input.meta.argomento,
          tags: input.meta.tag,
          difficulty: input.meta.difficolta,
        },
      });
      return prossima;
    });

    return { ok: true, esercizioId, versione: nuovaVersione };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return {
        ok: false,
        motivo: "versione_in_conflitto",
        dettaglio: "un altro salvataggio ha già scritto una versione nel frattempo; riprova",
      };
    }
    throw e;
  }
}

/** Duplica un esercizio: riga nuova (`version = 1`), `authorId` di chi
 * duplica — mai l'autore originale. Copia il contenuto GREZZO dell'ultima
 * versione, non passando dal modello dell'editor: è deliberato. "Duplica"
 * è l'unica via d'uscita che i messaggi di rifiuto di `daNumbas`
 * promettono ("usa duplica per continuare a modificarlo direttamente in
 * Numbas" — Task 2) per un esercizio che l'editor non sa rappresentare, e
 * quella promessa sarebbe falsa se la duplicazione stessa richiedesse la
 * rappresentabilità. */
export async function duplicaEsercizio(esercizioId: string, authorId: string): Promise<EsitoRedazione> {
  const originale = await prisma.esercizio.findUnique({ where: { id: esercizioId } });
  if (!originale) {
    return { ok: false, motivo: "non_trovato", dettaglio: `nessun esercizio con id "${esercizioId}"` };
  }

  const versione = await prisma.esercizioVersione.findFirst({
    where: { esercizioId },
    orderBy: { version: "desc" },
  });
  if (!versione) {
    return { ok: false, motivo: "non_trovato", dettaglio: "l'esercizio originale non ha nessuna versione salvata" };
  }

  const nuovo = await prisma.$transaction(async (tx) => {
    const e = await tx.esercizio.create({
      data: {
        title: originale.title,
        description: originale.description,
        authorId,
        yearLevel: originale.yearLevel,
        topic: originale.topic,
        tags: originale.tags,
        difficulty: originale.difficulty,
      },
    });
    await tx.esercizioVersione.create({
      data: { esercizioId: e.id, version: 1, content: versione.content as object, hash: versione.hash },
    });
    return e;
  });

  return { ok: true, esercizioId: nuovo.id, versione: 1 };
}

/** L'elenco della redazione: ogni esercizio con la sua ultima versione,
 * marcato modificabile eseguendo `daNumbas` (Task 2) su di essa. Il
 * `savint` passato a `daNumbas` viene SEMPRE dalla riga, mai da un campo
 * dentro `content` (che non ne porta uno): coerente con la regola "la riga
 * è autorevole" applicata anche qui, non solo in `caricaPerEditor`.
 *
 * `motivo` (Onda finale, I5) è lo stesso `dettaglio` che `daNumbas`
 * restituisce insieme al rifiuto usato per calcolare `modificabile`: prima
 * veniva scartato qui e ricalcolato dal chiamante rileggendo ogni
 * esercizio non modificabile con `caricaPerEditor` — la stessa chiamata a
 * `daNumbas`, sugli stessi dati, una seconda volta. Non c'è nessun motivo
 * per un esercizio modificabile (`ok: true` non ne porta uno). */
export async function elencoRedazione(): Promise<VoceRedazione[]> {
  const esercizi = await prisma.esercizio.findMany({
    orderBy: { title: "asc" },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const authorIds = [...new Set(esercizi.map((e) => e.authorId).filter((id): id is string => id !== null))];
  const autori = authorIds.length
    ? await prisma.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const nomePerId = new Map(autori.map((a) => [a.id, a.name]));

  return esercizi.map((e) => {
    const ultima = e.versions[0];
    const lettura = ultima ? daNumbas({ savint: savintPerLettura(e, ultima.content), question: ultima.content }) : null;
    return {
      id: e.id,
      titolo: e.title,
      argomento: e.topic,
      anno: e.yearLevel,
      ultimaVersione: ultima?.version ?? 0,
      modificabile: lettura?.ok ?? false,
      motivo: lettura && !lettura.ok ? lettura.dettaglio : null,
      autoreNome: e.authorId ? (nomePerId.get(e.authorId) ?? null) : null,
      aggiornatoIl: e.updatedAt,
    };
  });
}

/** Carica un esercizio per l'editor: la sua ultima versione, letta con
 * `daNumbas`. Un esercizio non rappresentabile restituisce il rifiuto col
 * dettaglio — mai un modello parziale, che sarebbe il danno peggiore
 * descritto dalla specifica di `daNumbas` (mostrare metà di un esercizio
 * ricco e salvare una versione con l'altra metà cancellata).
 *
 * `editor.meta` viene SEMPRE sovrascritto con i valori della riga
 * `Esercizio` dopo la lettura: è lei l'autorevole per i metadati, non
 * un'eventuale eco dentro il contenuto della versione (il campo `name`
 * che `versoNumbas` scrive nel blocco Numbas, per esempio) — è ciò che
 * contenitori, filtri e ricerche interrogano, quindi se l'editor mostrasse
 * altro un docente correggerebbe un titolo, salverebbe, e lo vedrebbe
 * tornare indietro. */
export async function caricaPerEditor(esercizioId: string): Promise<
  | { ok: true; editor: EsercizioEditor; versione: number; autoreNome: string | null; aggiornatoIl: Date }
  | { ok: false; motivo: "non_trovato" | "non_rappresentabile"; dettaglio: string }
> {
  const esercizio = await prisma.esercizio.findUnique({ where: { id: esercizioId } });
  if (!esercizio) {
    return { ok: false, motivo: "non_trovato", dettaglio: `nessun esercizio con id "${esercizioId}"` };
  }

  const versione = await prisma.esercizioVersione.findFirst({
    where: { esercizioId },
    orderBy: { version: "desc" },
  });
  if (!versione) {
    return { ok: false, motivo: "non_trovato", dettaglio: "l'esercizio non ha nessuna versione salvata" };
  }

  const lettura = daNumbas({ savint: savintPerLettura(esercizio, versione.content), question: versione.content });
  if (!lettura.ok) {
    return { ok: false, motivo: "non_rappresentabile", dettaglio: lettura.dettaglio };
  }

  const editor: EsercizioEditor = {
    ...lettura.editor,
    meta: {
      titolo: esercizio.title,
      descrizione: esercizio.description ?? "",
      anno: esercizio.yearLevel,
      argomento: esercizio.topic,
      tag: esercizio.tags,
      difficolta: esercizio.difficulty,
    },
  };

  return {
    ok: true,
    editor,
    versione: versione.version,
    autoreNome: await nomeAutore(esercizio.authorId),
    aggiornatoIl: esercizio.updatedAt,
  };
}
