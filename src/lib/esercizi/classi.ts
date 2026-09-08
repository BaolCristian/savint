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

// Alfabeto dichiarato come costante (§ brief task 2): il codice si detta a
// voce in classe o si scrive alla lavagna, quindi esclude ciò che si
// confonde leggendo o ascoltando — O/0, I/1, S/5 — e nient'altro (L resta,
// non è nella lista delle coppie ambigue del brief). 30 caratteri (26
// lettere - 3, 10 cifre - 3) su 6 posizioni: 30^6 combinazioni, ~729
// milioni.
export const ALFABETO_CODICE = "ABCDEFGHJKLMNPQRTUVWXYZ2346789";
const LUNGHEZZA_CODICE = 6;

export function generaCodice(): string {
  const byte = randomBytes(LUNGHEZZA_CODICE);
  let codice = "";
  for (let i = 0; i < LUNGHEZZA_CODICE; i++) {
    codice += ALFABETO_CODICE[byte[i]! % ALFABETO_CODICE.length];
  }
  return codice;
}

/** Crea una classe a mano, con un codice pronto da consegnare agli
 * studenti, e dichiara che il docente che l'ha creata la insegna: è
 * l'unico modo in cui compare nel suo elenco (classiDelDocente) — altrimenti
 * la creerebbe e non la vedrebbe più. Nasce senza googleGroupEmail: se in
 * seguito arriva un gruppo Google con lo stesso nome, allineaClassi la
 * adotta (risolviClasse) invece di duplicarla.
 *
 * Rifiuta con nome_gia_usato se esiste già una classe ATTIVA (non
 * archiviata) con lo stesso nome, qualunque sia la sua origine: due classi
 * omonime confonderebbero il docente nell'elenco e gli studenti su quale
 * codice usare. Una classe archiviata con lo stesso nome non blocca — è
 * verosimilmente l'anno scorso. Non c'è un vincolo unico sul nome a
 * livello di schema (il task 1 non lo aggiunge, ed è comunque tollerato
 * altrove: due gruppi Google possono condividere un nome, vedi
 * classi.test.ts), quindi questo controllo resta un pre-check applicativo,
 * non atomico contro una vera corsa fra due creazioni con lo stesso nome —
 * a differenza del codice, il nome non ha un indice unico su cui
 * riprovare.
 *
 * Il codice invece È unico nello schema: in caso di collisione (rarissima,
 * spazio di 30^6 combinazioni) riprova con un codice nuovo invece di
 * fallire — vedi classi-collisione-codice.test.ts, che la forza
 * deterministicamente mockando $transaction invece di sperare in una vera
 * corsa. */
export async function creaClasse(
  teacherId: string,
  dati: { nome: string; anno: number | null },
): Promise<
  | { ok: true; classe: { id: string; nome: string; codice: string } }
  | { ok: false; motivo: "nome_gia_usato" }
> {
  const doppione = await prisma.classe.findFirst({ where: { name: dati.nome, archivedAt: null } });
  if (doppione) return { ok: false, motivo: "nome_gia_usato" };

  const TENTATIVI_MASSIMI = 5;
  for (let tentativo = 1; ; tentativo++) {
    try {
      const classe = await prisma.$transaction(async (tx) => {
        const c = await tx.classe.create({
          data: { name: dati.nome, yearLevel: dati.anno, codice: generaCodice() },
        });
        await tx.classeDocente.create({ data: { classeId: c.id, teacherId } });
        return c;
      });
      return { ok: true, classe: { id: classe.id, nome: classe.name, codice: classe.codice! } };
    } catch (e) {
      const codiceInUso = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (codiceInUso && tentativo < TENTATIVI_MASSIMI) continue;
      throw e;
    }
  }
}

type MotivoAccessoClasse = "non_trovata" | "non_insegni_questa_classe";

/** Condivisa da rigeneraCodice e iscrittiDellaClasse: entrambe agiscono su
 * una classe specifica per conto di un docente, ed entrambe devono
 * rifiutare allo stesso modo — prima se la classe non esiste, poi se chi
 * chiama non la insegna — un docente che prova ad agire su una classe che
 * non è sua. */
async function verificaInsegnaClasse(
  classeId: string,
  teacherId: string,
): Promise<{ ok: true } | { ok: false; motivo: MotivoAccessoClasse }> {
  const classe = await prisma.classe.findUnique({ where: { id: classeId } });
  if (!classe) return { ok: false, motivo: "non_trovata" };

  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId, teacherId } },
  });
  if (!insegna) return { ok: false, motivo: "non_insegni_questa_classe" };

  return { ok: true };
}

