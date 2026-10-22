import type { Session } from "next-auth";
import type { RuoloEsercizi } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/**
 * Chi può fare cosa su esercizi e raccolte (spec "Il modello di accesso").
 * Il ruolo effettivo è il più ampio tra tutte le strade che lo danno:
 * proprietà, condivisione diretta o con la scuola, condivisione per
 * argomento, raccolte. Nessuna strada → null: l'esercizio non si vede.
 */

export type Ruolo = "PROPRIETARIO" | "EDITOR" | "COMMENTATORE" | "VISUALIZZATORE";
export type Utente = { id: string; admin: boolean };
export type Azione = "vedere" | "commentare" | "risolvere" | "modificare" | "condividere";

const ORDINE: Record<Ruolo, number> = { VISUALIZZATORE: 1, COMMENTATORE: 2, EDITOR: 3, PROPRIETARIO: 4 };

// Il ruolo minimo che serve per ciascuna azione.
const MINIMO: Record<Azione, Ruolo> = {
  vedere: "VISUALIZZATORE",
  commentare: "COMMENTATORE",
  risolvere: "EDITOR",
  modificare: "EDITOR",
  condividere: "PROPRIETARIO",
};

/** Il più ampio dei due ruoli; null/undefined contano come "nessun ruolo". */
export function ruoloMassimo(a: Ruolo | null | undefined, b: Ruolo | null | undefined): Ruolo | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return ORDINE[a] >= ORDINE[b] ? a : b;
}

/** Senza ruolo non si fa niente, nemmeno vedere. */
export function puo(ruolo: Ruolo | null | undefined, azione: Azione): boolean {
  return !!ruolo && ORDINE[ruolo] >= ORDINE[MINIMO[azione]];
}

/** La forma con cui si confrontano gli argomenti: come nei gruppi del catalogo. */
export function chiaveArgomento(argomento: string): string {
  return argomento.trim().toLocaleLowerCase("it");
}

export function utenteDaSessione(session: Session): Utente {
  return { id: session.user.id, admin: session.user.role === "ADMIN" };
}

/** Un utente che non esiste è un docente qualunque: non ha niente di suo. */
export async function utenteDaId(id: string): Promise<Utente> {
  const u = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  return { id, admin: u?.role === "ADMIN" };
}

// Su una raccolta il proprietario conta come EDITOR verso gli esercizi che
// contiene: una raccolta non rende nessuno proprietario di un esercizio altrui.
export function versoEsercizi(r: Ruolo): Ruolo {
  return r === "PROPRIETARIO" ? "EDITOR" : r;
}

/** I contributori di una raccolta: il proprietario e gli editor nominati.
 * Un ruolo di scuola fa ricevere, non contribuire. */
export function contributoriRaccolta(r: { createdById: string; condivisioni: { userId: string; ruolo: RuoloEsercizi }[] }): Set<string> {
  const contributori = new Set([r.createdById]);
  for (const c of r.condivisioni) if (c.ruolo === "EDITOR") contributori.add(c.userId);
  return contributori;
}

/**
 * La regola delle raccolte: una raccolta trasmette un esercizio solo se ce
 * l'ha messo l'autore stesso, ed è un suo contributore. Chi ha ricevuto un
 * esercizio non può girarlo ad altri mettendolo in una raccolta, nemmeno se
 * ne nomina editor l'autore.
 */
export function raccoltaTrasmette(addedById: string | null, authorId: string, contributori: Set<string>): boolean {
  return addedById === authorId && contributori.has(authorId);
}

/**
 * Se una raccolta rende davvero visibile un esercizio a qualcuno oltre al
 * suo autore: la trasmette (`raccoltaTrasmette`) ed è aperta a qualcun
 * altro (tutta la scuola, un collega nominato, o il proprietario della
 * raccolta quando non è l'autore). È l'unico punto da cui l'interfaccia
 * ("condiviso" in redazione, l'avviso sulla pagina della raccolta, gli
 * accessi indiretti della finestra Condividi) deduce la regola delle
 * raccolte, così non può dire altro da `ruoliEsercizi`.
 */
