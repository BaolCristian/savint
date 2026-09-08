import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  ALFABETO_CODICE, allineaClassi, classiDelDocente, creaClasse as creaClasseGrezza,
  dichiaraInsegnamento, generaCodice, iscrittiDellaClasse, iscrivitiConCodice, rigeneraCodice,
} from "../classi";

// Scorciatoia per i test (già di task 1) scritti quando creaClasse
// restituiva la Classe direttamente: ora rifiuta esplicitamente
// (`nome_gia_usato`), quindi la maggior parte dei chiamanti che non
// riguarda quel rifiuto vuole solo la classe creata, sullo stesso modello
// di `creaBatteria`/`righeDi` in compiti.test.ts.
async function creaClasse(...args: Parameters<typeof creaClasseGrezza>) {
  const r = await creaClasseGrezza(...args);
  if (!r.ok) throw new Error(`creaClasse rifiutata inaspettatamente: ${r.motivo}`);
  return r.classe;
}

const P = "classitest-";
const email = (n: string) => `${P}${n}@test.it`;
let studentId: string;
let teacherId: string;

const g = (slug: string, nome: string, anno: number | null) => ({ email: `${P}${slug}@scuola.it`, name: nome, yearLevel: anno });

// Le classi create a mano non hanno un googleGroupEmail da filtrare: la
// pulizia deve prendere anche loro, per nome, restando comunque scoped al
// prefisso di questo file (mai un deleteMany su tutta la tabella).
const filtroClassiTest = { OR: [{ googleGroupEmail: { startsWith: P } }, { name: { startsWith: P } }] };

