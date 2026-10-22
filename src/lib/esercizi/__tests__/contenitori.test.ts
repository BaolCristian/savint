import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  creaContenitore, elencoContenitori, contenutoContenitore,
  aggiungiEsercizi, togliEsercizio, eliminaContenitore,
} from "../contenitori";
import type { Utente } from "../accesso";

const P = "conttest-";
let teacherId: string;
let chi: Utente;
let es1: string;
let es2: string;

// Un collega qualunque, col ruolo dato (o nessuno) sulla raccolta.
async function collega(nome: string, contenitoreId?: string, ruolo?: "VISUALIZZATORE" | "COMMENTATORE" | "EDITOR"): Promise<Utente> {
  const u = await prisma.user.create({ data: { email: `${P}${nome}@test.it`, name: nome, role: "TEACHER" } });
  if (contenitoreId && ruolo) {
    await prisma.condivisioneContenitore.create({ data: { contenitoreId, userId: u.id, ruolo } });
  }
  return { id: u.id, admin: false };
}

beforeEach(async () => {
  await prisma.batteriaRegola.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  chi = { id: teacherId, admin: false };
  // Aperti a tutta la scuola, come ogni esercizio esistente il giorno
  // dell'aggiornamento: questi test parlano delle raccolte, non della
  // visibilità del singolo esercizio.
  const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1, accessoScuola: "EDITOR" as const };
  es1 = (await prisma.esercizio.create({ data: { id: `${P}uno`, title: "Uno", ...base } })).id;
  es2 = (await prisma.esercizio.create({ data: { id: `${P}due`, title: "Due", ...base } })).id;
});

describe("contenitori", () => {
  it("si crea privata e compare nell'elenco del proprietario con zero esercizi", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    const elenco = (await elencoContenitori(chi)).filter((x) => x.name.startsWith(P));
    expect(elenco).toHaveLength(1);
    expect(elenco[0]!.id).toBe(c.id);
    expect(elenco[0]!.esercizi).toBe(0);
    expect(elenco[0]!.ruolo).toBe("PROPRIETARIO");
    expect((await prisma.contenitore.findUnique({ where: { id: c.id } }))!.accessoScuola).toBeNull();
  });

  it("aggiunge esercizi e li elenca", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    expect(await aggiungiEsercizi(c.id, [es1, es2], chi)).toEqual({ ok: true, aggiunti: 2 });
    const dett = await contenutoContenitore(c.id, chi);
    expect(dett!.esercizi.map((e) => e.id).sort()).toEqual([es1, es2].sort());
    expect(dett!.ruolo).toBe("PROPRIETARIO");
  });

  it("ogni legame ricorda chi l'ha aggiunto; riaggiungerlo non cambia l'autore della aggiunta", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    const editor = await collega("editor", c.id, "EDITOR");
    await aggiungiEsercizi(c.id, [es1], chi);
    await aggiungiEsercizi(c.id, [es1, es2], editor);
    const righe = await prisma.contenitoreEsercizio.findMany({ where: { contenitoreId: c.id } });
    expect(Object.fromEntries(righe.map((r) => [r.esercizioId, r.addedById]))).toEqual({
      [es1]: teacherId,
      [es2]: editor.id,
    });
  });

  it("aggiungere due volte lo stesso esercizio non lo duplica", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    await aggiungiEsercizi(c.id, [es1], chi);
    expect(await aggiungiEsercizi(c.id, [es1, es2], chi)).toEqual({ ok: true, aggiunti: 1 });
    expect((await contenutoContenitore(c.id, chi))!.esercizi).toHaveLength(2);
  });

  it("un esercizio puo' stare in due contenitori", async () => {
    const a = await creaContenitore(teacherId, `${P}A`);
    const b = await creaContenitore(teacherId, `${P}B`);
    await aggiungiEsercizi(a.id, [es1], chi);
    await aggiungiEsercizi(b.id, [es1], chi);
    expect((await contenutoContenitore(a.id, chi))!.esercizi).toHaveLength(1);
    expect((await contenutoContenitore(b.id, chi))!.esercizi).toHaveLength(1);
  });

  it("togliere un esercizio da un contenitore non lo cancella dal bacino", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    await aggiungiEsercizi(c.id, [es1], chi);
    expect(await togliEsercizio(c.id, es1, chi)).toEqual({ ok: true });
    expect((await contenutoContenitore(c.id, chi))!.esercizi).toHaveLength(0);
    expect(await prisma.esercizio.findUnique({ where: { id: es1 } })).not.toBeNull();
  });

  it("un contenitore libero si cancella", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    expect(await eliminaContenitore(c.id, chi)).toEqual({ ok: true });
  });

  it("un contenitore usato da una regola NON si cancella", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    const b = await prisma.batteria.create({ data: { name: `${P}B`, createdById: teacherId } });
    await prisma.batteriaRegola.create({ data: { batteriaId: b.id, contenitoreId: c.id, order: 0, count: 1 } });
    expect(await eliminaContenitore(c.id, chi)).toEqual({ ok: false, motivo: "in_uso" });
    expect(await prisma.contenitore.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("un contenitore inesistente da' null nel dettaglio", async () => {
    expect(await contenutoContenitore("non-esiste", chi)).toBeNull();
  });
});