export function raccoltaRendeVisibile(
  r: { createdById: string; accessoScuola: RuoloEsercizi | null; condivisioni: { userId: string; ruolo: RuoloEsercizi }[] },
  addedById: string | null,
  authorId: string,
): boolean {
  if (!raccoltaTrasmette(addedById, authorId, contributoriRaccolta(r))) return false;
  return r.accessoScuola !== null || r.createdById !== authorId || r.condivisioni.some((c) => c.userId !== authorId);
}

/**
 * Lo stesso utente come docente qualunque, senza i poteri dell'ADMIN. Serve
 * dove si pesca o si conta per un compito (bacini, conteggi, argomenti,
 * batterie): un ADMIN che insegna pesca solo fra ciò che vedrebbe da
 * docente, mai fra le bozze private dei colleghi. I poteri dell'ADMIN
 * restano nel catalogo e nella gestione.
 */
export function comeDocente(u: Utente | string): Utente {
  return { id: typeof u === "string" ? u : u.id, admin: false };
}

type RigaRaccolta = {
  id: string;
  createdById: string;
  accessoScuola: RuoloEsercizi | null;
  condivisioni: { userId: string; ruolo: RuoloEsercizi }[];
};

/** Il ruolo di `chi` su una raccolta già caricata con le sue condivisioni
 * (bastano quelle di `chi`). "scuola" non ha condivisioni nominate. */
function ruoloSuRaccolta(chi: Utente | "scuola", r: RigaRaccolta): Ruolo | null {
  if (chi === "scuola") return r.accessoScuola;
  if (chi.admin || r.createdById === chi.id) return "PROPRIETARIO";
  const nominata = r.condivisioni.find((c) => c.userId === chi.id)?.ruolo;
  return ruoloMassimo(nominata, r.accessoScuola);
}

/** Le raccolte su cui `chi` ha un ruolo (proprietà, nominata o scuola). */
function filtroRaccolte(chi: Utente | "scuola", soloId?: string) {
  const dove = chi === "scuola"
    ? { accessoScuola: { not: null } }
    : chi.admin
      ? {}
      : { OR: [
          { createdById: chi.id },
          { condivisioni: { some: { userId: chi.id } } },
          { accessoScuola: { not: null } },
        ] };
  return soloId ? { AND: [dove, { id: soloId }] } : dove;
}

/**
 * Il calcolo vero e proprio, a query fisse. Con `soloId` si limita a un
 * esercizio (per `ruoloEsercizio`), altrimenti li guarda tutti.
 */
