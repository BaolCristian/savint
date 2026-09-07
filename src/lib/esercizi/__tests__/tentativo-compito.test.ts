import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { avviaORiprendi } from "../tentativo";
import { seedEsercizi } from "../seed";
import { creaBatteria as creaBatteriaGrezza } from "../batterie";
import { aggiungiEsercizi } from "../contenitori";
import { assegna } from "../compiti";

// Stesso schema del file gemello `tentativo.test.ts`: prefisso proprio per
// non toccare le righe seminate da altri file di test eseguiti in parallelo
// sulle stesse tabelle.
const PREFIX = "tenttestc-";
const ESERCIZIO_ID = `${PREFIX}equazione-primo-grado`;
const ESERCIZIO_ALTRO_ID = `${PREFIX}altro`;

// `creaBatteria` (Fix round finale, item 5) rifiuta esplicitamente invece di
// lanciare: qui la si vuole sempre riuscita, quindi si spacchetta o si lancia.
async function creaBatteria(...args: Parameters<typeof creaBatteriaGrezza>) {
  const r = await creaBatteriaGrezza(...args);
  if (!r.ok) throw new Error(`creaBatteria rifiutata inaspettatamente: ${r.motivo}`);
  return r;
}

let teacherId: string;
let studentId: string;
let classeId: string;
let compitoId: string;

async function pulisci() {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: PREFIX } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: PREFIX } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { startsWith: PREFIX } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: PREFIX } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: PREFIX } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: PREFIX } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: PREFIX } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeEach(async () => {
  await pulisci();

  teacherId = (await prisma.user.create({
    data: { email: `${PREFIX}doc@test.it`, name: "D", role: "TEACHER" },
  })).id;
  studentId = (await prisma.user.create({
    data: { email: `${PREFIX}stu@test.it`, name: "S", role: "STUDENT" },
  })).id;

  const dir = mkdtempSync(path.join(tmpdir(), "tenttestc-"));
  const originale = readFileSync(
    path.resolve(process.cwd(), "content/esercizi/01-equazione-primo-grado.json"),
    "utf8",
  );
  writeFileSync(path.join(dir, `${ESERCIZIO_ID}.json`), originale);
  await seedEsercizi(dir);

  // Un secondo esercizio reale, MAI messo in nessun contenitore: serve solo
  // a dimostrare che aprirlo con un `compitoId` vero (ma di un'altra
  // pesca) non lo fa contare come consegna di quel compito (Fix round
  // finale, item 1).
  const altro = await prisma.esercizio.create({
    data: { id: ESERCIZIO_ALTRO_ID, title: "Altro", yearLevel: 2, topic: "prova", tags: [], difficulty: 1 },
  });
  await prisma.esercizioVersione.create({
    data: { esercizioId: altro.id, version: 1, content: { testo: "altro" }, hash: "hash-altro" },
  });

  const classe = await prisma.classe.create({
    data: { googleGroupEmail: `${PREFIX}classe@scuola.it`, name: "Classe" },
  });
  classeId = classe.id;
  await prisma.classeDocente.create({ data: { classeId, teacherId } });
  // Fix round finale, item 1: `compitoApribile` pretende che lo studente sia
  // iscritto ORA alla classe del compito. Prima di questa validazione questa
  // riga non serviva — `avviaORiprendi` scriveva `compitoId` senza
  // controllare niente — ora è necessaria perché il `compitoId` valido usato
  // dai test sotto resti valido.
  await prisma.classeStudente.create({ data: { classeId, studentId } });

  const contenitore = await prisma.contenitore.create({
    data: { name: `${PREFIX}Cont`, createdById: teacherId },
  });
  await aggiungiEsercizi(contenitore.id, [ESERCIZIO_ID]);

  const batteria = await creaBatteria(teacherId, `${PREFIX}Batt`, [{ contenitoreId: contenitore.id, count: 1 }]);
  const r = await assegna(batteria.id, classeId, teacherId);
  if (!r.ok) throw new Error("assegnazione fallita nel setup del test");
  compitoId = r.compitoId;
});

afterAll(pulisci);

