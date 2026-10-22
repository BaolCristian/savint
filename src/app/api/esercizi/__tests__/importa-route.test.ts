import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/require-role", () => ({
  requireTeacher: vi.fn(),
}));
vi.mock("@/lib/esercizi/importa/importa", () => ({
  controllaImport: vi.fn(),
  importaEsercizi: vi.fn(),
}));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
}));

import { requireTeacher } from "@/lib/auth/require-role";
import { controllaImport, importaEsercizi } from "@/lib/esercizi/importa/importa";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST as POST_IMPORTA } from "@/app/api/esercizi/redazione/importa/route";
import { POST as POST_VERIFICA } from "@/app/api/esercizi/redazione/importa/verifica/route";

// Gli elementi restano grezzi: la rotta non li valida, li passa così come
// sono al dominio, che li controlla uno per uno. Il secondo qui sotto non è
// nemmeno un esercizio, e deve arrivare intatto lo stesso.
const elem1 = { meta: { titolo: "Uno" }, testo: "x" };
const elem2 = "non sono un oggetto";

// La configurazione non azzera i mock fra un test e l'altro: senza questo,
// i `not.toHaveBeenCalled()` vedrebbero le chiamate dei test precedenti.
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

// Le due rotte condividono gate, tetto, dimensione e schema del corpo:
// stessi casi, ognuna con la sua chiave e il suo metodo del dominio.
const rotte = [
  {
    nome: "POST /api/esercizi/redazione/importa/verifica",
    url: "http://x/api/esercizi/redazione/importa/verifica",
    POST: POST_VERIFICA,
    dominio: controllaImport,
    chiave: "esercizi:redazione-importa-verifica:docente1",
  },
  {
    nome: "POST /api/esercizi/redazione/importa",
    url: "http://x/api/esercizi/redazione/importa",
    POST: POST_IMPORTA,
    dominio: importaEsercizi,
    chiave: "esercizi:redazione-importa:docente1",
  },
] as const;

for (const rotta of rotte) {
  describe(rotta.nome, () => {
    const richiestaTesto = (body: string) => new Request(rotta.url, { method: "POST", body });
    const richiesta = (body: unknown) => richiestaTesto(JSON.stringify(body));
    const corpoValido = { esercizi: [elem1, elem2] };

    it("401 se non autenticato", async () => {
      vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
      expect((await rotta.POST(richiesta(corpoValido))).status).toBe(401);
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("403 per ruolo sbagliato", async () => {
      vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
      expect((await rotta.POST(richiesta(corpoValido))).status).toBe(403);
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("429 quando il rate limit scatta, senza chiamare il dominio", async () => {
      vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 12 });
      const r = await rotta.POST(richiesta(corpoValido));
      expect(r.status).toBe(429);
      expect(r.headers.get("Retry-After")).toBe("12");
      expect(await r.json()).toEqual({ error: "rate_limited" });
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("il tetto e' contato per docente, con la sua chiave, 10 al minuto", async () => {
      vi.mocked(rotta.dominio).mockResolvedValue([]);
      await rotta.POST(richiesta(corpoValido));
      expect(checkRateLimit).toHaveBeenCalledWith({ key: rotta.chiave, windowSeconds: 60, max: 10 });
    });

    it("413 con un corpo di 1_000_001 caratteri", async () => {
      const r = await rotta.POST(richiestaTesto("a".repeat(1_000_001)));
      expect(r.status).toBe(413);
      expect(await r.json()).toEqual({ error: "troppo_grande" });
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    // Il tetto è in byte UTF-8, non in caratteri: 500_001 "è" sono due
    // byte l'uno, quindi oltre il milione anche se i caratteri sono la metà.
    it("413 contando i byte UTF-8, non i caratteri", async () => {
      const r = await rotta.POST(richiestaTesto("è".repeat(500_001)));
      expect(r.status).toBe(413);
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("400 con un corpo che non e' JSON", async () => {
      const r = await rotta.POST(richiestaTesto("{ non json"));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "invalid_body" });
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("400 con {} (manca l'array)", async () => {
      const r = await rotta.POST(richiesta({}));
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "invalid_body" });
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("400 con un array vuoto", async () => {
      const r = await rotta.POST(richiesta({ esercizi: [] }));
      expect(r.status).toBe(400);
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("400 con 31 elementi", async () => {
      const r = await rotta.POST(richiesta({ esercizi: Array.from({ length: 31 }, () => elem1) }));
      expect(r.status).toBe(400);
      expect(rotta.dominio).not.toHaveBeenCalled();
    });

    it("accetta 30 elementi", async () => {
      vi.mocked(rotta.dominio).mockResolvedValue([]);
      const r = await rotta.POST(richiesta({ esercizi: Array.from({ length: 30 }, () => elem1) }));
      expect(r.status).toBe(200);
    });
  });
}

describe("POST /api/esercizi/redazione/importa/verifica (esito)", () => {
  it("200 che passa gli elementi grezzi al dominio e restituisce { esiti }", async () => {
    const esiti = [
      { indice: 0, titolo: "Uno", stato: "ok" },
      { indice: 1, titolo: null, stato: "invalido", problemi: [] },
    ];
    vi.mocked(controllaImport).mockResolvedValue(esiti as never);
    const r = await POST_VERIFICA(
      new Request("http://x/api/esercizi/redazione/importa/verifica", {
        method: "POST", body: JSON.stringify({ esercizi: [elem1, elem2] }),
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ esiti });
    expect(controllaImport).toHaveBeenCalledWith([elem1, elem2], { id: "docente1", admin: false });
    expect(importaEsercizi).not.toHaveBeenCalled();
  });
});

describe("POST /api/esercizi/redazione/importa (esito)", () => {
  it("200 che passa gli elementi grezzi e il docente della sessione, e restituisce { esiti }", async () => {
    const esiti = [
      { indice: 0, titolo: "Uno", stato: "creato", esercizioId: "e1" },
      { indice: 1, titolo: null, stato: "invalido", problemi: [] },
    ];
    vi.mocked(importaEsercizi).mockResolvedValue(esiti as never);
    const r = await POST_IMPORTA(
      new Request("http://x/api/esercizi/redazione/importa", {
        method: "POST", body: JSON.stringify({ esercizi: [elem1, elem2] }),
      }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ esiti });
    expect(importaEsercizi).toHaveBeenCalledWith([elem1, elem2], { id: "docente1", admin: false });
    expect(controllaImport).not.toHaveBeenCalled();
  });
});
