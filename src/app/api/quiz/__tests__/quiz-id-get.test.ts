// @vitest-environment node
/**
 * GET /api/quiz/[id] restituisce il quiz (con le risposte giuste) solo a chi
 * può già vederlo nella dashboard: l'autore o un docente con cui è condiviso
 * (QuizShare, qualsiasi permesso). Stessa regola di /api/quiz/[id]/export e
 * della pagina /dashboard/quiz. Agli altri, anche se il quiz è pubblico, 404
 * come per un id inesistente: gli id non si possono sondare. I quiz pubblici
 * si copiano da /api/quiz/duplicate, che ha la sua regola.
 *
 * prisma è finto: `findUnique` applica il filtro `where` su un piccolo
 * archivio in memoria, così il test non tocca il database di sviluppo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({
  user: { id: "autore", role: "TEACHER" } as { id: string; role: string } | null,
}));

type QuizFinto = {
  id: string;
  authorId: string;
  isPublic: boolean;
  title: string;
  shares: { sharedWithId: string }[];
};

const archivio = vi.hoisted(() => ({ quiz: [] as QuizFinto[] }));

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => (authState.user ? { user: authState.user } : null)),
}));

type Where = {
  id: string;
  OR?: ({ authorId: string } | { shares: { some: { sharedWithId: string } } })[];
};

function corrisponde(q: QuizFinto, where: Where): boolean {
  if (q.id !== where.id) return false;
  for (const chiave of Object.keys(where)) {
    if (chiave !== "id" && chiave !== "OR") throw new Error(`filtro non previsto dal finto prisma: ${chiave}`);
  }
  if (!where.OR) return true;
  return where.OR.some((c) =>
    "authorId" in c
      ? q.authorId === c.authorId
      : q.shares.some((s) => s.sharedWithId === c.shares.some.sharedWithId),
  );
}

vi.mock("@/lib/db/client", () => ({
  prisma: {
    quiz: {
      findUnique: vi.fn(
        async ({ where, include }: { where: Where; include?: { author?: { select: Record<string, boolean> } } }) => {
          const q = archivio.quiz.find((x) => corrisponde(x, where));
          if (!q) return null;
          // L'autore esce solo con i campi chiesti nel `select`, come in prisma.
          const autore: Record<string, string> = { name: "Autore", email: "autore@scuola.it" };
          const sel = include?.author?.select;
          return {
            id: q.id,
            authorId: q.authorId,
            isPublic: q.isPublic,
            title: q.title,
            questions: [{ id: "d1", text: "2+2?", options: [{ text: "4", correct: true }] }],
            ...(sel ? { author: Object.fromEntries(Object.keys(sel).filter((k) => sel[k]).map((k) => [k, autore[k]])) } : {}),
          };
        },
      ),
    },
  },
}));

import { GET } from "@/app/api/quiz/[id]/route";

async function chiedi(id: string) {
  return GET(new NextRequest(`http://localhost/api/quiz/${id}`), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  authState.user = { id: "autore", role: "TEACHER" };
  archivio.quiz = [
    { id: "privato", authorId: "autore", isPublic: false, title: "Privato", shares: [{ sharedWithId: "collega" }] },
    { id: "pubblico", authorId: "autore", isPublic: true, title: "Pubblico", shares: [] },
  ];
});

describe("GET /api/quiz/[id]", () => {
  it("l'autore riceve il quiz con le domande", async () => {
    const res = await chiedi("privato");
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.title).toBe("Privato");
    expect(corpo.questions).toHaveLength(1);
  });

  it("un docente estraneo riceve 404, come per un quiz inesistente", async () => {
    authState.user = { id: "estraneo", role: "TEACHER" };
    const res = await chiedi("privato");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("un ADMIN che non è autore né destinatario riceve 404", async () => {
    authState.user = { id: "amministratore", role: "ADMIN" };
    const res = await chiedi("privato");
    expect(res.status).toBe(404);
  });

  it("il docente con cui il quiz è condiviso lo riceve, senza l'email dell'autore", async () => {
    authState.user = { id: "collega", role: "TEACHER" };
    const res = await chiedi("privato");
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.title).toBe("Privato");
    expect(JSON.stringify(corpo)).not.toContain("autore@scuola.it");
  });

  it("un quiz pubblico non basta: il docente estraneo riceve 404", async () => {
    authState.user = { id: "estraneo", role: "TEACHER" };
    const res = await chiedi("pubblico");
    expect(res.status).toBe(404);
  });

  it("un quiz inesistente dà 404", async () => {
    const res = await chiedi("nessuno");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("senza sessione: 401", async () => {
    authState.user = null;
    const res = await chiedi("privato");
    expect(res.status).toBe(401);
  });

  it("uno studente: 403", async () => {
    authState.user = { id: "studente", role: "STUDENT" };
    const res = await chiedi("privato");
    expect(res.status).toBe(403);
  });
});