async function pulisci(): Promise<void> {
  await prisma.classeStudente.deleteMany({ where: { classe: filtroClassiTest } });
  await prisma.classeDocente.deleteMany({ where: { classe: filtroClassiTest } });
  await prisma.classe.deleteMany({ where: filtroClassiTest });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

beforeEach(async () => {
  await pulisci();
  studentId = (await prisma.user.create({ data: { email: email("s"), name: "S", role: "STUDENT" } })).id;
  teacherId = (await prisma.user.create({ data: { email: email("d"), name: "D", role: "TEACHER" } })).id;
});

// Senza questo, l'ultimo test del file lascia le sue righe (Classe,
// ClasseStudente, ClasseDocente, User) nel database di sviluppo condiviso
// per sempre: beforeEach pulisce solo PRIMA di ogni test, mai dopo l'ultimo.
// ClasseDocente e ClasseStudente non cadono in cascata dalla sola
// cancellazione di User (cadono da quella di Classe, ma solo se la
// raggiungiamo), quindi pulisci() li cancella esplicitamente lui stesso,
// nell'ordine giusto (figli prima dei genitori).
afterAll(async () => {
  await pulisci();
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
    expect(ancora).not.toBeNull(); // e' cio' che protegge l'iscrizione da codice: senza il filtro
    // sull'origine in allineaClassi, questa riga verrebbe cancellata
    expect(ancora!.origine).toBe("CODICE");
  });

  // Giro di correzioni 1: il test sopra prova la sopravvivenza al sync su
  // una riga inserita a mano (origine: "CODICE" scritta direttamente), e
  // "iscrive lo studente e l'iscrizione ha origine CODICE" (più sotto, nel
  // describe di iscrivitiConCodice) prova che iscrivitiConCodice scrive
  // davvero quell'origine — ma nessun test guidava l'intera catena vera
  // creaClasse -> iscrivitiConCodice -> allineaClassi nello stesso posto.
  // È la garanzia su cui poggia tutta la feature (un'iscrizione con
  // codice non sparisce al prossimo accesso Google dello studente), quindi
  // qui si percorre il cammino reale end-to-end, non due metà incatenate.
  it("il percorso reale — creaClasse poi iscrivitiConCodice — sopravvive a un sync Google successivo", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Percorso reale`, anno: null });
    const iscrizione = await iscrivitiConCodice(studentId, c.codice);
    expect(iscrizione).toEqual({ ok: true, classe: { id: c.id, nome: c.nome } });

    const r = await allineaClassi(studentId, [g("3b", "3B", 3)]);
    expect(r.uscite).not.toContain(c.id);

    const ancora = await prisma.classeStudente.findUnique({
      where: { classeId_studentId: { classeId: c.id, studentId } },
    });
    expect(ancora).not.toBeNull();
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

  it("l'adozione non tocca una classe archiviata, anche se il nome coincide", async () => {
    // Giro di correzioni 1: la query del candidato non escludeva archivedAt.
    // Una classe archiviata è invisibile a classiDelDocente/classiDisponibili
    // (entrambe filtrano archivedAt: null): se l'adozione le scrivesse dentro
    // l'indirizzo di un gruppo vivo, gli studenti di quel gruppo sparirebbero
    // dall'elenco del docente — la stessa disattenzione silenziosa che
    // questo task esiste per evitare, un angolo più in là.
    const nome = `${P}2A archiviata`;
    const aMano = await creaClasse(teacherId, { nome, anno: 2 });
    await prisma.classe.update({ where: { id: aMano.id }, data: { archivedAt: new Date() } });

    const emailGruppo = `${P}allievi.archiviata@scuola.it`;
    await allineaClassi(studentId, [{ email: emailGruppo, name: nome, yearLevel: 2 }]);

    const archiviata = await prisma.classe.findUniqueOrThrow({ where: { id: aMano.id } });
    expect(archiviata.googleGroupEmail).toBeNull(); // non adottata
    expect(archiviata.archivedAt).not.toBeNull();

    const classi = await prisma.classe.findMany({ where: { name: nome } });
    expect(classi).toHaveLength(2); // la vecchia archiviata resta, il gruppo ne crea una nuova
    const nuova = classi.find((c) => c.id !== aMano.id);
    expect(nuova?.googleGroupEmail).toBe(emailGruppo);
  });

  it("due accessi Google concorrenti per un gruppo mai visto prima non si scontrano", async () => {
    // Giro di correzioni 1: il ramo "classe nuova" era un create() nudo,
    // non più l'upsert() atomico originale. Sotto una vera corsa (due
    // studenti della stessa classe nuova che accedono insieme il primo
    // giorno di scuola — proprio lo scenario che questa feature esiste per
    // servire) la seconda risolviClasse() falliva con un P2002 non gestito,
    // propagato grezzo fuori da allineaClassi invece di essere assorbito.
    const altroStudentId = (await prisma.user.create({ data: { email: email("s2"), name: "S2", role: "STUDENT" } })).id;
    const gruppo = g("4c", "4C", 4);

    const risultati = await Promise.all([
      allineaClassi(studentId, [gruppo]),
      allineaClassi(altroStudentId, [gruppo]),
    ]);

    expect(risultati[0]!.entrate).toHaveLength(1);
    expect(risultati[1]!.entrate).toHaveLength(1);

    const classi = await prisma.classe.findMany({ where: { googleGroupEmail: `${P}4c@scuola.it` } });
    expect(classi).toHaveLength(1); // non due, nonostante la corsa

    const iscritti = await prisma.classeStudente.findMany({ where: { classeId: classi[0]!.id } });
    expect(iscritti).toHaveLength(2);
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
    const [righeA, righeB] = await Promise.all([
      prisma.classe.findUniqueOrThrow({ where: { id: manoA.id } }),
      prisma.classe.findUniqueOrThrow({ where: { id: manoB.id } }),
    ]);
    expect(righeA.googleGroupEmail).toBeNull();
    expect(righeB.googleGroupEmail).toBeNull();
  });
});

describe("generaCodice", () => {
  const VIETATI = new Set(["O", "0", "I", "1", "S", "5"]);

  it("l'alfabeto dichiarato non contiene O/0, I/1, S/5: si confondono quando il codice si detta a voce", () => {
    for (const carattere of ALFABETO_CODICE) {
      expect(VIETATI.has(carattere)).toBe(false);
    }
  });

  it("su molte estrazioni, nessun codice contiene mai O/0/I/1/S/5", () => {
    for (let i = 0; i < 500; i++) {
      const codice = generaCodice();
      expect(codice).toHaveLength(6);
      for (const carattere of codice) {
        expect(VIETATI.has(carattere)).toBe(false);
        expect(ALFABETO_CODICE).toContain(carattere);
      }
    }
  });
});

describe("creaClasse", () => {
  it("chi crea la classe la insegna: altrimenti la creerebbe e non la vedrebbe", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Prima creazione`, anno: 1 });
    const mie = await classiDelDocente(teacherId);
    expect(mie.map((m) => m.id)).toContain(c.id);
  });

  it("rifiuta con nome_gia_usato se esiste già una classe attiva con lo stesso nome", async () => {
    const nome = `${P}Doppione`;
    await creaClasse(teacherId, { nome, anno: 1 });
    const esito = await creaClasseGrezza(teacherId, { nome, anno: 1 });
    expect(esito).toEqual({ ok: false, motivo: "nome_gia_usato" });
  });

  it("una classe archiviata con lo stesso nome non blocca una nuova creazione", async () => {
    const nome = `${P}Anno scorso`;
    const vecchia = await creaClasse(teacherId, { nome, anno: 1 });
    await prisma.classe.update({ where: { id: vecchia.id }, data: { archivedAt: new Date() } });

    const esito = await creaClasseGrezza(teacherId, { nome, anno: 1 });
    expect(esito.ok).toBe(true);
  });
});

