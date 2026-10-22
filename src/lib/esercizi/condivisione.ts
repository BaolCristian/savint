import type { RuoloEsercizi } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import {
  chiaveArgomento, raccoltaRendeVisibile, ruoloMassimo, versoEsercizi,
  type Ruolo, type Utente,
} from "./accesso";

/**
 * La finestra "Condividi" (spec "La finestra Condividi"): chi ha accesso a un
 * esercizio, a una raccolta o a un argomento, e il cambio di quell'accesso.
 * - Solo il proprietario (o l'ADMIN) legge e cambia la condivisione; per
 *   chiunque altro la risorsa "non esiste" (null / `non_trovato`), mai un
 *   "esiste ma non è tua".
 * - Un esercizio senza proprietario (`authorId` nullo, i caricati di
 *   partenza) lo gestisce solo l'ADMIN.
 * - Un argomento è sempre di un proprietario: `chi`, oppure quello indicato
 *   dall'ADMIN con `ownerId`. Riguarda solo gli esercizi propri di
 *   quell'argomento (lo applica `accesso.ts`).
 * - Impostare SOSTITUISCE tutto in una transazione: le persone non più in
 *   elenco perdono l'accesso, `scuola: null` chiude l'accesso generale.
 */

export type Risorsa =
  | { tipo: "esercizio"; id: string }
  | { tipo: "contenitore"; id: string }
  | { tipo: "argomento"; argomento: string; ownerId?: string };

export type PersonaCondivisione = { userId: string; nome: string; email: string; ruolo: RuoloEsercizi };

/** Un accesso che arriva da una raccolta o da un argomento, non dalla
 * condivisione diretta: spiega perché togliere quella non basta. */
export type AccessoIndiretto = { nome: string; via: "raccolta" | "argomento"; dettaglio: string; ruolo: Ruolo };

export type StatoCondivisione = {
  persone: PersonaCondivisione[];
  scuola: RuoloEsercizi | null;
  /** Solo per gli esercizi; vuoto per raccolte e argomenti. */
  indiretti: AccessoIndiretto[];
  proprietarioNome: string | null;
};

export type NuovaCondivisione = {
  persone: { userId: string; ruolo: RuoloEsercizi }[];
  scuola: RuoloEsercizi | null;
};

export type EsitoCondivisione = { ok: true } | { ok: false; motivo: "non_trovato" | "destinatario_non_valido" };
export type EsitoTrasferimento =
  | { ok: true }
  | { ok: false; motivo: "non_permesso" | "non_trovato" | "destinatario_non_valido" };

const TUTTA_LA_SCUOLA = "Tutta la scuola";

function nomeDi(u: { name: string | null; email: string }): string {
  return u.name?.trim() || u.email;
}

const perNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, "it");

// La risorsa vista dal punto di vista di chi la condivide: chi ne è il
// proprietario (null = nessuno) e, per l'argomento, la sua chiave.
type Bersaglio =
  | { tipo: "esercizio"; id: string; proprietarioId: string | null; topic: string }
  | { tipo: "contenitore"; id: string; proprietarioId: string }
  | { tipo: "argomento"; proprietarioId: string; chiave: string; argomento: string };

/** La risorsa se `chi` può condividerla, altrimenti null (anche se non esiste). */
async function bersaglio(risorsa: Risorsa, chi: Utente): Promise<Bersaglio | null> {
  if (risorsa.tipo === "esercizio") {
    const e = await prisma.esercizio.findUnique({ where: { id: risorsa.id }, select: { authorId: true, topic: true } });
    if (!e || !(chi.admin || (e.authorId !== null && e.authorId === chi.id))) return null;
    return { tipo: "esercizio", id: risorsa.id, proprietarioId: e.authorId, topic: e.topic };
  }
  if (risorsa.tipo === "contenitore") {
    const c = await prisma.contenitore.findUnique({ where: { id: risorsa.id }, select: { createdById: true } });
    if (!c || !(chi.admin || c.createdById === chi.id)) return null;
    return { tipo: "contenitore", id: risorsa.id, proprietarioId: c.createdById };
  }
  const argomento = risorsa.argomento.trim();
  if (!argomento) return null;
  // Un docente gestisce solo i propri argomenti: un ownerId altrui è "non trovato".
  const ownerId = risorsa.ownerId ?? chi.id;
  if (ownerId !== chi.id) {
    if (!chi.admin) return null;
    // Solo un docente (TEACHER/ADMIN) ha argomenti propri: uno studente o un
    // id inesistente è "non trovato", come per i destinatari.
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { role: true } });
    if (!owner || (owner.role !== "TEACHER" && owner.role !== "ADMIN")) return null;
  }
  return { tipo: "argomento", proprietarioId: ownerId, chiave: chiaveArgomento(argomento), argomento };
}