async function calcolaRuoliEsercizi(chi: Utente | "scuola", soloId?: string): Promise<Map<string, Ruolo>> {
  const esercizi = await prisma.esercizio.findMany({
    where: soloId ? { id: soloId } : {},
    select: { id: true, authorId: true, topic: true, accessoScuola: true },
  });
  const ruoli = new Map<string, Ruolo>();
  if (chi !== "scuola" && chi.admin) {
    for (const e of esercizi) ruoli.set(e.id, "PROPRIETARIO");
    return ruoli;
  }
  const utenteId = chi === "scuola" ? null : chi.id;

  const [dirette, argomenti, raccolte] = await Promise.all([
    utenteId
      ? prisma.condivisioneEsercizio.findMany({
          where: { userId: utenteId, ...(soloId ? { esercizioId: soloId } : {}) },
          select: { esercizioId: true, ruolo: true },
        })
      : Promise.resolve([]),
    prisma.condivisioneArgomento.findMany({
      where: { OR: [{ userId: null }, ...(utenteId ? [{ userId: utenteId }] : [])] },
      select: { ownerId: true, chiave: true, ruolo: true },
    }),
    prisma.contenitore.findMany({
      where: soloId
        ? { AND: [filtroRaccolte(chi), { esercizi: { some: { esercizioId: soloId } } }] }
        : filtroRaccolte(chi),
      select: {
        id: true,
        createdById: true,
        accessoScuola: true,
        // Servono quelle di chi chiede (il suo ruolo) e gli editor nominati
        // (i contributori): le altre non contano.
        condivisioni: {
          where: { OR: [{ ruolo: "EDITOR" }, ...(utenteId ? [{ userId: utenteId }] : [])] },
          select: { userId: true, ruolo: true },
        },
        esercizi: {
          where: soloId ? { esercizioId: soloId } : {},
          select: { esercizioId: true, addedById: true },
        },
      },
    }),
  ]);

  const perDiretta = new Map(dirette.map((d) => [d.esercizioId, d.ruolo as Ruolo]));

  // Le condivisioni per argomento possono ripetersi: vale la più ampia.
  const perArgomento = new Map<string, Ruolo>();
  for (const a of argomenti) {
    const k = `${a.ownerId}\u0000${chiaveArgomento(a.chiave)}`;
    perArgomento.set(k, ruoloMassimo(perArgomento.get(k), a.ruolo)!);
  }

  // Per ogni esercizio, le raccolte che lo contengono: ciascuna col ruolo di
  // chi chiede, i suoi contributori (proprietario + editor nominati) e chi ve
  // l'ha messo. Un ruolo di scuola fa ricevere, non contribuire.
  type Voce = { ruolo: Ruolo; contributori: Set<string>; addedById: string | null };
  const perRaccolta = new Map<string, Voce[]>();
  for (const r of raccolte) {
    const ruolo = ruoloSuRaccolta(chi, r);
    if (!ruolo) continue;
    const contributori = contributoriRaccolta(r);
    for (const { esercizioId, addedById } of r.esercizi) {
      const voce: Voce = { ruolo: versoEsercizi(ruolo), contributori, addedById };
      const lista = perRaccolta.get(esercizioId);
      if (lista) lista.push(voce);
      else perRaccolta.set(esercizioId, [voce]);
    }
  }

  for (const e of esercizi) {
    let ruolo: Ruolo | null = null;
    if (utenteId && e.authorId === utenteId) ruolo = "PROPRIETARIO";
    ruolo = ruoloMassimo(ruolo, perDiretta.get(e.id));
    ruolo = ruoloMassimo(ruolo, e.accessoScuola);
    if (e.authorId) {
      ruolo = ruoloMassimo(ruolo, perArgomento.get(`${e.authorId}\u0000${chiaveArgomento(e.topic)}`));
      // La regola delle raccolte (`raccoltaTrasmette`).
      for (const v of perRaccolta.get(e.id) ?? []) {
        if (raccoltaTrasmette(v.addedById, e.authorId, v.contributori)) ruolo = ruoloMassimo(ruolo, v.ruolo);
      }
    }
    if (ruolo) ruoli.set(e.id, ruolo);
  }
  return ruoli;
}

/**
 * Gli esercizi che `chi` vede, ciascuno col suo ruolo. "scuola" è ciò che
 * vede un docente qualunque senza niente di suo né condivisioni nominate
 * (serve alla pratica libera degli studenti): mai PROPRIETARIO.
 */
export async function ruoliEsercizi(chi: Utente | "scuola"): Promise<Map<string, Ruolo>> {
  return calcolaRuoliEsercizi(chi);
}

/** Il ruolo di `chi` su un esercizio; null se non lo vede o non esiste. */
export async function ruoloEsercizio(chi: Utente, esercizioId: string): Promise<Ruolo | null> {
  return (await calcolaRuoliEsercizi(chi, esercizioId)).get(esercizioId) ?? null;
}

async function calcolaRuoliContenitori(chi: Utente, soloId?: string): Promise<Map<string, Ruolo>> {
  const raccolte = await prisma.contenitore.findMany({
    where: filtroRaccolte(chi, soloId),
    select: {
      id: true,
      createdById: true,
      accessoScuola: true,
      condivisioni: { where: { userId: chi.id }, select: { userId: true, ruolo: true } },
    },
  });
  const ruoli = new Map<string, Ruolo>();
  for (const r of raccolte) {
    const ruolo = ruoloSuRaccolta(chi, r);
    if (ruolo) ruoli.set(r.id, ruolo);
  }
  return ruoli;
}

/** Le raccolte che `chi` vede, col suo ruolo (il proprietario è PROPRIETARIO). */
export async function ruoliContenitori(chi: Utente): Promise<Map<string, Ruolo>> {
  return calcolaRuoliContenitori(chi);
}

/** Il ruolo di `chi` su una raccolta; null se non la vede o non esiste. */
export async function ruoloContenitore(chi: Utente, contenitoreId: string): Promise<Ruolo | null> {
  return (await calcolaRuoliContenitori(chi, contenitoreId)).get(contenitoreId) ?? null;
}
