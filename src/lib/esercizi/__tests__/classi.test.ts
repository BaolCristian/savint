import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { allineaClassi, classiDelDocente, creaClasse, dichiaraInsegnamento } from "../classi";

const P = "classitest-";
const email = (n: string) => `${P}${n}@test.it`;
let studentId: string;
let teacherId: string;

const g = (slug: string, nome: string, anno: number | null) => ({ email: `${P}${slug}@scuola.it`, name: nome, yearLevel: anno });

// Le classi create a mano non hanno un googleGroupEmail da filtrare: la
// pulizia deve prendere anche loro, per nome, restando comunque scoped al
// prefisso di questo file (mai un deleteMany su tutta la tabella).
const filtroClassiTest = { OR: [{ googleGroupEmail: { startsWith: P } }, { name: { startsWith: P } }] };

beforeEach(async () => {
  await prisma.classeStudente.deleteMany({ where: { classe: filtroClassiTest } });
  await prisma.classeDocente.deleteMany({ where: { classe: filtroClassiTest } });
  await prisma.classe.deleteMany({ where: filtroClassiTest });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  studentId = (await prisma.user.create({ data: { email: email("s"), name: "S", role: "STUDENT" } })).id;
  teacherId = (await prisma.user.create({ data: { email: email("d"), name: "D", role: "TEACHER" } })).id;
});

