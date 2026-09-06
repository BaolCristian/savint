import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { prisma } from "@/lib/db/client";
import { avviaORiprendi } from "../tentativo";
import { seedEsercizi } from "../seed";
import { creaBatteria } from "../batterie";
import { aggiungiEsercizi } from "../contenitori";
import { assegna } from "../compiti";

// Stesso schema del file gemello `tentativo.test.ts`: prefisso proprio per
// non toccare le righe seminate da altri file di test eseguiti in parallelo
// sulle stesse tabelle.
const PREFIX = "tenttestc-";
const ESERCIZIO_ID = `${PREFIX}equazione-primo-grado`;

let studentId: string;
let compitoId: string;

async function pulisci() {
  await prisma.tentativo.deleteMany({ where: { student: { email: { startsWith: PREFIX } } } });
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: PREFIX } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { startsWith: PREFIX } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: PREFIX } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: PREFIX } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: PREFIX } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
}

beforeEach(async () => {
  await pulisci();

  const teacher = await prisma.user.create({
    data: { email: `${PREFIX}doc@test.it`, name: "D", role: "TEACHER" },
  });
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

  const classe = await prisma.classe.create({
    data: { googleGroupEmail: `${PREFIX}classe@scuola.it`, name: "Classe" },
  });
  await prisma.classeDocente.create({ data: { classeId: classe.id, teacherId: teacher.id } });

  const contenitore = await prisma.contenitore.create({
    data: { name: `${PREFIX}Cont`, createdById: teacher.id },
  });
  await aggiungiEsercizi(contenitore.id, [ESERCIZIO_ID]);

  const batteria = await creaBatteria(teacher.id, `${PREFIX}Batt`, [{ contenitoreId: contenitore.id, count: 1 }]);
  const r = await assegna(batteria.id, classe.id, teacher.id);
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
});