describe("contenitori e ruoli", () => {
  it("per un estraneo una raccolta privata non esiste: niente dettaglio, niente elenco", async () => {
    const c = await creaContenitore(teacherId, `${P}Privata`);
    const estraneo = await collega("estraneo");
    expect(await contenutoContenitore(c.id, estraneo)).toBeNull();
    expect((await elencoContenitori(estraneo)).some((x) => x.id === c.id)).toBe(false);
  });

  it("chi ha un ruolo la vede nell'elenco col suo ruolo", async () => {
    const c = await creaContenitore(teacherId, `${P}Condivisa`);
    const vis = await collega("vis", c.id, "VISUALIZZATORE");
    const voce = (await elencoContenitori(vis)).find((x) => x.id === c.id);
    expect(voce?.ruolo).toBe("VISUALIZZATORE");
    expect((await contenutoContenitore(c.id, vis))!.ruolo).toBe("VISUALIZZATORE");
  });

  it("aggiungere da VISUALIZZATORE della raccolta risponde sola_lettura e non scrive niente", async () => {
    const c = await creaContenitore(teacherId, `${P}Condivisa`);
    const vis = await collega("vis", c.id, "VISUALIZZATORE");
    expect(await aggiungiEsercizi(c.id, [es1], vis)).toEqual({ ok: false, motivo: "sola_lettura" });
    expect(await prisma.contenitoreEsercizio.count({ where: { contenitoreId: c.id } })).toBe(0);
  });

  it("togliere da COMMENTATORE risponde sola_lettura; da EDITOR riesce", async () => {
    const c = await creaContenitore(teacherId, `${P}Condivisa`);
    await aggiungiEsercizi(c.id, [es1], chi);
    const comm = await collega("comm", c.id, "COMMENTATORE");
    const editor = await collega("editor", c.id, "EDITOR");
    expect(await togliEsercizio(c.id, es1, comm)).toEqual({ ok: false, motivo: "sola_lettura" });
    expect(await prisma.contenitoreEsercizio.count({ where: { contenitoreId: c.id } })).toBe(1);
    expect(await togliEsercizio(c.id, es1, editor)).toEqual({ ok: true });
    expect(await prisma.contenitoreEsercizio.count({ where: { contenitoreId: c.id } })).toBe(0);
  });

  it("un estraneo che aggiunge o toglie riceve non_trovato, come per una raccolta inesistente", async () => {
    const c = await creaContenitore(teacherId, `${P}Privata`);
    const estraneo = await collega("estraneo");
    expect(await aggiungiEsercizi(c.id, [es1], estraneo)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await togliEsercizio(c.id, es1, estraneo)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await aggiungiEsercizi("non-esiste", [es1], chi)).toEqual({ ok: false, motivo: "non_trovato" });
  });

  it("non si aggiunge un esercizio che chi aggiunge non vede: non_trovato, nemmeno gli altri entrano", async () => {
    const c = await creaContenitore(teacherId, `${P}Mia`);
    const altro = await collega("altro");
    const privato = (await prisma.esercizio.create({
      data: { id: `${P}privato`, title: "Privato", yearLevel: 2, topic: "prova", tags: [], difficulty: 1, authorId: altro.id },
    })).id;
    expect(await aggiungiEsercizi(c.id, [es1, privato], chi)).toEqual({ ok: false, motivo: "non_trovato" });
    expect(await prisma.contenitoreEsercizio.count({ where: { contenitoreId: c.id } })).toBe(0);
  });

  it("eliminare da EDITOR (raccolta visibile ma non sua) risponde sola_lettura", async () => {
    const c = await creaContenitore(teacherId, `${P}Condivisa`);
    const editor = await collega("editor", c.id, "EDITOR");
    expect(await eliminaContenitore(c.id, editor)).toEqual({ ok: false, motivo: "sola_lettura" });
    expect(await prisma.contenitore.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("eliminare da estraneo risponde non_trovato", async () => {
    const c = await creaContenitore(teacherId, `${P}Privata`);
    const estraneo = await collega("estraneo");
    expect(await eliminaContenitore(c.id, estraneo)).toEqual({ ok: false, motivo: "non_trovato" });
  });

  it("dettaglio e conteggio mostrano solo gli esercizi che chi guarda vede", async () => {
    // Bianchi condivide un suo esercizio solo con me; io lo metto nella mia
    // raccolta condivisa con Rossi: per Rossi quell'esercizio non c'è.
    const c = await creaContenitore(teacherId, `${P}Condivisa`);
    const rossi = await collega("rossi", c.id, "EDITOR");
    const bianchi = await collega("bianchi");
    const diBianchi = (await prisma.esercizio.create({
      data: { id: `${P}bianchi`, title: "Di Bianchi", yearLevel: 2, topic: "prova", tags: [], difficulty: 1, authorId: bianchi.id },
    })).id;
    await prisma.condivisioneEsercizio.create({ data: { esercizioId: diBianchi, userId: teacherId, ruolo: "VISUALIZZATORE" } });
    expect(await aggiungiEsercizi(c.id, [es1, diBianchi], chi)).toEqual({ ok: true, aggiunti: 2 });

    expect((await contenutoContenitore(c.id, chi))!.esercizi.map((e) => e.id).sort()).toEqual([es1, diBianchi].sort());
    expect((await contenutoContenitore(c.id, rossi))!.esercizi.map((e) => e.id)).toEqual([es1]);
    expect((await elencoContenitori(rossi)).find((x) => x.id === c.id)!.esercizi).toBe(1);
    expect((await elencoContenitori(chi)).find((x) => x.id === c.id)!.esercizi).toBe(2);
  });
});
