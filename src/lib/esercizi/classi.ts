import { randomBytes } from "crypto";
import { Prisma, type Classe } from "@prisma/client";
import type { ClassGroup } from "@/lib/auth/resolve-role";
import { prisma } from "@/lib/db/client";

/** Trova o crea la classe che corrisponde a un gruppo Google. Tre casi:
 *  1. un gruppo con questo indirizzo esiste già → aggiorna nome e anno.
 *  2. nessun indirizzo così, ma una classe creata a mano (senza indirizzo),
 *     non archiviata, ha lo stesso nome → l'adotta: le scrive dentro
 *     l'indirizzo e nient'altro (non tocca nome, anno, studenti o
 *     iscrizioni). Deliberatamente non tocca mai una classe che ha già un
 *     indirizzo, anche se il nome coincide: quell'indirizzo appartiene a un
 *     altro gruppo, e adottare la classe sbagliata fonderebbe due gruppi di
 *     studenti che devono restare separati. Esclude anche le classi
 *     archiviate per lo stesso motivo, dal lato opposto: classiDelDocente e
 *     classiDisponibili filtrano già archivedAt: null, quindi una classe
 *     archiviata adottata sparirebbe dall'elenco del docente insieme al
 *     gruppo appena legato — gli stessi studenti, invisibili.
 *  3. altrimenti → la classe è nuova: upsert (non create) perché due
 *     accessi concorrenti per un gruppo mai visto — più studenti della
 *     stessa classe nuova che accedono insieme, esattamente il giorno in
 *     cui questa funzione serve di più — possono arrivare qui insieme; il
 *     secondo trova già scritta la riga del primo invece di scontrarcisi
 *     con un P2002 non gestito. */
async function risolviClasse(g: ClassGroup): Promise<Classe> {
  const esistente = await prisma.classe.findUnique({ where: { googleGroupEmail: g.email } });
  if (esistente) {
    return prisma.classe.update({
      where: { id: esistente.id },
      data: { name: g.name, yearLevel: g.yearLevel },
    });
  }

  const daAdottare = await prisma.classe.findFirst({
    where: { googleGroupEmail: null, name: g.name, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (daAdottare) {
    return prisma.classe.update({
      where: { id: daAdottare.id },
      data: { googleGroupEmail: g.email },
    });
  }

  return prisma.classe.upsert({
    where: { googleGroupEmail: g.email },
    create: { googleGroupEmail: g.email, name: g.name, yearLevel: g.yearLevel },
    update: { name: g.name, yearLevel: g.yearLevel },
  });
}

/** Allinea le iscrizioni di uno studente ai gruppi che Google gli riconosce
 * adesso: crea (o adotta, vedi risolviClasse) le classi mancanti, iscrive
 * alle nuove, disiscrive da quelle che non ha più. Le classi restano anche
 * quando si svuotano: i compiti già assegnati ci puntano.
 *
 * Le uscite si calcolano solo sulle iscrizioni con origine GRUPPO: uno
 * studente iscritto col codice non deve mai essere disiscritto da un
 * accesso Google che non lo riguarda, perché quella classe non corrisponde
 * a nessun gruppo e sparirebbe sempre dal confronto. Le entrate invece
 * guardano tutte le iscrizioni esistenti (qualunque origine): se lo
 * studente è già iscritto per codice a una classe che viene poi adottata da
 * un gruppo, non deve ricomparire come una nuova iscrizione né perdere la
 * sua origine CODICE. */
export async function allineaClassi(
  studentId: string,
  gruppi: ClassGroup[],
): Promise<{ entrate: string[]; uscite: string[] }> {
  const classi = await Promise.all(gruppi.map(risolviClasse));
  const volute = new Set(classi.map((c) => c.id));

  const attuali = await prisma.classeStudente.findMany({ where: { studentId } });
  const presenti = new Set(attuali.map((i) => i.classeId));
  const presentiDaGruppo = new Set(attuali.filter((i) => i.origine === "GRUPPO").map((i) => i.classeId));

  const entrate = [...volute].filter((id) => !presenti.has(id));
  const uscite = [...presentiDaGruppo].filter((id) => !volute.has(id));

  if (entrate.length) {
    await prisma.classeStudente.createMany({
      data: entrate.map((classeId) => ({ classeId, studentId, origine: "GRUPPO" as const })),
      skipDuplicates: true,
    });
  }
  if (uscite.length) {
    await prisma.classeStudente.deleteMany({ where: { studentId, classeId: { in: uscite } } });
  }

  return { entrate, uscite };
}

const ALFABETO_CODICE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // niente 0/O, 1/I/L: si detta a voce in classe
const LUNGHEZZA_CODICE = 6;

function generaCodice(): string {
  const byte = randomBytes(LUNGHEZZA_CODICE);
  let codice = "";
  for (let i = 0; i < LUNGHEZZA_CODICE; i++) {
    codice += ALFABETO_CODICE[byte[i]! % ALFABETO_CODICE.length];
  }
  return codice;
}

/** Crea una classe a mano, con un codice pronto da consegnare agli
 * studenti, e dichiara che il docente che l'ha creata la insegna. Nasce
 * senza googleGroupEmail: se in seguito arriva un gruppo Google con lo
 * stesso nome, allineaClassi la adotta (risolviClasse) invece di
 * duplicarla. Il codice è unico: in caso di collisione (rarissima, spazio
 * di 33^6 combinazioni) riprova con un codice nuovo invece di fallire. */
export async function creaClasse(
  teacherId: string,
  dati: { nome: string; anno: number | null },
): Promise<Classe> {
  const TENTATIVI_MASSIMI = 5;
  for (let tentativo = 1; ; tentativo++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const classe = await tx.classe.create({
          data: { name: dati.nome, yearLevel: dati.anno, codice: generaCodice() },
        });
        await tx.classeDocente.create({ data: { classeId: classe.id, teacherId } });
        return classe;
      });
    } catch (e) {
      const codiceInUso = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (codiceInUso && tentativo < TENTATIVI_MASSIMI) continue;
      throw e;
    }
  }
}

/** Le classi che un docente ha dichiarato di insegnare, col numero di iscritti. */
export async function classiDelDocente(teacherId: string) {
  const righe = await prisma.classeDocente.findMany({
    where: { teacherId, classe: { archivedAt: null } },
    include: { classe: { include: { _count: { select: { studenti: true } } } } },
    orderBy: { classe: { name: "asc" } },
  });
  return righe.map((r) => ({
    id: r.classe.id,
    name: r.classe.name,
    yearLevel: r.classe.yearLevel,
    studenti: r.classe._count.studenti,
  }));
}

/** Tutte le classi note, per far scegliere al docente quali insegna. */
export async function classiDisponibili() {
  const classi = await prisma.classe.findMany({
    where: { archivedAt: null },
    orderBy: [{ yearLevel: "asc" }, { name: "asc" }],
    select: { id: true, name: true, yearLevel: true },
  });
  return classi;
}

/** Sostituisce l'elenco delle classi insegnate da un docente. */
export async function dichiaraInsegnamento(teacherId: string, classeIds: string[]): Promise<void> {
  await prisma.$transaction([
    prisma.classeDocente.deleteMany({ where: { teacherId, classeId: { notIn: classeIds.length ? classeIds : ["-"] } } }),
    prisma.classeDocente.createMany({
      data: classeIds.map((classeId) => ({ classeId, teacherId })),
      skipDuplicates: true,
    }),
  ]);
}
