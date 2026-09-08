// src/app/api/__tests__/teacher-only-routes.test.ts
// @vitest-environment node
/**
 * Ogni route docente deve rispondere 403 a uno STUDENT prima di toccare il DB
 * e lasciar passare un TEACHER. prisma è un proxy che lancia: se una route lo
 * tocca prima del controllo del ruolo, il test fallisce con un messaggio
 * chiaro; con il TEACHER quel lancio significa "controllo del ruolo passato".
 *
 * Il registro copre anche il verso opposto: le poche route DELLO STUDENTE
 * (`studentRoutes`, sotto) devono rispondere 403 a un TEACHER e lasciar
 * passare uno STUDENT — l'esatto contrario. Una route registrata nella lista
 * sbagliata renderebbe questo file una bugia: o inutilizzabile per gli
 * studenti (guardia da docente su una rotta loro), o aperta a chiunque
 * (nessuna guardia sulla lista giusta). Vedi esercizi/classi/iscrizione, la
 * prima ad entrare in questo secondo elenco.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ role: "STUDENT" as "STUDENT" | "TEACHER" }));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "s1", role: authState.role, name: "S", email: "s@x.it" } })),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: new Proxy({}, { get: (_t, prop) => { throw new Error(`prisma.${String(prop)} toccato prima del controllo del ruolo`); } }),
}));

type Handler = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Entry = { name: string; load: () => Promise<Record<string, unknown>>; methods: string[] };

const routes: Entry[] = [
  { name: "quiz", load: () => import("@/app/api/quiz/route"), methods: ["GET", "POST"] },
  { name: "quiz/[id]", load: () => import("@/app/api/quiz/[id]/route"), methods: ["GET", "PUT", "DELETE"] },
  { name: "quiz/[id]/export", load: () => import("@/app/api/quiz/[id]/export/route"), methods: ["GET"] },
  { name: "quiz/[id]/share", load: () => import("@/app/api/quiz/[id]/share/route"), methods: ["POST", "GET", "DELETE"] },
  { name: "quiz/duplicate", load: () => import("@/app/api/quiz/duplicate/route"), methods: ["POST"] },
  { name: "quiz/excel-import", load: () => import("@/app/api/quiz/excel-import/route"), methods: ["POST"] },
  { name: "quiz/excel-template", load: () => import("@/app/api/quiz/excel-template/route"), methods: ["GET"] },
  { name: "quiz/import", load: () => import("@/app/api/quiz/import/route"), methods: ["POST"] },
  { name: "quiz/moodle-import", load: () => import("@/app/api/quiz/moodle-import/route"), methods: ["POST"] },
  { name: "session", load: () => import("@/app/api/session/route"), methods: ["POST", "GET"] },
  { name: "session/[id]", load: () => import("@/app/api/session/[id]/route"), methods: ["PATCH", "DELETE"] },
  { name: "stats/export", load: () => import("@/app/api/stats/export/route"), methods: ["GET"] },
  { name: "upload", load: () => import("@/app/api/upload/route"), methods: ["POST"] },
  { name: "report", load: () => import("@/app/api/report/route"), methods: ["POST"] },
  { name: "consent", load: () => import("@/app/api/consent/route"), methods: ["POST"] },
  { name: "consent/check", load: () => import("@/app/api/consent/check/route"), methods: ["GET"] },
  { name: "image-search", load: () => import("@/app/api/image-search/route"), methods: ["GET"] },
  { name: "dashboard/hub/clone", load: () => import("@/app/api/dashboard/hub/clone/route"), methods: ["POST"] },
  { name: "hub/oauth/start", load: () => import("@/app/api/hub/oauth/start/route"), methods: ["GET"] },
  { name: "hub/oauth/callback", load: () => import("@/app/api/hub/oauth/callback/route"), methods: ["GET"] },
  { name: "hub/oauth/link", load: () => import("@/app/api/hub/oauth/link/route"), methods: ["DELETE"] },
  { name: "hub/quiz/[id]/publish", load: () => import("@/app/api/hub/quiz/[id]/publish/route"), methods: ["POST", "DELETE"] },
  { name: "installation/hub/connect", load: () => import("@/app/api/installation/hub/connect/route"), methods: ["POST"] },
  { name: "esercizi/classi/insegnate", load: () => import("@/app/api/esercizi/classi/insegnate/route"), methods: ["POST"] },
  { name: "esercizi/classi", load: () => import("@/app/api/esercizi/classi/route"), methods: ["POST"] },
  { name: "esercizi/classi/[id]/codice", load: () => import("@/app/api/esercizi/classi/[id]/codice/route"), methods: ["POST"] },
  { name: "esercizi/contenitori", load: () => import("@/app/api/esercizi/contenitori/route"), methods: ["POST"] },
  { name: "esercizi/contenitori/[id]", load: () => import("@/app/api/esercizi/contenitori/[id]/route"), methods: ["DELETE"] },
  { name: "esercizi/contenitori/[id]/esercizi", load: () => import("@/app/api/esercizi/contenitori/[id]/esercizi/route"), methods: ["POST", "DELETE"] },
  { name: "esercizi/batterie", load: () => import("@/app/api/esercizi/batterie/route"), methods: ["POST"] },
  { name: "esercizi/batterie/[id]", load: () => import("@/app/api/esercizi/batterie/[id]/route"), methods: ["DELETE"] },
  { name: "esercizi/compiti", load: () => import("@/app/api/esercizi/compiti/route"), methods: ["POST"] },
  { name: "esercizi/redazione", load: () => import("@/app/api/esercizi/redazione/route"), methods: ["GET", "POST"] },
  { name: "esercizi/redazione/[id]", load: () => import("@/app/api/esercizi/redazione/[id]/route"), methods: ["GET", "PUT"] },
  { name: "esercizi/redazione/[id]/duplica", load: () => import("@/app/api/esercizi/redazione/[id]/duplica/route"), methods: ["POST"] },
  { name: "esercizi/redazione/verifica", load: () => import("@/app/api/esercizi/redazione/verifica/route"), methods: ["POST"] },
];

// Le rotte DELLO STUDENTE, dietro `requireStudent` invece di
// `requireTeacher`: il verso delle due describe più sotto che le usano è
// rovesciato rispetto a quello di `routes` (un TEACHER va respinto con 403,
// uno STUDENT deve passare) — vedi il commento in testa al file.
const studentRoutes: Entry[] = [
  { name: "esercizi/classi/iscrizione", load: () => import("@/app/api/esercizi/classi/iscrizione/route"), methods: ["POST"] },
];

function requestFor(r: Entry, m: string): NextRequest {
  return new NextRequest(`http://localhost/api/${r.name}?q=x&sessionId=x`, { method: m });
}

async function handlerOf(r: Entry, m: string): Promise<Handler> {
  const mod = await r.load();
  const handler = mod[m] as Handler;
  expect(typeof handler, `handler ${m} mancante in ${r.name}`).toBe("function");
  return handler;
}

describe("teacher-only routes reject STUDENT with 403", () => {
  beforeEach(() => {
    authState.role = "STUDENT";
  });

  for (const r of routes) {
    for (const m of r.methods) {
      it(`${m} /api/${r.name}`, async () => {
        const handler = await handlerOf(r, m);
        const res = await handler(requestFor(r, m), { params: Promise.resolve({ id: "x", sessionId: "x" }) });
        expect(res.status).toBe(403);
      });
    }
  }
});

describe("teacher-only routes let TEACHER through the role check", () => {
  beforeEach(() => {
    authState.role = "TEACHER";
    // Nessuna chiamata di rete vera dai test: le route che escono (Pixabay,
    // hub) devono fallire subito, non raggiungere internet.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rete non disponibile nei test"); }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const r of routes) {
    for (const m of r.methods) {
      it(`${m} /api/${r.name}`, async () => {
        const handler = await handlerOf(r, m);
        // Superato il controllo del ruolo la route tocca il proxy di prisma (o
        // un body assente) e lancia: qualunque esito diverso da 401/403 va bene.
        let status: number | "threw";
        try {
          status = (await handler(requestFor(r, m), { params: Promise.resolve({ id: "x", sessionId: "x" }) })).status;
        } catch {
          status = "threw";
        }
        expect(status, `${m} /api/${r.name} non ha superato il controllo del ruolo`).not.toBe(403);
        expect(status, `${m} /api/${r.name} non ha superato il controllo del ruolo`).not.toBe(401);
      });
    }
  }
});

describe("student-only routes reject TEACHER with 403", () => {
  beforeEach(() => {
    authState.role = "TEACHER";
  });

  for (const r of studentRoutes) {
    for (const m of r.methods) {
      it(`${m} /api/${r.name}`, async () => {
        const handler = await handlerOf(r, m);
        const res = await handler(requestFor(r, m), { params: Promise.resolve({ id: "x", sessionId: "x" }) });
        expect(res.status).toBe(403);
      });
    }
  }
});

describe("student-only routes let STUDENT through the role check", () => {
  beforeEach(() => {
    authState.role = "STUDENT";
    // Stessa disciplina del blocco gemello sopra: nessuna chiamata di rete
    // vera dai test.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rete non disponibile nei test"); }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  for (const r of studentRoutes) {
    for (const m of r.methods) {
      it(`${m} /api/${r.name}`, async () => {
        const handler = await handlerOf(r, m);
        // Superato il controllo del ruolo la route tocca il proxy di prisma (o
        // un body assente) e lancia: qualunque esito diverso da 401/403 va bene.
        let status: number | "threw";
        try {
          status = (await handler(requestFor(r, m), { params: Promise.resolve({ id: "x", sessionId: "x" }) })).status;
        } catch {
          status = "threw";
        }
        expect(status, `${m} /api/${r.name} non ha superato il controllo del ruolo`).not.toBe(403);
        expect(status, `${m} /api/${r.name} non ha superato il controllo del ruolo`).not.toBe(401);
      });
    }
  }
});
