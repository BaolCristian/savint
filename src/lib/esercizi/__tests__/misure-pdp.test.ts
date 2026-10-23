import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  MISURE_VUOTE, haMisure, misureDellaClasse, misurePdpSchema, salvaMisurePdp,
} from "../misure-pdp";

// Prefisso di questo file: ogni riga creata qui (utenti e classi) lo porta,
// e la pulizia resta sempre ristretta a quel prefisso — mai un deleteMany
// su tutta una tabella del database di sviluppo condiviso.
const P = "misurepdptest-";
const email = (n: string) => `${P}${n}@test.it`;

let classeId: string;
let docenteId: string;
let collegaId: string;
let adminId: string;
let iscrittoId: string;
let esternoId: string;

const docente = () => ({ id: docenteId, admin: false });
const collega = () => ({ id: collegaId, admin: false });
const admin = () => ({ id: adminId, admin: true });

const PIENE = { tempoExtraPct: 30, menoEsercizi: true, calcolatrice: true, formulario: false };

// MisurePdp, ClasseStudente e ClasseDocente cadono in cascata dalla Classe
// e dagli utenti: basta cancellare questi due, nell'ordine giusto.
async function pulisci(): Promise<void> {
  await prisma.classe.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
}

beforeEach(async () => {
  await pulisci();
  const utente = async (n: string, role: "TEACHER" | "STUDENT" | "ADMIN") =>
    (await prisma.user.create({ data: { email: email(n), name: n, role } })).id;
  docenteId = await utente("docente", "TEACHER");
  collegaId = await utente("collega", "TEACHER");
  adminId = await utente("admin", "ADMIN");
  iscrittoId = await utente("iscritto", "STUDENT");
  esternoId = await utente("esterno", "STUDENT");
  classeId = (await prisma.classe.create({ data: { name: `${P}1A` } })).id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: docenteId } });
  await prisma.classeStudente.create({ data: { classeId, studentId: iscrittoId, origine: "CODICE" } });
});

afterAll(async () => {
  await pulisci();
});

describe("misurePdpSchema e haMisure", () => {
  it("accetta un tempo supplementare intero da 0 a 100 e tre spunte", () => {
    expect(misurePdpSchema.safeParse(PIENE).success).toBe(true);
    expect(misurePdpSchema.safeParse({ ...PIENE, tempoExtraPct: 100 }).success).toBe(true);
  });

  it("rifiuta un tempo supplementare oltre 100, negativo o non intero", () => {
    expect(misurePdpSchema.safeParse({ ...PIENE, tempoExtraPct: 101 }).success).toBe(false);
    expect(misurePdpSchema.safeParse({ ...PIENE, tempoExtraPct: -1 }).success).toBe(false);
    expect(misurePdpSchema.safeParse({ ...PIENE, tempoExtraPct: 12.5 }).success).toBe(false);
  });

  it("le misure vuote non sono misure", () => {
    expect(MISURE_VUOTE).toEqual({ tempoExtraPct: 0, menoEsercizi: false, calcolatrice: false, formulario: false });
    expect(haMisure(MISURE_VUOTE)).toBe(false);
    expect(haMisure({ ...MISURE_VUOTE, formulario: true })).toBe(true);
    expect(haMisure({ ...MISURE_VUOTE, tempoExtraPct: 15 })).toBe(true);
  });
});

describe("misure PDP della classe", () => {
  it("il docente della classe salva e rilegge le misure di un iscritto", async () => {
    expect(await salvaMisurePdp(classeId, iscrittoId, docente(), PIENE)).toEqual({ ok: true });
    const mappa = await misureDellaClasse(classeId, docente());
    expect(mappa).not.toBeNull();
    expect([...mappa!.entries()]).toEqual([[iscrittoId, PIENE]]);
  });

  it("un secondo salvataggio sostituisce il primo", async () => {
    await salvaMisurePdp(classeId, iscrittoId, docente(), PIENE);
    const nuove = { ...MISURE_VUOTE, tempoExtraPct: 50 };
    await salvaMisurePdp(classeId, iscrittoId, docente(), nuove);
    expect((await misureDellaClasse(classeId, docente()))!.get(iscrittoId)).toEqual(nuove);
  });

  it("un collega che non insegna la classe non legge e non scrive niente", async () => {
    expect(await misureDellaClasse(classeId, collega())).toBeNull();
    expect(await salvaMisurePdp(classeId, iscrittoId, collega(), PIENE)).toEqual({ ok: false, motivo: "non_trovata" });
    expect(await prisma.misurePdp.count({ where: { classeId } })).toBe(0);
  });

  it("una classe che non esiste è non_trovata", async () => {
    expect(await misureDellaClasse(`${P}inesistente`, docente())).toBeNull();
    expect(await salvaMisurePdp(`${P}inesistente`, iscrittoId, docente(), PIENE))
      .toEqual({ ok: false, motivo: "non_trovata" });
  });

  it("un ADMIN che non insegna la classe può leggere e salvare", async () => {
    expect(await salvaMisurePdp(classeId, iscrittoId, admin(), PIENE)).toEqual({ ok: true });
    expect((await misureDellaClasse(classeId, admin()))!.get(iscrittoId)).toEqual(PIENE);
  });

  it("uno studente non iscritto alla classe è non_iscritto, e nulla viene scritto", async () => {
    expect(await salvaMisurePdp(classeId, esternoId, docente(), PIENE)).toEqual({ ok: false, motivo: "non_iscritto" });
    expect(await prisma.misurePdp.count({ where: { classeId } })).toBe(0);
  });

  it("salvare le misure vuote cancella la riga: di un PDP tolto non resta traccia", async () => {
    await salvaMisurePdp(classeId, iscrittoId, docente(), PIENE);
    expect(await salvaMisurePdp(classeId, iscrittoId, docente(), MISURE_VUOTE)).toEqual({ ok: true });
    expect(await prisma.misurePdp.count({ where: { classeId } })).toBe(0);
    expect((await misureDellaClasse(classeId, docente()))!.size).toBe(0);
  });

  it("salvare le misure vuote senza una riga esistente non fallisce", async () => {
    expect(await salvaMisurePdp(classeId, iscrittoId, docente(), MISURE_VUOTE)).toEqual({ ok: true });
    expect(await prisma.misurePdp.count({ where: { classeId } })).toBe(0);
  });

  it("l'elenco contiene solo gli iscritti: la riga di chi è uscito dalla classe resta ma non si mostra", async () => {
    await salvaMisurePdp(classeId, iscrittoId, docente(), PIENE);
    await prisma.classeStudente.delete({ where: { classeId_studentId: { classeId, studentId: iscrittoId } } });
    expect((await misureDellaClasse(classeId, docente()))!.size).toBe(0);
    // La disiscrizione (anche solo temporanea, da allineaClassi) non cancella le misure.
    expect(await prisma.misurePdp.count({ where: { classeId } })).toBe(1);
  });
});
