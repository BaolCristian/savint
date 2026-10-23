// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

vi.mock("@/lib/auth/require-role", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/verifiche/formulari/route";
import { leggiFormulario, NOME_FILE_FORMULARIO } from "@/lib/esercizi/formulari";

const radice = mkdtempSync(path.join(tmpdir(), "formulari-verifica-"));
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj <<>> endobj\n%%EOF\n");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

function richiesta(file?: File) {
  const dati = new FormData();
  if (file) dati.append("file", file);
  return new Request("http://x/api/esercizi/verifiche/formulari", { method: "POST", body: dati }) as never;
}

beforeEach(() => {
  process.env.APP_ROOT = radice;
  vi.mocked(requireTeacher).mockResolvedValue({ ok: true, session: { user: { id: "docente1" } } } as never);
  vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true });
});

afterAll(() => {
  delete process.env.APP_ROOT;
  rmSync(radice, { recursive: true, force: true });
});

describe("POST /api/esercizi/verifiche/formulari", () => {
  it("salva un PDF vero sotto privati/formulari e restituisce solo il nome", async () => {
    const r = await POST(richiesta(new File([PDF], "formulario.pdf", { type: "application/pdf" })));
    expect(r.status).toBe(201);
    const { file } = (await r.json()) as { file: string };
    expect(file).toMatch(NOME_FILE_FORMULARIO);
    expect(file.endsWith(".pdf")).toBe(true);
    const salvato = path.join(radice, "public", "uploads", "privati", "formulari", file);
    expect(existsSync(salvato)).toBe(true);
    expect(new Uint8Array(readFileSync(salvato))).toEqual(PDF);
    expect(await leggiFormulario(file)).toEqual({ byte: PDF, tipo: "application/pdf" });
  });

  it("accetta un'immagine PNG", async () => {
    const r = await POST(richiesta(new File([PNG], "f.png", { type: "image/png" })));
    expect(r.status).toBe(201);
    expect(((await r.json()) as { file: string }).file.endsWith(".png")).toBe(true);
  });

  it("un HTML rinominato .pdf ⇒ 400 tipo_non_ammesso", async () => {
    const r = await POST(richiesta(new File(["<html>ciao</html>"], "finto.pdf", { type: "application/pdf" })));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "tipo_non_ammesso" });
  });

  it("un tipo non ammesso ⇒ 400 tipo_non_ammesso", async () => {
    const r = await POST(richiesta(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })));
    expect(await r.json()).toEqual({ error: "tipo_non_ammesso" });
  });

  it("oltre i 10 MB ⇒ 400 troppo_grande", async () => {
    const grande = new Uint8Array(10 * 1024 * 1024 + 1);
    grande.set(PDF);
    const r = await POST(richiesta(new File([grande], "g.pdf", { type: "application/pdf" })));
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "troppo_grande" });
  });

  it("senza file ⇒ 400", async () => {
    expect((await POST(richiesta())).status).toBe(400);
  });

  it("429 quando il limite scatta (10 al minuto, per docente)", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    const r = await POST(richiesta(new File([PDF], "f.pdf", { type: "application/pdf" })));
    expect(r.status).toBe(429);
    expect(checkRateLimit).toHaveBeenCalledWith(expect.objectContaining({ max: 10, key: expect.stringContaining("docente1") }));
  });

  it("chi non è docente non passa", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    expect((await POST(richiesta(new File([PDF], "f.pdf", { type: "application/pdf" })))).status).toBe(403);
  });
});

describe("leggiFormulario", () => {
  it("null per un nome fuori forma o un file che non c'è", async () => {
    expect(await leggiFormulario("../../etc/passwd")).toBeNull();
    expect(await leggiFormulario("0f3c2a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6.pdf")).toBeNull();
  });
});
