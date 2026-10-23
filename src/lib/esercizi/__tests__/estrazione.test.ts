import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  baciniDeiBlocchi,
  estraiDaBacini,
  estraiConDettaglio,
  riepilogoEstrazione,
  ultimeVersioni,
  eserciziAssegnabili,
  bloccoDaRegola,
  regolaDaBlocco,
  type Blocco,
} from "../estrazione";
import type { Utente } from "../accesso";

const P = "estrtest-";
const TOPIC = `${P}topic`;
let docenteId: string;
let collegaId: string;
let adminId: string;
let raccoltaId: string;
const docente = (): Utente => ({ id: docenteId, admin: false });
const e = (n: number) => `${P}e${n}`;

beforeEach(async () => {
  await prisma.compito.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteriaRegola.deleteMany({ where: { batteria: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });

  docenteId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  collegaId = (await prisma.user.create({ data: { email: `${P}c@test.it`, name: "C", role: "TEACHER" } })).id;
  adminId = (await prisma.user.create({ data: { email: `${P}a@test.it`, name: "A", role: "ADMIN" } })).id;

  // Sei esercizi della scuola, con versione, nell'argomento TOPIC e nella
  // raccolta del docente; più un privato del collega (stesso argomento) e
  // uno visibile ma senza versione.
  const base = { yearLevel: 2, topic: TOPIC, tags: [], difficulty: 1 };
  for (let n = 1; n <= 6; n++) {
    await prisma.esercizio.create({ data: { id: e(n), title: `E${n}`, ...base, accessoScuola: "EDITOR" } });
  }
  await prisma.esercizio.create({ data: { id: `${P}priv`, title: "Segreto del collega", ...base, authorId: collegaId } });
  await prisma.esercizio.create({
    data: { id: `${P}nov`, title: "Senza versione", ...base, topic: `${P}altro`, accessoScuola: "EDITOR" },
  });
  await prisma.esercizioVersione.createMany({
    data: [...[1, 2, 3, 4, 5, 6].map(e), `${P}priv`].map((esercizioId, i) => ({
      esercizioId, version: 1, content: { v: 1, i }, hash: `${P}h${i}`,
    })),
  });
  // e1 ha anche una versione 2: il riepilogo deve dare l'ultima.
  await prisma.esercizioVersione.create({ data: { esercizioId: e(1), version: 2, content: { v: 2 }, hash: `${P}h1b` } });

  raccoltaId = (await prisma.contenitore.create({ data: { name: `${P}Raccolta`, createdById: docenteId } })).id;
  await prisma.contenitoreEsercizio.createMany({
    data: [1, 2, 3, 4, 5, 6].map((n) => ({ contenitoreId: raccoltaId, esercizioId: e(n) })),
  });
});

describe("estraiDaBacini (pura)", () => {
  const bacini = [
    { candidati: ["a", "b", "c", "d", "e", "f"], richiesti: 3 },
    { candidati: ["e", "f", "g", "h"], richiesti: 2 },
  ];

  it("stesso seme ⇒ stessa estrazione; senza doppioni; blocchi in ordine", () => {
    const x = estraiDaBacini(bacini, "seme-1")!;
    expect(x).toEqual(estraiDaBacini(bacini, "seme-1"));
    expect(x).toHaveLength(5);
    expect(new Set(x).size).toBe(5);
    for (const id of x.slice(0, 3)) expect(bacini[0]!.candidati).toContain(id);
    for (const id of x.slice(3)) expect(bacini[1]!.candidati).toContain(id);
  });

  it("semi diversi danno, in generale, estrazioni diverse", () => {
    const viste = new Set<string>();
    for (let i = 0; i < 20; i++) viste.add(estraiDaBacini(bacini, `seme-${i}`)!.join(","));
    expect(viste.size).toBeGreaterThan(1);
  });

  it("non dipende dall'ordine dei candidati in ingresso (come assegna, che li ordina)", () => {
    const rovesciati = bacini.map((b) => ({ ...b, candidati: [...b.candidati].reverse() }));
    expect(estraiDaBacini(rovesciati, "seme-x")).toEqual(estraiDaBacini(bacini, "seme-x"));
  });

  it("algoritmo bloccato: seme fisso e bacini fissi danno esattamente questi id", () => {
    // Valore calcolato anche con una copia letterale del ciclo di `assegna`
    // prima del Nuovo compito (1ae75f9): se cambia, cambia l'estrazione di
    // ogni compito già rifatto con il suo seme.
    expect(estraiDaBacini(bacini, "seme-fisso")).toEqual(["c", "a", "b", "f", "e"]);
    expect(
      estraiDaBacini(
        [bacini[0]!, { candidati: ["f", "c"], richiesti: 2, scelti: true }, bacini[1]!],
        "seme-fisso",
      ),
    ).toEqual(["a", "d", "b", "f", "c", "h", "e"]);
  });

  it("gli scelti vincono sempre: un blocco casuale precedente non li prende mai, per nessun seme", () => {
    const conScelti = [
      { candidati: ["a", "b", "c", "x"], richiesti: 3 },
      { candidati: ["y", "x"], richiesti: 2, scelti: true },
    ];
    for (let i = 0; i < 30; i++) {
      const d = estraiConDettaglio(conScelti, `seme-${i}`);
      expect(d.esercizi).not.toBeNull();
      const x = d.esercizi!;
      // x una volta sola, nella posizione del blocco scelti, e nell'ordine
      // del docente (y prima di x).
      expect(x.filter((id) => id === "x")).toHaveLength(1);
      expect(x.slice(3)).toEqual(["y", "x"]);
      expect([...x.slice(0, 3)].sort()).toEqual(["a", "b", "c"]);
      // Il blocco casuale ha perso x perché scelto a mano: conta.
      expect(d.duplicatiTolti).toBe(1);
      expect(d.disponibili).toEqual([3, 2]);
    }
  });

  it("i blocchi scelti non si mescolano e non consumano il seme", () => {
    const a = { candidati: ["a", "b", "c", "d"], richiesti: 2 };
    const b = { candidati: ["e", "f", "g"], richiesti: 2 };
    const s = { candidati: ["q", "p", "r"], richiesti: 3, scelti: true };
    for (let i = 0; i < 10; i++) {
      const senza = estraiDaBacini([a, b], `seme-${i}`)!;
      const con = estraiDaBacini([a, s, b], `seme-${i}`)!;
      expect(con).toEqual([...senza.slice(0, 2), "q", "p", "r", ...senza.slice(2)]);
    }
  });

  it("lo stesso esercizio scelto in due blocchi va al primo; il secondo resta corto", () => {
    const d = estraiConDettaglio(
      [{ candidati: ["x", "y"], richiesti: 2, scelti: true }, { candidati: ["x"], richiesti: 1, scelti: true }],
      "s",
    );
    expect(d).toEqual({ esercizi: null, disponibili: [2, 0], duplicatiTolti: 1 });
  });

  it("null se un blocco resta insufficiente dopo l'esclusione dei già presi", () => {
    expect(estraiDaBacini([{ candidati: ["a", "b"], richiesti: 2 }, { candidati: ["a", "b", "c"], richiesti: 2 }], "s")).toBeNull();
    expect(estraiDaBacini([{ candidati: ["a"], richiesti: 2 }], "s")).toBeNull();
  });
});

describe("riepilogoEstrazione", () => {
  it("raccolta: prendi 10 con 6 esercizi ⇒ insufficiente, disponibili 6, nessun esercizio", async () => {
    const r = await riepilogoEstrazione([{ tipo: "raccolta", contenitoreId: raccoltaId, quanti: 10 }], docente(), "s");
    expect(r).toEqual({
      blocchi: [{ etichetta: `${P}Raccolta`, richiesti: 10, disponibili: 6, nonDisponibili: [] }],
      duplicatiTolti: 0,
      totale: 10,
      sufficiente: false,
      esercizi: [],
    });
  });

  it("stesso seme ⇒ stessa estrazione, con titolo e contenuto dell'ultima versione", async () => {
    const blocchi: Blocco[] = [{ tipo: "raccolta", contenitoreId: raccoltaId, quanti: 6 }];
    const a = await riepilogoEstrazione(blocchi, docente(), "seme-A");
    const b = await riepilogoEstrazione(blocchi, docente(), "seme-A");
    expect(a.sufficiente).toBe(true);
    expect(a.esercizi).toEqual(b.esercizi);
    expect(a.esercizi.map((x) => x.esercizioId).sort()).toEqual([1, 2, 3, 4, 5, 6].map(e));
    const uno = a.esercizi.find((x) => x.esercizioId === e(1))!;
    expect(uno.titolo).toBe("E1");
    expect(uno.content).toEqual({ v: 2 });
    const v2 = await prisma.esercizioVersione.findFirstOrThrow({ where: { esercizioId: e(1), version: 2 } });
    expect(uno.versioneId).toBe(v2.id);
  });

  it("due blocchi che condividono esercizi: nessun doppione e duplicatiTolti esatto", async () => {
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 2 },
      { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 3 },
    ];
    const r = await riepilogoEstrazione(blocchi, docente(), "seme-dup");
    expect(r.sufficiente).toBe(true);
    expect(r.totale).toBe(5);
    const ids = r.esercizi.map((x) => x.esercizioId);
    expect(new Set(ids).size).toBe(5);
    // I 2 presi dalla raccolta sono tutti nel bacino dell'argomento: la
    // esclusione ne ha tolti esattamente 2.
    expect(r.duplicatiTolti).toBe(2);
    expect(r.blocchi).toEqual([
      { etichetta: `${P}Raccolta`, richiesti: 2, disponibili: 6, nonDisponibili: [] },
      { etichetta: TOPIC, richiesti: 3, disponibili: 4, nonDisponibili: [] },
    ]);
  });

  it("duplicatiTolti conta solo i presi davvero in comune, non tutta la sovrapposizione dei bacini", async () => {
    // I due bacini coincidono (6 esercizi in comune), ma la raccolta ne
    // prende uno solo: l'esclusione ne toglie 1 al secondo blocco, non 6.
    for (let i = 0; i < 8; i++) {
      const r = await riepilogoEstrazione(
        [
          { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 1 },
          { tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 1 },
        ],
        docente(),
        `seme-${i}`,
      );
      // Il bacino dell'argomento (6) contiene sempre il preso dalla raccolta.
      expect(r.duplicatiTolti).toBe(1);
      expect(r.blocchi[1]!.disponibili).toBe(5);
    }
    const r = await riepilogoEstrazione(
      [
        { tipo: "argomento", argomento: `${P}nessuno`, anno: 2, quanti: 1 },
        { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 1 },
      ],
      docente(),
      "s",
    );
    // Il primo blocco è insufficiente e non prende niente: nessun duplicato.
    expect(r.duplicatiTolti).toBe(0);
    expect(r.sufficiente).toBe(false);
  });

  it("scelti: un esercizio invisibile è 'Esercizio non disponibile', mai il suo titolo; uno senza versione col suo titolo", async () => {
    const r = await riepilogoEstrazione(
      [{ tipo: "scelti", esercizioIds: [e(3), `${P}priv`, `${P}nov`, e(4)] }],
      docente(),
      "s",
    );
    expect(r.blocchi).toEqual([
      {
        etichetta: "Esercizi scelti",
        richiesti: 4,
        disponibili: 2,
        nonDisponibili: ["Esercizio non disponibile", "Senza versione"],
      },
    ]);
    expect(JSON.stringify(r)).not.toContain("Segreto");
    expect(r.sufficiente).toBe(false);
    expect(r.esercizi).toEqual([]);
    expect(r.totale).toBe(4);

    // Il collega, che il suo lo vede, lo ha disponibile.
    const c = await riepilogoEstrazione([{ tipo: "scelti", esercizioIds: [e(3), `${P}priv`] }], { id: collegaId, admin: false }, "s");
    expect(c.sufficiente).toBe(true);
    expect(c.esercizi.map((x) => x.esercizioId).sort()).toEqual([e(3), `${P}priv`].sort());
  });

  it("un blocco casuale prima di un blocco scelti che condivide un esercizio: sufficiente per ogni seme", async () => {
    const blocchi: Blocco[] = [
      { tipo: "raccolta", contenitoreId: raccoltaId, quanti: 4 },
      { tipo: "scelti", esercizioIds: [e(6), e(2)] },
    ];
    for (let i = 0; i < 10; i++) {
      const r = await riepilogoEstrazione(blocchi, docente(), `seme-${i}`);
      expect(r.sufficiente).toBe(true);
      const ids = r.esercizi.map((x) => x.esercizioId);
      expect(ids.slice(4)).toEqual([e(6), e(2)]);
      expect(ids.filter((id) => id === e(6) || id === e(2))).toHaveLength(2);
      // Alla raccolta (6) restano 4 dopo aver tolto i 2 scelti: ne chiede
      // 4, e basta sempre — prima dipendeva dal seme.
      expect(r.blocchi[0]!.disponibili).toBe(4);
      expect(r.duplicatiTolti).toBe(2);
    }
  });

  it("una raccolta che il docente non vede ha l'etichetta generica e zero disponibili", async () => {
    const r = await riepilogoEstrazione([{ tipo: "raccolta", contenitoreId: raccoltaId, quanti: 1 }], { id: collegaId, admin: false }, "s");
    expect(r.blocchi).toEqual([{ etichetta: "Raccolta non disponibile", richiesti: 1, disponibili: 0, nonDisponibili: [] }]);
    expect(JSON.stringify(r)).not.toContain(`${P}Raccolta`);
  });

  it("un ADMIN pesca come docente: il privato del collega resta fuori", async () => {
    const admin: Utente = { id: adminId, admin: true };
    const r = await riepilogoEstrazione([{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 7 }], admin, "s");
    expect(r.blocchi[0]).toMatchObject({ richiesti: 7, disponibili: 6 });
    expect(r.sufficiente).toBe(false);
    const b = await baciniDeiBlocchi([{ tipo: "argomento", argomento: TOPIC, anno: 2, quanti: 6 }], admin);
    expect(b[0]!.candidati).not.toContain(`${P}priv`);
    expect(b[0]!.candidati.sort()).toEqual([1, 2, 3, 4, 5, 6].map(e));
  });

  it("argomento: anno e difficoltaMax filtrano come una regola", async () => {
    await prisma.esercizio.update({ where: { id: e(6) }, data: { difficulty: 4 } });
    const [b] = await baciniDeiBlocchi([{ tipo: "argomento", argomento: TOPIC, anno: 2, difficoltaMax: 3, quanti: 1 }], docente());
    expect(b!.candidati.sort()).toEqual([1, 2, 3, 4, 5].map(e));
    const [vuoto] = await baciniDeiBlocchi([{ tipo: "argomento", argomento: TOPIC, anno: 3, quanti: 1 }], docente());
    expect(vuoto!.candidati).toEqual([]);
  });
});