describe("rigeneraCodice", () => {
  it("non_trovata se la classe non esiste", async () => {
    const esito = await rigeneraCodice("classe-inesistente", teacherId);
    expect(esito).toEqual({ ok: false, motivo: "non_trovata" });
  });

  it("non_insegni_questa_classe se il docente non la insegna", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Non tua`, anno: null });
    const altroDocenteId = (await prisma.user.create({ data: { email: email("altro-doc"), name: "Altro", role: "TEACHER" } })).id;
    const esito = await rigeneraCodice(c.id, altroDocenteId);
    expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
  });

  it("cambia il codice e non tocca gli iscritti: li conta prima e dopo", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Da rigenerare`, anno: null });
    const primaIscrizione = await iscrivitiConCodice(studentId, c.codice);
    if (!primaIscrizione.ok) throw new Error("iscrizione inaspettatamente rifiutata");

    const primaConteggio = await prisma.classeStudente.count({ where: { classeId: c.id } });
    expect(primaConteggio).toBe(1);

    const esito = await rigeneraCodice(c.id, teacherId);
    expect(esito.ok).toBe(true);
    if (!esito.ok) throw new Error("rigenerazione inaspettatamente rifiutata");
    expect(esito.codice).not.toBe(c.codice);

    const dopoConteggio = await prisma.classeStudente.count({ where: { classeId: c.id } });
    expect(dopoConteggio).toBe(primaConteggio);

    const iscrizioneAncora = await prisma.classeStudente.findUnique({
      where: { classeId_studentId: { classeId: c.id, studentId } },
    });
    expect(iscrizioneAncora).not.toBeNull();

    // il vecchio codice non porta più da nessuna parte, il nuovo sì
    const conVecchio = await iscrivitiConCodice(
      (await prisma.user.create({ data: { email: email("s3"), name: "S3", role: "STUDENT" } })).id,
      c.codice,
    );
    expect(conVecchio).toEqual({ ok: false, motivo: "codice_sconosciuto" });
  });
});

describe("iscrivitiConCodice", () => {
  it("codice_sconosciuto se il codice non corrisponde a nessuna classe", async () => {
    const esito = await iscrivitiConCodice(studentId, "ZZZZZZ");
    expect(esito).toEqual({ ok: false, motivo: "codice_sconosciuto" });
  });

  it("iscrive lo studente e l'iscrizione ha origine CODICE: è ciò che la protegge dal sync", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Iscrizione codice`, anno: null });
    const esito = await iscrivitiConCodice(studentId, c.codice);
    expect(esito).toEqual({ ok: true, classe: { id: c.id, nome: c.nome } });

    const riga = await prisma.classeStudente.findUniqueOrThrow({
      where: { classeId_studentId: { classeId: c.id, studentId } },
    });
    expect(riga.origine).toBe("CODICE");
  });

  it("confronta senza distinzione di maiuscole/minuscole e ignora gli spazi ai bordi", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Codice a mano`, anno: null });
    const digitato = `  ${c.codice.toLowerCase()}  `;
    const esito = await iscrivitiConCodice(studentId, digitato);
    expect(esito).toEqual({ ok: true, classe: { id: c.id, nome: c.nome } });
  });

  it("gia_iscritto se lo studente prova a iscriversi di nuovo con lo stesso codice", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Doppia iscrizione`, anno: null });
    await iscrivitiConCodice(studentId, c.codice);
    const esito = await iscrivitiConCodice(studentId, c.codice);
    expect(esito).toEqual({ ok: false, motivo: "gia_iscritto" });

    const righe = await prisma.classeStudente.count({ where: { classeId: c.id, studentId } });
    expect(righe).toBe(1); // non due
  });

  it("una classe archiviata non si trova per codice: non accetta nuove iscrizioni", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Archiviata codice`, anno: null });
    await prisma.classe.update({ where: { id: c.id }, data: { archivedAt: new Date() } });
    const esito = await iscrivitiConCodice(studentId, c.codice);
    expect(esito).toEqual({ ok: false, motivo: "codice_sconosciuto" });
  });
});

describe("iscrittiDellaClasse", () => {
  it("non_trovata se la classe non esiste", async () => {
    const esito = await iscrittiDellaClasse("classe-inesistente", teacherId);
    expect(esito).toEqual({ ok: false, motivo: "non_trovata" });
  });

  it("non_insegni_questa_classe se il docente non la insegna", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Elenco non tuo`, anno: null });
    const altroDocenteId = (await prisma.user.create({ data: { email: email("altro-doc2"), name: "Altro2", role: "TEACHER" } })).id;
    const esito = await iscrittiDellaClasse(c.id, altroDocenteId);
    expect(esito).toEqual({ ok: false, motivo: "non_insegni_questa_classe" });
  });

  it("elenca gli iscritti con nome, origine e data", async () => {
    const c = await creaClasse(teacherId, { nome: `${P}Elenco`, anno: null });
    await iscrivitiConCodice(studentId, c.codice);

    const esito = await iscrittiDellaClasse(c.id, teacherId);
    expect(esito.ok).toBe(true);
    if (!esito.ok) throw new Error("elenco inaspettatamente rifiutato");
    expect(esito.righe).toHaveLength(1);
    expect(esito.righe[0]).toMatchObject({ studentId, nome: "S", origine: "CODICE" });
    expect(esito.righe[0]!.dal).toBeInstanceOf(Date);
  });
});
