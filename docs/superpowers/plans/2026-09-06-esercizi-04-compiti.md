# Esercizi 04 — Classi, contenitori, batterie e compiti — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un docente raggruppa gli esercizi in contenitori, compone una batteria come "cinque da equazioni e tre da sistemi", la assegna a una classe con una scadenza, e vede chi ha consegnato e con che punteggio.

**Architecture:** le classi nascono dai gruppi Google che il cancello del sotto-progetto 1 già legge a ogni accesso, e le iscrizioni si allineano lì. I contenitori sono raccolte della scuola riempite a mano. Una batteria è una lista di regole "N esercizi dal contenitore X", riusabile su più classi. Assegnare una batteria pesca una volta sola, uguale per tutta la classe, e fissa le versioni pescate: i numeri diversi per studente li dà già il seme del tentativo.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma/PostgreSQL, NextAuth 5, next-intl 4, Tailwind 4, shadcn su `@base-ui/react`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-06-esercizi-04-compiti-design.md`

## Global Constraints

- **Le classi vengono solo dai gruppi Google.** Nessuna creazione a mano, nessun codice d'invito. Una `Classe` nasce alla prima volta che un accesso la nomina.
- **L'associazione docente-classe è esplicita:** il docente dichiara quali classi insegna. Non si deduce dai gruppi.
- **I contenitori sono della scuola:** qualunque docente li vede, li usa e li modifica; resta registrato chi li ha creati. Nessun permesso.
- **La pesca è la stessa per tutta la classe**, fatta una volta all'assegnazione e fissata negli id delle versioni pescate. Mai ripescare.
- **Un tentativo resta su un esercizio solo.** Non si introduce `TentativoDomanda`.
- **Non si cancella ciò che reggerebbe lavoro già dato:** un contenitore usato da una regola e una batteria con compiti assegnati non si cancellano.
- Ogni rotta API: `requireTeacher()` o `requireStudent()` da `@/lib/auth/require-role`, validazione `zod` con `safeParse`, `NextResponse.json(data, { status })`, errori nella forma `{ error: "..." }`, parametri di rotta attesi (`{ params }: { params: Promise<{ id: string }> }`).
- Ogni stringa mostrata passa da next-intl, presente **in entrambi** `src/messages/it.json` e `src/messages/en.json`.
- Prisma si importa così: `import { prisma } from "@/lib/db/client"`.
- **Le migrazioni sono additive.** Il database è condiviso con l'ambiente di sviluppo dell'utente: mai `prisma migrate reset`. Se Prisma chiede un reset, fermarsi e segnalarlo.
- **Non si modifica `packages/engine` né `content/esercizi/`.**
- Test di componente in `__tests__/` accanto al componente, avvolti in `<NextIntlClientProvider locale="it" messages={it}>`.
- **La pulizia nei test è circoscritta ai propri dati** (identificativi con prefisso o casuali), mai `deleteMany()` su una tabella intera: i file di test girano in parallelo sullo stesso database, ed è già costato una suite instabile.
- Gate prima di ogni commit: `npx tsc --noEmit`, `npx eslint --quiet <file toccati>`, `npm run test:run`.
- Commit in italiano, con i trailer `Co-Authored-By:` e `Claude-Session:` già in uso.

---

### Task 1: Modelli Prisma

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_esercizi_compiti/migration.sql` (generata)
- Test: `src/lib/esercizi/__tests__/schema-compiti.test.ts`

**Interfaces:**
- Consumes: `User`, `Esercizio`, `EsercizioVersione`, `Tentativo` esistenti.
- Produces: `Classe`, `ClasseStudente`, `ClasseDocente`, `Contenitore`, `ContenitoreEsercizio`, `Batteria`, `BatteriaRegola`, `Compito`, e la relazione su `Tentativo.compitoId`.

- [ ] **Step 1: Scrivi il test che fallisce**