describe("blocchi e regole", () => {
  it("andata e ritorno per le tre forme", () => {
    const blocchi: Blocco[] = [
      { tipo: "argomento", argomento: "Frazioni", anno: 2, difficoltaMax: 3, quanti: 4 },
      { tipo: "argomento", argomento: "Frazioni", anno: 2, quanti: 4 },
      { tipo: "raccolta", contenitoreId: "c1", quanti: 2 },
      { tipo: "scelti", esercizioIds: ["x", "y"] },
    ];
    expect(regolaDaBlocco(blocchi[3]!)).toEqual({ esercizioIds: ["x", "y"], count: 2 });
    expect(regolaDaBlocco(blocchi[2]!)).toEqual({ contenitoreId: "c1", count: 2 });
    for (const b of blocchi) {
      const r = regolaDaBlocco(b);
      const riga = {
        contenitoreId: r.contenitoreId ?? null,
        argomento: r.argomento ?? null,
        anno: r.anno ?? null,
        difficoltaMax: r.difficoltaMax ?? null,
        count: r.count,
        esercizioIds: r.esercizioIds ?? [],
      };
      expect(bloccoDaRegola(riga)).toEqual(b);
    }
  });

  it("una regola malformata lancia invece di indovinare la forma", () => {
    expect(() =>
      bloccoDaRegola({ contenitoreId: null, argomento: null, anno: null, difficoltaMax: null, count: 1, esercizioIds: [] }),
    ).toThrow(/malformata/);
  });
});