export async function leggiCondivisione(risorsa: Risorsa, chi: Utente): Promise<StatoCondivisione | null> {
  const b = await bersaglio(risorsa, chi);
  if (!b) return null;
  const utente = { select: { name: true, email: true } } as const;

  let righe: { userId: string; ruolo: RuoloEsercizi; user: { name: string | null; email: string } }[];
  let scuola: RuoloEsercizi | null;
  let indiretti: AccessoIndiretto[] = [];
  if (b.tipo === "esercizio") {
    const e = await prisma.esercizio.findUniqueOrThrow({
      where: { id: b.id },
      select: { accessoScuola: true, condivisioni: { select: { userId: true, ruolo: true, user: utente } } },
    });
    righe = e.condivisioni;
    scuola = e.accessoScuola;
    if (b.proprietarioId) indiretti = await accessiIndiretti(b.id, b.proprietarioId, b.topic);
  } else if (b.tipo === "contenitore") {
    const c = await prisma.contenitore.findUniqueOrThrow({
      where: { id: b.id },
      select: { accessoScuola: true, condivisioni: { select: { userId: true, ruolo: true, user: utente } } },
    });
    righe = c.condivisioni;
    scuola = c.accessoScuola;
  } else {
    const a = await prisma.condivisioneArgomento.findMany({
      where: { ownerId: b.proprietarioId, chiave: b.chiave },
      select: { userId: true, ruolo: true, user: utente },
    });
    righe = a.flatMap((r) => (r.userId && r.user ? [{ userId: r.userId, ruolo: r.ruolo, user: r.user }] : []));
    // Le righe non si ripetono (impostare sostituisce), ma per sicurezza vale la più ampia.
    scuola = a.filter((r) => r.userId === null).reduce<RuoloEsercizi | null>(
      (m, r) => ruoloMassimo(m, r.ruolo) as RuoloEsercizi | null, null);
  }

  const proprietario = b.proprietarioId
    ? await prisma.user.findUnique({ where: { id: b.proprietarioId }, select: { name: true, email: true } })
    : null;
  return {
    persone: righe
      .map((r) => ({ userId: r.userId, nome: nomeDi(r.user), email: r.user.email, ruolo: r.ruolo }))
      .sort(perNome),
    scuola,
    indiretti,
    proprietarioNome: proprietario ? nomeDi(proprietario) : null,
  };
}

/**
 * Chi riceve l'esercizio da una raccolta o dall'argomento del proprietario,
 * a prescindere dalla condivisione diretta: una voce per persona (o "Tutta
 * la scuola") e per strada. Le raccolte seguono la regola di `accesso.ts`
 * (`raccoltaRendeVisibile`): contano solo quelle in cui l'esercizio l'ha
 * messo il proprietario stesso, quando ne è contributore.
 */
async function accessiIndiretti(esercizioId: string, proprietarioId: string, topic: string): Promise<AccessoIndiretto[]> {
  const utente = { select: { name: true, email: true } } as const;
  const [argomenti, righeRaccolta] = await Promise.all([
    prisma.condivisioneArgomento.findMany({
      where: { ownerId: proprietarioId, chiave: chiaveArgomento(topic) },
      select: { userId: true, argomento: true, ruolo: true, user: utente },
    }),
    prisma.contenitoreEsercizio.findMany({
      where: { esercizioId },
      select: {
        addedById: true,
        contenitore: {
          select: {
            id: true,
            name: true,
            createdById: true,
            accessoScuola: true,
            createdBy: utente,
            condivisioni: { select: { userId: true, ruolo: true, user: utente } },
          },
        },
      },
    }),
  ]);

  // Chiave: destinatario + strada; se la stessa strada ripete un
  // destinatario vale il ruolo più ampio.
  const voci = new Map<string, AccessoIndiretto>();
  const aggiungi = (chi: string, nome: string, via: AccessoIndiretto["via"], strada: string, dettaglio: string, ruolo: Ruolo) => {
    if (chi === proprietarioId) return; // il proprietario non riceve niente da nessuno
    const k = `${chi}\u0000${via}\u0000${strada}`;
    const prima = voci.get(k);
    voci.set(k, { nome, via, dettaglio, ruolo: ruoloMassimo(prima?.ruolo, ruolo)! });
  };

  for (const a of argomenti) {
    if (a.userId && a.user) aggiungi(a.userId, nomeDi(a.user), "argomento", a.argomento, a.argomento, a.ruolo);
    else if (!a.userId) aggiungi("", TUTTA_LA_SCUOLA, "argomento", a.argomento, a.argomento, a.ruolo);
  }

  for (const { addedById, contenitore: r } of righeRaccolta) {
    if (!raccoltaRendeVisibile(r, addedById, proprietarioId)) continue;
    aggiungi(r.createdById, nomeDi(r.createdBy), "raccolta", r.id, r.name, versoEsercizi("PROPRIETARIO"));
    for (const c of r.condivisioni) aggiungi(c.userId, nomeDi(c.user), "raccolta", r.id, r.name, versoEsercizi(c.ruolo));
    if (r.accessoScuola) aggiungi("", TUTTA_LA_SCUOLA, "raccolta", r.id, r.name, r.accessoScuola);
  }

  return [...voci.values()].sort((x, y) =>
    x.via.localeCompare(y.via) || x.dettaglio.localeCompare(y.dettaglio, "it") || perNome(x, y));
}

/** Destinatari validi: docenti (TEACHER/ADMIN) esistenti, senza doppioni,
 * mai chi condivide né il proprietario (ha già tutto). */