describe("allineamento delle classi", () => {
  it("il primo accesso crea la classe e iscrive", async () => {
    const r = await allineaClassi(studentId, [g("2a", "2A", 2)]);
    expect(r.entrate).toHaveLength(1);
    expect(r.uscite).toHaveLength(0);
    const c = await prisma.classe.findUnique({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    expect(c?.name).toBe("2A");
    expect(c?.yearLevel).toBe(2);
  });

  it("un secondo accesso con gli stessi gruppi non cambia niente", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const r = await allineaClassi(studentId, [g("2a", "2A", 2)]);
    expect(r).toEqual({ entrate: [], uscite: [] });
    expect(await prisma.classe.count({ where: { googleGroupEmail: { startsWith: P } } })).toBe(1);
  });

  it("un gruppo nuovo iscrive, uno perso disiscrive", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const r = await allineaClassi(studentId, [g("3b", "3B", 3)]);
    expect(r.entrate).toHaveLength(1);
    expect(r.uscite).toHaveLength(1);
    const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, include: { classe: true } });
    expect(iscrizioni.map((i) => i.classe.name)).toEqual(["3B"]);
  });

  it("la classe resta anche quando l'ultimo studente esce", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    await allineaClassi(studentId, []);
    expect(await prisma.classe.count({ where: { googleGroupEmail: `${P}2a@scuola.it` } })).toBe(1);
  });

  it("un gruppo che cambia nome aggiorna la classe senza crearne una nuova", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    await allineaClassi(studentId, [g("2a", "2A Nuova", 2)]);
    expect(await prisma.classe.count({ where: { googleGroupEmail: { startsWith: P } } })).toBe(1);
    const c = await prisma.classe.findUnique({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    expect(c?.name).toBe("2A Nuova");
  });

  it("il docente dichiara le classi che insegna e le rivede col conteggio degli studenti", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const c = await prisma.classe.findUniqueOrThrow({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    await dichiaraInsegnamento(teacherId, [c.id]);
    const mie = await classiDelDocente(teacherId);
    expect(mie).toHaveLength(1);
    expect(mie[0]!.name).toBe("2A");
    expect(mie[0]!.studenti).toBe(1);
  });

  it("dichiarare di nuovo sostituisce l'elenco invece di accumularlo", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2), g("3b", "3B", 3)]);
    const tutte = await prisma.classe.findMany({ where: { googleGroupEmail: { startsWith: P } } });
    await dichiaraInsegnamento(teacherId, tutte.map((c) => c.id));
    await dichiaraInsegnamento(teacherId, [tutte[0]!.id]);
    expect(await classiDelDocente(teacherId)).toHaveLength(1);
  });

  // la regressione da non introdurre: le iscrizioni da gruppo restano quelle
  // che il sync toglie quando il gruppo sparisce (copre lo stesso percorso
  // di "un gruppo nuovo iscrive, uno perso disiscrive" sopra, ma lo nomina
  // esplicitamente perché è la garanzia che il fix del Problema 1 non deve
  // rompere).
  it("le iscrizioni da gruppo continuano a essere tolte quando il gruppo sparisce", async () => {
    await allineaClassi(studentId, [g("2a", "2A", 2)]);
    const primaClasse = await prisma.classe.findUniqueOrThrow({ where: { googleGroupEmail: `${P}2a@scuola.it` } });
    const primaIscrizione = await prisma.classeStudente.findUniqueOrThrow({
      where: { classeId_studentId: { classeId: primaClasse.id, studentId } },
    });
    expect(primaIscrizione.origine).toBe("GRUPPO");

    const r = await allineaClassi(studentId, [g("3b", "3B", 3)]);
    expect(r.uscite).toEqual([primaClasse.id]);
    const rimasta = await prisma.classeStudente.findUnique({
      where: { classeId_studentId: { classeId: primaClasse.id, studentId } },
    });
    expect(rimasta).toBeNull();
  });

  it("un accesso Google NON disiscrive chi si era iscritto col codice", async () => {
    const classeACodice = await creaClasse(teacherId, { nome: `${P}Corso extra`, anno: null });
    await prisma.classeStudente.create({
      data: { classeId: classeACodice.id, studentId, origine: "CODICE" },
    });

    const r = await allineaClassi(studentId, [g("3b", "3B", 3)]);
    expect(r.uscite).not.toContain(classeACodice.id);

    const ancora = await prisma.classeStudente.findUnique({
      where: { classeId_studentId: { classeId: classeACodice.id, studentId } },
    });
    expect(ancora).not.toBeNull(); // fallisce oggi: viene cancellata
    expect(ancora!.origine).toBe("CODICE");
  });

  it("un gruppo che ha lo stesso nome di una classe creata a mano la adotta", async () => {
    const nome = `${P}2A`;
    const emailGruppo = `${P}allievi.2a@scuola.it`;
    const aMano = await creaClasse(teacherId, { nome, anno: 2 });

    await allineaClassi(studentId, [{ email: emailGruppo, name: nome, yearLevel: 2 }]);

    const classi = await prisma.classe.findMany({ where: { name: nome } });
    expect(classi).toHaveLength(1); // non due
    expect(classi[0]!.id).toBe(aMano.id);
    expect(classi[0]!.googleGroupEmail).toBe(emailGruppo);
  });

  it("l'adozione non tocca una classe già legata a un gruppo, anche se il nome coincide", async () => {
    // Due gruppi diversi che finiscono per condividere il nome "2A" (caso
    // limite, ma il divieto è esplicito nella spec): il secondo non deve
    // rubare l'indirizzo né fondersi con il primo.
    const nome = `${P}2A`;
    await allineaClassi(studentId, [{ email: `${P}prima@scuola.it`, name: nome, yearLevel: 2 }]);
    const primaClasse = await prisma.classe.findUniqueOrThrow({ where: { googleGroupEmail: `${P}prima@scuola.it` } });

    await allineaClassi(studentId, [{ email: `${P}seconda@scuola.it`, name: nome, yearLevel: 2 }]);

    const classi = await prisma.classe.findMany({ where: { name: nome } });
    expect(classi).toHaveLength(2);
    const invariata = classi.find((c) => c.id === primaClasse.id);
    expect(invariata?.googleGroupEmail).toBe(`${P}prima@scuola.it`);
  });

  it("Postgres ammette più righe con lo stesso valore nullo negli indici unici di googleGroupEmail e codice", async () => {
    // Non darlo per scontato (§ brief): due classi da gruppo hanno entrambe
    // codice nullo, due classi a mano hanno entrambe googleGroupEmail
    // nullo. Se l'indice unico trattasse i NULL come uguali fra loro, la
    // seconda create fallirebbe con un P2002.
    await allineaClassi(studentId, [g("2a", "2A", 2), g("3b", "3B", 3)]);
    const daGruppo = await prisma.classe.findMany({ where: { googleGroupEmail: { startsWith: P } } });
    expect(daGruppo).toHaveLength(2);
    expect(daGruppo.every((c) => c.codice === null)).toBe(true);

    const manoA = await creaClasse(teacherId, { nome: `${P}Mano A`, anno: null });
    const manoB = await creaClasse(teacherId, { nome: `${P}Mano B`, anno: null });
    expect(manoA.googleGroupEmail).toBeNull();
    expect(manoB.googleGroupEmail).toBeNull();
  });
});