describe("avviaORiprendi con un compito", () => {
  it("un tentativo aperto da un compito lo registra", async () => {
    const t = await avviaORiprendi(studentId, ESERCIZIO_ID, compitoId);
    const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t!.tentativoId } });
    expect(riga.compitoId).toBe(compitoId);
  });

  it("lo stesso esercizio dentro e fuori dal compito sono due tentativi distinti", async () => {
    const dentro = await avviaORiprendi(studentId, ESERCIZIO_ID, compitoId);
    const fuori = await avviaORiprendi(studentId, ESERCIZIO_ID);
    expect(fuori!.tentativoId).not.toBe(dentro!.tentativoId);
    const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: fuori!.tentativoId } });
    expect(riga.compitoId).toBeNull();
  });

  it("riaprire lo stesso esercizio del compito riprende lo stesso tentativo", async () => {
    const a = await avviaORiprendi(studentId, ESERCIZIO_ID, compitoId);
    const b = await avviaORiprendi(studentId, ESERCIZIO_ID, compitoId);
    expect(b!.tentativoId).toBe(a!.tentativoId);
    expect(b!.seed).toBe(a!.seed);
  });

  // Fix round finale, item 1 (prima metà — "valida all'ingresso"). Il
  // committente ha dimostrato che il link nella home dello studente è
  // letteralmente `?compitoId=...`: senza validazione, un `compitoId`
  // qualunque — di un'altra classe, non ancora aperto, o abbinato a un
  // esercizio che quel compito non ha mai pescato — veniva scritto sul
  // tentativo così com'era. Scelta esplicita (vedi il commento nel
  // dominio): un `compitoId` che fallisce la validazione non fa fallire la
  // pagina, la apre come esercizio LIBERO — il tentativo va scritto con
  // `compitoId: null`, mai col valore rifiutato.
  describe("un compitoId non valido viene ignorato, non scritto", () => {
    it("un compitoId che non esiste non viene scritto sul tentativo", async () => {
      const t = await avviaORiprendi(studentId, ESERCIZIO_ID, "non-esiste-questo-compito");
      const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t!.tentativoId } });
      // Prima del fix: `riga.compitoId` valeva "non-esiste-questo-compito".
      expect(riga.compitoId).toBeNull();
    });

    it("un compitoId di una classe in cui lo studente non è iscritto non viene scritto", async () => {
      // Una seconda classe, insegnata dallo stesso docente, con lo stesso
      // esercizio assegnato — ma lo studente di questo file non ci è mai
      // stato iscritto.
      const classeAltra = await prisma.classe.create({
        data: { googleGroupEmail: `${PREFIX}altra@scuola.it`, name: "Altra" },
      });
      await prisma.classeDocente.create({ data: { classeId: classeAltra.id, teacherId } });
      const contAltro = await prisma.contenitore.create({
        data: { name: `${PREFIX}ContAltro`, createdById: teacherId },
      });
      await aggiungiEsercizi(contAltro.id, [ESERCIZIO_ID]);
      const battAltra = await creaBatteria(teacherId, `${PREFIX}BattAltra`, [{ contenitoreId: contAltro.id, count: 1 }]);
      const rAltra = await assegna(battAltra.id, classeAltra.id, teacherId);
      if (!rAltra.ok) throw new Error("assegnazione fallita nel setup del test");

      const t = await avviaORiprendi(studentId, ESERCIZIO_ID, rAltra.compitoId);
      const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t!.tentativoId } });
      // Prima del fix: `riga.compitoId` valeva `rAltra.compitoId` — uno
      // studente poteva accreditarsi il compito di una classe che non è
      // la sua, semplicemente scrivendo l'id nell'URL.
      expect(riga.compitoId).toBeNull();
    });

    it("un compitoId vero abbinato a un esercizio mai pescato da quel compito non viene scritto", async () => {
      // `compitoId` è quello vero, valido, dello studente — ma l'esercizio
      // che sta aprendo non è fra quelli che QUEL compito ha pescato
      // (`ESERCIZIO_ALTRO_ID` non è mai stato messo in un contenitore).
      const t = await avviaORiprendi(studentId, ESERCIZIO_ALTRO_ID, compitoId);
      const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t!.tentativoId } });
      // Prima del fix: `riga.compitoId` valeva `compitoId` — un esercizio
      // estraneo poteva comunque contare come consegna del compito.
      expect(riga.compitoId).toBeNull();
    });

    it("un compito non ancora aperto (opensAt futuro) non scrive il proprio compitoId", async () => {
      const contFuturo = await prisma.contenitore.create({
        data: { name: `${PREFIX}ContFuturo`, createdById: teacherId },
      });
      await aggiungiEsercizi(contFuturo.id, [ESERCIZIO_ID]);
      const battFuturo = await creaBatteria(teacherId, `${PREFIX}BattFuturo`, [{ contenitoreId: contFuturo.id, count: 1 }]);
      const rFuturo = await assegna(battFuturo.id, classeId, teacherId, {
        opensAt: new Date(Date.now() + 7 * 86_400_000),
      });
      if (!rFuturo.ok) throw new Error("assegnazione fallita nel setup del test");

      const t = await avviaORiprendi(studentId, ESERCIZIO_ID, rFuturo.compitoId);
      const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t!.tentativoId } });
      expect(riga.compitoId).toBeNull();
    });

    it("l'esercizio resta comunque apribile come libero quando il compitoId è respinto", async () => {
      const t = await avviaORiprendi(studentId, ESERCIZIO_ALTRO_ID, compitoId);
      // Scelta esplicita (vedi il dominio): il rifiuto del compitoId non
      // rifiuta la PAGINA, apre l'esercizio come libero — `t` non è `null`.
      expect(t).not.toBeNull();
      expect(t!.content).toBeTruthy();
    });
  });
});