/** Sostituisce il codice di una classe con uno nuovo: chiude la porta al
 * vecchio codice (chi non l'ha ancora usato non può più iscriversi con
 * quello) senza toccare le righe ClasseStudente già scritte — non è un
 * update su quella tabella, è un update sulla sola colonna `codice` di
 * Classe, quindi non c'è niente da cui gli iscritti potrebbero venire
 * espulsi. È la garanzia per cui rigenerare è sicuro da offrire: chiude
 * una porta, non sfratta la classe (vedi classi.test.ts, che conta gli
 * iscritti prima e dopo). Stessa disciplina di ritentativo di creaClasse
 * sulla stessa collisione, rarissima ma possibile, di codice. */
export async function rigeneraCodice(
  classeId: string,
  teacherId: string,
): Promise<{ ok: true; codice: string } | { ok: false; motivo: MotivoAccessoClasse }> {
  const autorizzato = await verificaInsegnaClasse(classeId, teacherId);
  if (!autorizzato.ok) return autorizzato;

  const TENTATIVI_MASSIMI = 5;
  for (let tentativo = 1; ; tentativo++) {
    try {
      const aggiornata = await prisma.classe.update({
        where: { id: classeId },
        data: { codice: generaCodice() },
      });
      return { ok: true, codice: aggiornata.codice! };
    } catch (e) {
      const codiceInUso = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
      if (codiceInUso && tentativo < TENTATIVI_MASSIMI) continue;
      throw e;
    }
  }
}

/** Iscrive uno studente con il codice della classe: il codice si scrive a
 * mano da un ragazzo, quindi il confronto ignora maiuscole/minuscole e gli
 * spazi ai bordi che una battitura distratta introduce (i codici generati
 * sono sempre in maiuscolo — vedi ALFABETO_CODICE — quindi normalizzare
 * l'input in maiuscolo basta, non serve un confronto case-insensitive lato
 * database). Una classe archiviata non si trova per codice: non è più
 * insegnata, non deve accettare nuove iscrizioni.
 *
 * L'iscrizione nasce con origine CODICE — è ciò che la protegge da
 * allineaClassi: un sync Google successivo non la tocca mai (vedi il
 * commento su allineaClassi più sopra). Se lo studente è già iscritto a
 * quella classe (con qualunque origine: il vincolo è la coppia
 * classeId+studentId, non l'origine) il tentativo urta il vincolo unico
 * della tabella e diventa un rifiuto, non una doppia riga né un
 * cambiamento silenzioso dell'origine esistente. */
export async function iscrivitiConCodice(
  studentId: string,
  codice: string,
): Promise<
  | { ok: true; classe: { id: string; nome: string } }
  | { ok: false; motivo: "codice_sconosciuto" | "gia_iscritto" }
> {
  const normalizzato = codice.trim().toUpperCase();
  const classe = await prisma.classe.findFirst({ where: { codice: normalizzato, archivedAt: null } });
  if (!classe) return { ok: false, motivo: "codice_sconosciuto" };

  try {
    await prisma.classeStudente.create({
      data: { classeId: classe.id, studentId, origine: "CODICE" },
    });
  } catch (e) {
    const giaIscritto = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
    if (giaIscritto) return { ok: false, motivo: "gia_iscritto" };
    throw e;
  }

  return { ok: true, classe: { id: classe.id, nome: classe.name } };
}

/** L'elenco degli iscritti di una classe, per il docente che la insegna. */
export async function iscrittiDellaClasse(
  classeId: string,
  teacherId: string,
): Promise<
  | { ok: true; righe: { studentId: string; nome: string | null; origine: "GRUPPO" | "CODICE"; dal: Date }[] }
  | { ok: false; motivo: MotivoAccessoClasse }
> {
  const autorizzato = await verificaInsegnaClasse(classeId, teacherId);
  if (!autorizzato.ok) return autorizzato;

  const iscrizioni = await prisma.classeStudente.findMany({
    where: { classeId },
    include: { studente: true },
    orderBy: { joinedAt: "asc" },
  });

  return {
    ok: true,
    righe: iscrizioni.map((i) => ({
      studentId: i.studentId,
      nome: i.studente.name,
      origine: i.origine,
      dal: i.joinedAt,
    })),
  };
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