`src/lib/esercizi/__tests__/schema-compiti.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (nome: string) => schema.match(new RegExp(`model ${nome} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("schema di classi, contenitori, batterie e compiti", () => {
  it.each(["Classe", "ClasseStudente", "ClasseDocente", "Contenitore", "ContenitoreEsercizio", "Batteria", "BatteriaRegola", "Compito"])(
    "dichiara il modello %s", (nome) => {
      expect(model(nome)).not.toBe("");
    },
  );

  it("la classe e' identificata dal gruppo Google", () => {
    expect(model("Classe")).toMatch(/googleGroupEmail\s+String\s+@unique/);
  });

  it("un esercizio puo' stare in piu' contenitori", () => {
    expect(model("ContenitoreEsercizio")).toMatch(/@@id\(\[contenitoreId, esercizioId\]\)/);
  });

  it("un contenitore usato da una regola non si cancella", () => {
    expect(model("BatteriaRegola")).toMatch(/contenitore\s+Contenitore\s+@relation\([^)]*onDelete:\s*Restrict/);
  });

  it("una batteria con compiti non si cancella", () => {
    expect(model("Compito")).toMatch(/batteria\s+Batteria\s+@relation\([^)]*onDelete:\s*Restrict/);
  });

  it("il compito fissa la pesca", () => {
    expect(model("Compito")).toMatch(/drawSeed\s+String/);
    expect(model("Compito")).toMatch(/drawnVersionIds\s+String\[\]/);
  });

  it("il tentativo punta al compito e resta senza per gli esercizi liberi", () => {
    expect(model("Tentativo")).toMatch(/compitoId\s+String\?/);
    expect(model("Tentativo")).toMatch(/compito\s+Compito\?\s+@relation/);
  });

  it("User ha i lati inversi delle nuove relazioni", () => {
    const u = model("User");
    for (const r of ["classi", "classiInsegnate", "contenitoriCreati", "batterieCreate", "compitiAssegnati"]) {
      expect(u, `manca ${r}`).toMatch(new RegExp(`${r}\\s+\\w+\\[\\]`));
    }
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/esercizi/__tests__/schema-compiti.test.ts`
Expected: FAIL, i modelli non esistono.

- [ ] **Step 3: Aggiungi i modelli**

In fondo a `prisma/schema.prisma`:

```prisma
model Classe {
  id               String    @id @default(cuid())
  googleGroupEmail String    @unique
  name             String
  yearLevel        Int?
  archivedAt       DateTime?
  createdAt        DateTime  @default(now())
  studenti         ClasseStudente[]
  docenti          ClasseDocente[]
  compiti          Compito[]
}

model ClasseStudente {
  classeId  String
  studentId String
  joinedAt  DateTime @default(now())
  classe    Classe @relation(fields: [classeId], references: [id], onDelete: Cascade)
  studente  User   @relation(fields: [studentId], references: [id], onDelete: Cascade)
  @@id([classeId, studentId])
}

model ClasseDocente {
  classeId  String
  teacherId String
  createdAt DateTime @default(now())
  classe    Classe @relation(fields: [classeId], references: [id], onDelete: Cascade)
  docente   User   @relation(fields: [teacherId], references: [id], onDelete: Cascade)
  @@id([classeId, teacherId])
}

model Contenitore {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  createdBy   User @relation(fields: [createdById], references: [id])
  esercizi    ContenitoreEsercizio[]
  regole      BatteriaRegola[]
}

model ContenitoreEsercizio {
  contenitoreId String
  esercizioId   String
  addedAt       DateTime @default(now())
  contenitore   Contenitore @relation(fields: [contenitoreId], references: [id], onDelete: Cascade)
  esercizio     Esercizio   @relation(fields: [esercizioId], references: [id], onDelete: Cascade)
  @@id([contenitoreId, esercizioId])
}

model Batteria {
  id          String   @id @default(cuid())
  name        String
  description String?
  createdById String
  createdAt   DateTime @default(now())
  createdBy   User @relation(fields: [createdById], references: [id])
  regole      BatteriaRegola[]
  compiti     Compito[]
}

model BatteriaRegola {
  id            String @id @default(cuid())
  batteriaId    String
  contenitoreId String
  order         Int
  count         Int
  batteria      Batteria    @relation(fields: [batteriaId], references: [id], onDelete: Cascade)
  contenitore   Contenitore @relation(fields: [contenitoreId], references: [id], onDelete: Restrict)
  @@unique([batteriaId, order])
}

model Compito {
  id              String    @id @default(cuid())
  batteriaId      String
  classeId        String
  assignedById    String
  drawSeed        String
  drawnVersionIds String[]
  opensAt         DateTime?
  dueAt           DateTime?
  createdAt       DateTime  @default(now())
  batteria        Batteria @relation(fields: [batteriaId], references: [id], onDelete: Restrict)
  classe          Classe   @relation(fields: [classeId], references: [id], onDelete: Cascade)
  assignedBy      User     @relation(fields: [assignedById], references: [id])
  tentativi       Tentativo[]
  @@index([classeId, dueAt])
}
```

Nel modello `Tentativo`, accanto agli altri campi, la relazione:

```prisma
  compito             Compito? @relation(fields: [compitoId], references: [id], onDelete: SetNull)
```

Nel modello `User`, sotto un commento che dice che appartengono agli Esercizi:

```prisma
  // Esercizi (sotto-progetto 4)
  classi            ClasseStudente[]
  classiInsegnate   ClasseDocente[]
  contenitoriCreati Contenitore[]
  batterieCreate    Batteria[]
  compitiAssegnati  Compito[]
```

Nel modello `Esercizio`:

```prisma
  contenitori ContenitoreEsercizio[]
```

- [ ] **Step 4: Genera la migrazione**

Run:
```bash
npx prisma migrate dev --name esercizi_compiti
npx prisma generate
```
Expected: migrazione creata, nessun reset richiesto. Se Prisma propone di riasserire il default di `PracticeRun.expiresAt`, toglilo dal SQL generato: è rumore ricorrente di un default `dbgenerated()`, non fa parte di questo lavoro, e lasciarlo dentro confonde chi legge la migrazione.

- [ ] **Step 5: Esegui il test e verifica che passi**

Run: `npx vitest run src/lib/esercizi/__tests__/schema-compiti.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/esercizi/__tests__/schema-compiti.test.ts
git commit -m "feat(esercizi): modelli di classi, contenitori, batterie e compiti"
```

---

### Task 2: Allineamento delle classi al login

**Files:**
- Create: `src/lib/esercizi/classi.ts`
- Modify: `src/lib/auth/gate-callbacks.ts`
- Test: `src/lib/esercizi/__tests__/classi.test.ts`

**Interfaces:**
- Consumes: `ClassGroup` da `@/lib/auth/resolve-role`, che è `{ email: string; name: string; yearLevel: number | null }`.
- Produces:
  ```ts
  export async function allineaClassi(studentId: string, gruppi: ClassGroup[]): Promise<{ entrate: string[]; uscite: string[] }>;
  export async function classiDelDocente(teacherId: string): Promise<{ id: string; name: string; yearLevel: number | null; studenti: number }[]>;
  export async function classiDisponibili(): Promise<{ id: string; name: string; yearLevel: number | null }[]>;
  export async function dichiaraInsegnamento(teacherId: string, classeIds: string[]): Promise<void>;
  ```

**Perché tocca il cancello:** `gate-callbacks.ts` è l'unico punto che sa quali gruppi ha uno studente, e li scrive già su `User.classGroups`. Allineare le iscrizioni lì significa che nessuno deve ricordarsi di farlo altrove.

- [ ] **Step 1: Scrivi il test che fallisce**

`src/lib/esercizi/__tests__/classi.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { allineaClassi, classiDelDocente, dichiaraInsegnamento } from "../classi";

const P = "classitest-";
const email = (n: string) => `${P}${n}@test.it`;
let studentId: string;
let teacherId: string;

const g = (slug: string, nome: string, anno: number | null) => ({ email: `${P}${slug}@scuola.it`, name: nome, yearLevel: anno });

beforeEach(async () => {
  await prisma.classeStudente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classeDocente.deleteMany({ where: { classe: { googleGroupEmail: { startsWith: P } } } });
  await prisma.classe.deleteMany({ where: { googleGroupEmail: { startsWith: P } } });
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
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/esercizi/__tests__/classi.test.ts`
Expected: FAIL, `../classi` non esiste.

- [ ] **Step 3: Implementa**

`src/lib/esercizi/classi.ts`:

```ts
import type { ClassGroup } from "@/lib/auth/resolve-role";
import { prisma } from "@/lib/db/client";

/** Allinea le iscrizioni di uno studente ai gruppi che Google gli riconosce
 * adesso: crea le classi mancanti, iscrive alle nuove, disiscrive da quelle
 * che non ha più. Le classi restano anche quando si svuotano: i compiti già
 * assegnati ci puntano. */
export async function allineaClassi(
  studentId: string,
  gruppi: ClassGroup[],
): Promise<{ entrate: string[]; uscite: string[] }> {
  const classi = await Promise.all(
    gruppi.map((g) =>
      prisma.classe.upsert({
        where: { googleGroupEmail: g.email },
        create: { googleGroupEmail: g.email, name: g.name, yearLevel: g.yearLevel },
        update: { name: g.name, yearLevel: g.yearLevel },
      }),
    ),
  );
  const volute = new Set(classi.map((c) => c.id));

  const attuali = await prisma.classeStudente.findMany({ where: { studentId } });
  const presenti = new Set(attuali.map((i) => i.classeId));

  const entrate = [...volute].filter((id) => !presenti.has(id));
  const uscite = [...presenti].filter((id) => !volute.has(id));

  if (entrate.length) {
    await prisma.classeStudente.createMany({
      data: entrate.map((classeId) => ({ classeId, studentId })),
      skipDuplicates: true,
    });
  }
  if (uscite.length) {
    await prisma.classeStudente.deleteMany({ where: { studentId, classeId: { in: uscite } } });
  }

  return { entrate, uscite };
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
```

- [ ] **Step 4: Aggancia il cancello**

In `src/lib/auth/gate-callbacks.ts`, in **entrambi** i punti che scrivono `classGroups` (`signInWithGate` per un utente esistente e `onUserCreated` per uno nuovo), dopo l'aggiornamento dell'utente:

```ts
  if (decision.role === "STUDENT" && decision.classGroups !== undefined) {
    await allineaClassi(<id dell'utente>, decision.classGroups);
  }
```

L'allineamento vale solo per gli studenti: i gruppi di classe di un docente, se ci fossero, non lo iscrivono da nessuna parte, perché l'associazione docente-classe è dichiarata a mano.

- [ ] **Step 5: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/esercizi src/lib/auth`
Expected: PASS, compresi i test esistenti del cancello.

- [ ] **Step 6: Commit**

```bash
git add src/lib/esercizi/classi.ts src/lib/esercizi/__tests__/classi.test.ts src/lib/auth/gate-callbacks.ts
git commit -m "feat(esercizi): le classi nascono dai gruppi Google e si allineano al login"
```

---

### Task 3: Contenitori

**Files:**
- Create: `src/lib/esercizi/contenitori.ts`
- Test: `src/lib/esercizi/__tests__/contenitori.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export async function creaContenitore(createdById: string, name: string, description?: string): Promise<{ id: string }>;
  export async function elencoContenitori(): Promise<{ id: string; name: string; description: string | null; esercizi: number; createdBy: string | null }[]>;
  export async function contenutoContenitore(id: string): Promise<{ id: string; name: string; description: string | null; esercizi: { id: string; title: string; yearLevel: number; topic: string; difficulty: number }[] } | null>;
  export async function aggiungiEsercizi(contenitoreId: string, esercizioIds: string[]): Promise<number>;
  export async function togliEsercizio(contenitoreId: string, esercizioId: string): Promise<void>;
  export async function eliminaContenitore(id: string): Promise<{ ok: true } | { ok: false; motivo: "in_uso" }>;
  ```

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/client";
import {
  creaContenitore, elencoContenitori, contenutoContenitore,
  aggiungiEsercizi, togliEsercizio, eliminaContenitore,
} from "../contenitori";

const P = "conttest-";
let teacherId: string;
let es1: string;
let es2: string;

beforeEach(async () => {
  await prisma.batteriaRegola.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.batteria.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitore: { name: { startsWith: P } } } });
  await prisma.contenitore.deleteMany({ where: { name: { startsWith: P } } });
  await prisma.esercizio.deleteMany({ where: { id: { startsWith: P } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: P } } });
  teacherId = (await prisma.user.create({ data: { email: `${P}d@test.it`, name: "D", role: "TEACHER" } })).id;
  const base = { yearLevel: 2, topic: "prova", tags: [], difficulty: 1 };
  es1 = (await prisma.esercizio.create({ data: { id: `${P}uno`, title: "Uno", ...base } })).id;
  es2 = (await prisma.esercizio.create({ data: { id: `${P}due`, title: "Due", ...base } })).id;
});

describe("contenitori", () => {
  it("si crea e compare nell'elenco con zero esercizi", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    const elenco = (await elencoContenitori()).filter((x) => x.name.startsWith(P));
    expect(elenco).toHaveLength(1);
    expect(elenco[0]!.id).toBe(c.id);
    expect(elenco[0]!.esercizi).toBe(0);
  });

  it("aggiunge esercizi e li elenca", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    expect(await aggiungiEsercizi(c.id, [es1, es2])).toBe(2);
    const dett = await contenutoContenitore(c.id);
    expect(dett!.esercizi.map((e) => e.id).sort()).toEqual([es1, es2].sort());
  });

  it("aggiungere due volte lo stesso esercizio non lo duplica", async () => {
    const c = await creaContenitore(teacherId, `${P}Equazioni`);
    await aggiungiEsercizi(c.id, [es1]);
    expect(await aggiungiEsercizi(c.id, [es1, es2])).toBe(1);
    expect((await contenutoContenitore(c.id))!.esercizi).toHaveLength(2);
  });

  it("un esercizio puo' stare in due contenitori", async () => {
    const a = await creaContenitore(teacherId, `${P}A`);
    const b = await creaContenitore(teacherId, `${P}B`);
    await aggiungiEsercizi(a.id, [es1]);
    await aggiungiEsercizi(b.id, [es1]);
    expect((await contenutoContenitore(a.id))!.esercizi).toHaveLength(1);
    expect((await contenutoContenitore(b.id))!.esercizi).toHaveLength(1);
  });

  it("togliere un esercizio da un contenitore non lo cancella dal bacino", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    await aggiungiEsercizi(c.id, [es1]);
    await togliEsercizio(c.id, es1);
    expect((await contenutoContenitore(c.id))!.esercizi).toHaveLength(0);
    expect(await prisma.esercizio.findUnique({ where: { id: es1 } })).not.toBeNull();
  });

  it("un contenitore libero si cancella", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    expect(await eliminaContenitore(c.id)).toEqual({ ok: true });
  });

  it("un contenitore usato da una regola NON si cancella", async () => {
    const c = await creaContenitore(teacherId, `${P}A`);
    const b = await prisma.batteria.create({ data: { name: `${P}B`, createdById: teacherId } });
    await prisma.batteriaRegola.create({ data: { batteriaId: b.id, contenitoreId: c.id, order: 0, count: 1 } });
    expect(await eliminaContenitore(c.id)).toEqual({ ok: false, motivo: "in_uso" });
    expect(await prisma.contenitore.findUnique({ where: { id: c.id } })).not.toBeNull();
  });

  it("un contenitore inesistente da' null nel dettaglio", async () => {
    expect(await contenutoContenitore("non-esiste")).toBeNull();
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npx vitest run src/lib/esercizi/__tests__/contenitori.test.ts`
Expected: FAIL, il modulo non esiste.

- [ ] **Step 3: Implementa**

`src/lib/esercizi/contenitori.ts`: le sei funzioni del blocco Interfaces sopra Prisma, con queste regole:

- `aggiungiEsercizi` usa `createMany` con `skipDuplicates: true` e restituisce quante righe ha davvero creato, così il chiamante può dire "due aggiunti, uno c'era già".
- `eliminaContenitore` conta prima le `BatteriaRegola` che lo usano: se ce n'è almeno una restituisce `{ ok: false, motivo: "in_uso" }` senza tentare la cancellazione. Il vincolo `onDelete: Restrict` è la rete di sicurezza; questo controllo è ciò che permette di dare un messaggio invece di un errore del database.
- `contenutoContenitore` ordina gli esercizi per anno e poi per titolo.
- `elencoContenitori` ordina per nome e porta il conteggio degli esercizi con `_count`.

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npx vitest run src/lib/esercizi/__tests__/contenitori.test.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/esercizi/contenitori.ts src/lib/esercizi/__tests__/contenitori.test.ts
git commit -m "feat(esercizi): contenitori di esercizi della scuola"
```

---

### Task 4: Batterie e pesca

**Files:**
- Create: `src/lib/esercizi/batterie.ts`
- Create: `src/lib/esercizi/compiti.ts`
- Test: `src/lib/esercizi/__tests__/batterie.test.ts`, `src/lib/esercizi/__tests__/compiti.test.ts`

**Interfaces:**
- Consumes: i contenitori del Task 3; `makeRng` non serve, la pesca usa il seme via `seedrandom` come fa il motore.
- Produces:
  ```ts
  // batterie.ts
  export interface RegolaInput { contenitoreId: string; count: number }
  export async function creaBatteria(createdById: string, name: string, regole: RegolaInput[], description?: string): Promise<{ id: string }>;
  export async function elencoBatterie(): Promise<{ id: string; name: string; regole: { contenitore: string; count: number }[]; compiti: number }[]>;
  export async function verificaBatteria(batteriaId: string): Promise<{ ok: true } | { ok: false; mancanti: { contenitore: string; richiesti: number; disponibili: number }[] }>;
  // compiti.ts
  export async function assegna(batteriaId: string, classeId: string, assignedById: string, opzioni?: { opensAt?: Date; dueAt?: Date }):
    Promise<{ ok: true; compitoId: string } | { ok: false; motivo: "batteria_non_trovata" | "classe_non_trovata" | "non_insegni_questa_classe" | "esercizi_insufficienti"; dettaglio?: unknown }>;
  export async function compitiDellaClasse(classeId: string): Promise<{ id: string; batteria: string; dueAt: Date | null; esercizi: number }[]>;
  export async function compitiDelloStudente(studentId: string): Promise<{ id: string; batteria: string; dueAt: Date | null; esercizi: { esercizioId: string; title: string }[]; fatti: number }[]>;
  export async function consegneDelCompito(compitoId: string): Promise<{ studentId: string; nome: string; fatti: number; totali: number; punteggio: number; massimo: number }[]>;
  ```

**La pesca:** `assegna` genera un `drawSeed`, prende per ogni regola gli esercizi del contenitore in ordine stabile (per id), li mescola con quel seme e ne prende `count`, poi risolve l'**ultima versione** di ciascuno e salva quegli id in `drawnVersionIds`. Da quel momento il compito non cambia più.

- [ ] **Step 1: Scrivi i test che falliscono**

`src/lib/esercizi/__tests__/compiti.test.ts`, i casi che contano:

```ts
it("assegnare pesca una volta e fissa le versioni", async () => {
  const r = await assegna(batteriaId, classeId, teacherId);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  const c = await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } });
  expect(c.drawnVersionIds).toHaveLength(3);
  expect(c.drawSeed).toMatch(/.+/);
});

it("due assegnazioni della stessa batteria pescano in modo diverso", async () => {
  const a = await assegna(batteriaId, classeId, teacherId);
  const b = await assegna(batteriaId, classeId, teacherId);
  if (!a.ok || !b.ok) throw new Error("assegnazione fallita");
  const ca = await prisma.compito.findUniqueOrThrow({ where: { id: a.compitoId } });
  const cb = await prisma.compito.findUniqueOrThrow({ where: { id: b.compitoId } });
  expect(ca.drawSeed).not.toBe(cb.drawSeed);
});

it("la pesca non cambia se il contenitore cambia dopo", async () => {
  const r = await assegna(batteriaId, classeId, teacherId);
  if (!r.ok) throw new Error("assegnazione fallita");
  const prima = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
  await aggiungiEsercizi(contenitoreId, [esercizioExtra]);
  const dopo = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds;
  expect(dopo).toEqual(prima);
});

it("un contenitore che non basta blocca l'assegnazione e dice quale", async () => {
  const r = await assegna(batteriaTroppoGrande, classeId, teacherId);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.motivo).toBe("esercizi_insufficienti");
});

it("un docente non puo' assegnare a una classe che non insegna", async () => {
  const r = await assegna(batteriaId, classeAltrui, teacherId);
  expect(r).toMatchObject({ ok: false, motivo: "non_insegni_questa_classe" });
});

it("lo studente vede il compito della sua classe e quanti esercizi ha fatto", async () => {
  const r = await assegna(batteriaId, classeId, teacherId);
  if (!r.ok) throw new Error("assegnazione fallita");
  const suoi = await compitiDelloStudente(studentId);
  expect(suoi).toHaveLength(1);
  expect(suoi[0]!.esercizi).toHaveLength(3);
  expect(suoi[0]!.fatti).toBe(0);
});

it("le consegne elencano tutti gli studenti, anche chi non ha iniziato", async () => {
  const r = await assegna(batteriaId, classeId, teacherId);
  if (!r.ok) throw new Error("assegnazione fallita");
  const righe = await consegneDelCompito(r.compitoId);
  expect(righe).toHaveLength(2);
  expect(righe.every((x) => x.fatti === 0)).toBe(true);
});

// I tre casi limite che la spec dichiara e che senza un test resterebbero
// opinioni.

it("chi entra nella classe DOPO l'assegnazione vede comunque il compito", async () => {
  const r = await assegna(batteriaId, classeId, teacherId);
  if (!r.ok) throw new Error("assegnazione fallita");
  const tardivo = await prisma.user.create({ data: { email: `${P}tardivo@test.it`, name: "T", role: "STUDENT" } });
  await prisma.classeStudente.create({ data: { classeId, studentId: tardivo.id } });
  const suoi = await compitiDelloStudente(tardivo.id);
  expect(suoi.map((c) => c.id)).toContain(r.compitoId);
  expect(await consegneDelCompito(r.compitoId)).toHaveLength(3);
});

it("chi esce dalla classe sparisce dalle consegne ma i suoi tentativi restano", async () => {
  const r = await assegna(batteriaId, classeId, teacherId);
  if (!r.ok) throw new Error("assegnazione fallita");
  const versione = (await prisma.compito.findUniqueOrThrow({ where: { id: r.compitoId } })).drawnVersionIds[0]!;
  const t = await prisma.tentativo.create({
    data: { studentId, esercizioVersioneId: versione, compitoId: r.compitoId, seed: "x" },
  });
  await prisma.classeStudente.delete({ where: { classeId_studentId: { classeId, studentId } } });
  expect((await consegneDelCompito(r.compitoId)).map((x) => x.studentId)).not.toContain(studentId);
  expect(await prisma.tentativo.findUnique({ where: { id: t.id } })).not.toBeNull();
});

it("una classe senza studenti si assegna lo stesso, con zero consegne", async () => {
  const vuota = await prisma.classe.create({
    data: { googleGroupEmail: `${P}vuota@scuola.it`, name: "Vuota", yearLevel: 1 },
  });
  await prisma.classeDocente.create({ data: { classeId: vuota.id, teacherId } });
  const r = await assegna(batteriaId, vuota.id, teacherId);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(await consegneDelCompito(r.compitoId)).toEqual([]);
});
```

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/lib/esercizi`
Expected: FAIL, i moduli non esistono.

- [ ] **Step 3: Implementa**

`batterie.ts` costruisce batteria e regole in una transazione, con `order` progressivo. `verificaBatteria` confronta per ogni regola il `count` con il numero di esercizi del contenitore e restituisce le mancanze.

`compiti.ts`, per `assegna`:

```ts
import seedrandom from "seedrandom";
import { randomUUID } from "crypto";

// ... verifiche: batteria esiste, classe esiste, il docente la insegna
const drawSeed = randomUUID();
const rng = seedrandom(drawSeed);
const versioni: string[] = [];
for (const regola of batteria.regole) {
  const candidati = regola.contenitore.esercizi.map((e) => e.esercizioId).sort();
  if (candidati.length < regola.count) return { ok: false, motivo: "esercizi_insufficienti", dettaglio: { contenitore: regola.contenitore.name, richiesti: regola.count, disponibili: candidati.length } };
  // mescolamento con il seme, poi i primi `count`
  const mescolati = [...candidati];
  for (let i = mescolati.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [mescolati[i], mescolati[j]] = [mescolati[j]!, mescolati[i]!];
  }
  for (const esercizioId of mescolati.slice(0, regola.count)) {
    const v = await prisma.esercizioVersione.findFirst({ where: { esercizioId }, orderBy: { version: "desc" } });
    if (v) versioni.push(v.id);
  }
}
```

`compitiDelloStudente` risolve `drawnVersionIds` nei titoli e conta i tentativi completati di quello studente su quel compito. `consegneDelCompito` parte dagli iscritti alla classe, non dai tentativi, così chi non ha iniziato compare comunque.

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/lib/esercizi`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/esercizi/batterie.ts src/lib/esercizi/compiti.ts src/lib/esercizi/__tests__
git commit -m "feat(esercizi): batterie di regole e assegnazione con pesca fissata"
```

---

### Task 5: Rotte API

**Files:**
- Create: `src/app/api/esercizi/classi/insegnate/route.ts` (POST)
- Create: `src/app/api/esercizi/contenitori/route.ts` (POST), `.../[id]/esercizi/route.ts` (POST, DELETE)
- Create: `src/app/api/esercizi/batterie/route.ts` (POST)
- Create: `src/app/api/esercizi/compiti/route.ts` (POST)
- Test: `src/app/api/esercizi/__tests__/compiti-route.test.ts`

**Interfaces:**
- Consumes: le funzioni dei Task 2, 3 e 4; `requireTeacher()` da `@/lib/auth/require-role`; `checkRateLimit` da `@/lib/rate-limit/db-rate-limit`.

Ogni rotta segue lo schema già in uso nel repository, che l'implementer deve leggere in `src/app/api/esercizi/tentativi/[id]/risposta/route.ts`: gate del ruolo, rate limit per utente, `safeParse`, mappa dei motivi sui codici di stato.

Mappa dei codici per `assegna`: `batteria_non_trovata` e `classe_non_trovata` → 404, `non_insegni_questa_classe` → 403, `esercizi_insufficienti` → 409 col dettaglio nel corpo, così l'interfaccia può dire quale contenitore è corto e di quanto.

- [ ] **Step 1: Scrivi i test che falliscono**

Con `vi.mock` su `@/lib/auth/require-role` e sul modulo di dominio, come fa `src/app/api/esercizi/__tests__/route.test.ts`: 401 senza sessione, 403 per ruolo sbagliato, 400 con corpo non valido, 404/403/409 per i motivi di `assegna`, 200 col `compitoId`.

- [ ] **Step 2: Esegui i test e verifica che falliscano**

Run: `npx vitest run src/app/api/esercizi`
Expected: FAIL, le rotte non esistono.

- [ ] **Step 3: Implementa le rotte**

- [ ] **Step 4: Esegui i test e verifica che passino**

Run: `npx vitest run src/app/api/esercizi`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/esercizi
git commit -m "feat(esercizi): rotte di contenitori, batterie, compiti e classi insegnate"
```

---

### Task 6: Interfaccia del docente

**Files:**
- Create: `src/app/(dashboard)/dashboard/esercizi/classi/page.tsx`
- Create: `src/app/(dashboard)/dashboard/esercizi/contenitori/page.tsx`, `.../contenitori/[id]/page.tsx`
- Create: `src/app/(dashboard)/dashboard/esercizi/batterie/page.tsx`
- Create: `src/app/(dashboard)/dashboard/esercizi/compiti/page.tsx`, `.../compiti/[id]/page.tsx`
- Modify: `src/app/(dashboard)/dashboard/esercizi/page.tsx` (collegamenti alle nuove sezioni)
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: un test per pagina in `__tests__/`

Tutte le pagine usano `redirectUnlessTeacher()`. La pagina delle classi mostra l'elenco di `classiDisponibili()` con una casella per ciascuna e salva con `dichiaraInsegnamento`. La pagina di un compito mostra la tabella di `consegneDelCompito`: nome, quanti esercizi su quanti, punteggio.

- [ ] **Step 1: Scrivi i test che falliscono**
- [ ] **Step 2: Esegui e verifica il fallimento**
- [ ] **Step 3: Implementa le pagine**
- [ ] **Step 4: Esegui e verifica il passaggio**
- [ ] **Step 5: Commit**

---

### Task 7: I compiti dallo studente

**Files:**
- Modify: `src/app/(student)/studente/page.tsx`
- Modify: `src/lib/esercizi/tentativo.ts` (`avviaORiprendi` accetta il compito)
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: `src/lib/esercizi/__tests__/tentativo-compito.test.ts`, test della pagina

La home dello studente mostra in cima i compiti aperti della sua classe con la scadenza, e sotto gli esercizi liberi come oggi. Aprire un esercizio di un compito crea un tentativo con `compitoId` valorizzato; aprirlo dal link libero lo lascia a `null`, come adesso.

Il criterio di visibilità: un compito si vede se `opensAt` è nullo o passato. La scadenza non nasconde niente, si mostra e basta — cosa succede a un compito scaduto è un punto aperto della spec.

**Il cambio al dominio, con il suo test.** `avviaORiprendi` oggi ha firma `(studentId, esercizioId)`. Diventa `(studentId, esercizioId, compitoId?)`: quando il compito c'è, il tentativo lo registra e la ripresa cerca fra i tentativi di quel compito. Un esercizio aperto dal link libero continua a comportarsi esattamente come prima.

```ts
it("un tentativo aperto da un compito lo registra", async () => {
  const t = await avviaORiprendi(studentId, esercizioId, compitoId);
  const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: t!.tentativoId } });
  expect(riga.compitoId).toBe(compitoId);
});

it("lo stesso esercizio dentro e fuori dal compito sono due tentativi distinti", async () => {
  const dentro = await avviaORiprendi(studentId, esercizioId, compitoId);
  const fuori = await avviaORiprendi(studentId, esercizioId);
  expect(fuori!.tentativoId).not.toBe(dentro!.tentativoId);
  const riga = await prisma.tentativo.findUniqueOrThrow({ where: { id: fuori!.tentativoId } });
  expect(riga.compitoId).toBeNull();
});

it("riaprire lo stesso esercizio del compito riprende lo stesso tentativo", async () => {
  const a = await avviaORiprendi(studentId, esercizioId, compitoId);
  const b = await avviaORiprendi(studentId, esercizioId, compitoId);
  expect(b!.tentativoId).toBe(a!.tentativoId);
  expect(b!.seed).toBe(a!.seed);
});
```

Il secondo test è quello che conta: senza il filtro su `compitoId` nella ricerca del tentativo in corso, aprire l'esercizio dal compito riprenderebbe quello libero già iniziato, e il lavoro finirebbe attribuito al compito sbagliato.

- [ ] **Step 1: Scrivi i test che falliscono**
- [ ] **Step 2: Esegui e verifica il fallimento**
- [ ] **Step 3: Implementa**
- [ ] **Step 4: Esegui e verifica il passaggio**
- [ ] **Step 5: Commit**

---

### Task 8: Prova end-to-end

**Files:**
- Create: `tests/e2e/esercizi-compiti.spec.ts`
- Modify: `prisma/seed.ts` (una seconda classe e un secondo studente, se servono)

Il docente dichiara di insegnare una classe, crea un contenitore, ci mette due esercizi, compone una batteria da due e la assegna. Lo studente entra, vede il compito, risolve un esercizio. Il docente ricarica le consegne e lo vede a uno su due.

- [ ] **Step 1: Scrivi la prova**
- [ ] **Step 2: Eseguila con `PLAYWRIGHT_PORT` impostata**
- [ ] **Step 3: Commit**

---

## Note per il controllore

- **Il Task 1 fa una migrazione sul database condiviso** con l'ambiente di sviluppo dell'utente. È additiva. Dopo, il server di sviluppo dell'utente va fatto ripartire, altrimenti tiene in memoria un client Prisma che non conosce le tabelle nuove.
- **I Task 2, 3 e 4 toccano il database nei test.** La pulizia deve essere circoscritta per prefisso: una `deleteMany()` su tabella intera ha già reso instabile la suite una volta, ed è stato costoso trovarla.
- **Il Task 2 modifica il cancello di autenticazione**, che è codice del sotto-progetto 1 con i suoi test. Se un test esistente del cancello si rompe, è un segnale, non un fastidio: significa che l'aggancio ha cambiato un comportamento che qualcuno verificava.
- I Task 6 e 7 sono deliberatamente meno dettagliati: sono interfaccia, il dominio sotto è già fissato e testato, e scrivere ogni riga di JSX in un piano produce codice peggiore di quello che scriverebbe chi ha la pagina davanti. I criteri di accettazione stanno nei test richiesti.