describe("ultimeVersioni", () => {
  it("dà l'ultima versione con titolo e contenuto; un id senza versione non compare", async () => {
    const m = await ultimeVersioni([e(1), e(2), `${P}nov`]);
    expect([...m.keys()].sort()).toEqual([e(1), e(2)]);
    expect(m.get(e(1))).toMatchObject({ titolo: "E1", content: { v: 2 } });
    expect(m.get(e(2))).toMatchObject({ titolo: "E2", content: { v: 1 } });
  });
});

describe("eserciziAssegnabili", () => {
  // Il catalogo di "+ scegli esercizi" nel Nuovo compito: solo ciò che un
  // blocco "scelti" potrebbe davvero assegnare — visibile a chi assegna e
  // con almeno una versione — perché un esercizio offerto lì e poi segnato
  // "non più disponibile" dal riepilogo sarebbe una contraddizione.
  const nostri = (l: { id: string }[]) => l.filter((x) => x.id.startsWith(P));

  it("visibili e con versione, con titolo, argomento e anno, in ordine di titolo", async () => {
    const l = nostri(await eserciziAssegnabili(docente()));
    expect(l.map((x) => x.id)).toEqual([1, 2, 3, 4, 5, 6].map(e));
    expect(l[0]).toEqual({ id: e(1), titolo: "E1", argomento: TOPIC, anno: 2 });
  });

  it("niente esercizi privati altrui né senza versione", async () => {
    const ids = nostri(await eserciziAssegnabili(docente())).map((x) => x.id);
    expect(ids).not.toContain(`${P}priv`);
    expect(ids).not.toContain(`${P}nov`);
  });

  it("un ADMIN vede il catalogo come docente, come nell'estrazione", async () => {
    const ids = nostri(await eserciziAssegnabili({ id: adminId, admin: true })).map((x) => x.id);
    expect(ids).not.toContain(`${P}priv`);
  });

  it("il collega vede anche il suo privato", async () => {
    const ids = nostri(await eserciziAssegnabili({ id: collegaId, admin: false })).map((x) => x.id);
    expect(ids).toContain(`${P}priv`);
  });
});