async function destinatariValidi(ids: string[], escludi: (string | null)[]): Promise<boolean> {
  if (new Set(ids).size !== ids.length) return false;
  if (ids.some((id) => escludi.includes(id))) return false;
  if (ids.length === 0) return true;
  const docenti = await prisma.user.count({ where: { id: { in: ids }, role: { in: ["TEACHER", "ADMIN"] } } });
  return docenti === ids.length;
}

export async function impostaCondivisione(
  risorsa: Risorsa,
  chi: Utente,
  nuovo: NuovaCondivisione,
): Promise<EsitoCondivisione> {
  const b = await bersaglio(risorsa, chi);
  if (!b) return { ok: false, motivo: "non_trovato" };
  if (!(await destinatariValidi(nuovo.persone.map((p) => p.userId), [chi.id, b.proprietarioId]))) {
    return { ok: false, motivo: "destinatario_non_valido" };
  }

  if (b.tipo === "esercizio") {
    await prisma.$transaction([
      prisma.condivisioneEsercizio.deleteMany({ where: { esercizioId: b.id } }),
      prisma.condivisioneEsercizio.createMany({
        data: nuovo.persone.map((p) => ({ esercizioId: b.id, userId: p.userId, ruolo: p.ruolo })),
      }),
      prisma.esercizio.update({ where: { id: b.id }, data: { accessoScuola: nuovo.scuola } }),
    ]);
  } else if (b.tipo === "contenitore") {
    await prisma.$transaction([
      prisma.condivisioneContenitore.deleteMany({ where: { contenitoreId: b.id } }),
      prisma.condivisioneContenitore.createMany({
        data: nuovo.persone.map((p) => ({ contenitoreId: b.id, userId: p.userId, ruolo: p.ruolo })),
      }),
      prisma.contenitore.update({ where: { id: b.id }, data: { accessoScuola: nuovo.scuola } }),
    ]);
  } else {
    // Nessun vincolo di unicità nello schema: si tolgono tutte le righe di
    // (proprietario, chiave) e si riscrivono, così non nascono doppioni.
    // `argomento` resta come l'ha scritto il docente, per mostrarlo.
    const riga = { ownerId: b.proprietarioId, chiave: b.chiave, argomento: b.argomento };
    await prisma.$transaction([
      prisma.condivisioneArgomento.deleteMany({ where: { ownerId: b.proprietarioId, chiave: b.chiave } }),
      prisma.condivisioneArgomento.createMany({
        data: [
          ...nuovo.persone.map((p) => ({ ...riga, userId: p.userId, ruolo: p.ruolo })),
          ...(nuovo.scuola ? [{ ...riga, userId: null, ruolo: nuovo.scuola }] : []),
        ],
      }),
    ]);
  }
  return { ok: true };
}

/** I docenti a cui si può condividere (TEACHER e ADMIN), in ordine di nome. */
export async function docentiDellaScuola(escludiId: string): Promise<{ id: string; nome: string; email: string }[]> {
  const utenti = await prisma.user.findMany({
    where: { role: { in: ["TEACHER", "ADMIN"] }, id: { not: escludiId } },
    select: { id: true, name: true, email: true },
  });
  return utenti.map((u) => ({ id: u.id, nome: nomeDi(u), email: u.email })).sort(perNome);
}

/**
 * Solo l'ADMIN passa un esercizio o una raccolta a un altro docente (per
 * esempio quando chi l'ha creata lascia la scuola). La condivisione nominata
 * che il nuovo proprietario aveva su quella risorsa non serve più e si toglie.
 */
export async function trasferisciProprieta(
  risorsa: { tipo: "esercizio" | "contenitore"; id: string },
  nuovoProprietarioId: string,
  chi: Utente,
): Promise<EsitoTrasferimento> {
  if (!chi.admin) return { ok: false, motivo: "non_permesso" };
  const esiste = risorsa.tipo === "esercizio"
    ? await prisma.esercizio.findUnique({ where: { id: risorsa.id }, select: { id: true } })
    : await prisma.contenitore.findUnique({ where: { id: risorsa.id }, select: { id: true } });
  if (!esiste) return { ok: false, motivo: "non_trovato" };
  const nuovo = await prisma.user.findUnique({ where: { id: nuovoProprietarioId }, select: { role: true } });
  if (!nuovo || nuovo.role === "STUDENT") return { ok: false, motivo: "destinatario_non_valido" };

  if (risorsa.tipo === "esercizio") {
    await prisma.$transaction([
      prisma.esercizio.update({ where: { id: risorsa.id }, data: { authorId: nuovoProprietarioId } }),
      prisma.condivisioneEsercizio.deleteMany({ where: { esercizioId: risorsa.id, userId: nuovoProprietarioId } }),
    ]);
  } else {
    await prisma.$transaction([
      prisma.contenitore.update({ where: { id: risorsa.id }, data: { createdById: nuovoProprietarioId } }),
      prisma.condivisioneContenitore.deleteMany({ where: { contenitoreId: risorsa.id, userId: nuovoProprietarioId } }),
    ]);
  }
  return { ok: true };
}
