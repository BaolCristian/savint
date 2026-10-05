// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";

vi.mock("@/lib/auth/require-role", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/rate-limit/db-rate-limit", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true })) }));

import { requireTeacher } from "@/lib/auth/require-role";
import { checkRateLimit } from "@/lib/rate-limit/db-rate-limit";
import { POST } from "@/app/api/esercizi/immagini/route";
import { NOME_FILE_IMMAGINE } from "@/lib/esercizi/immagini";

const radice = mkdtempSync(path.join(tmpdir(), "immagini-esercizi-"));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function richiesta(file?: File) {
  const dati = new FormData();
  if (file) dati.append("file", file);
  return new Request("http://x/api/esercizi/immagini", { method: "POST", body: dati }) as never;
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

describe("POST /api/esercizi/immagini", () => {
  it("salva un PNG e restituisce solo il nome del file", async () => {
    const r = await POST(richiesta(new File([PNG], "figura.png", { type: "image/png" })));
    expect(r.status).toBe(201);
    const { file } = (await r.json()) as { file: string };
    expect(file).toMatch(NOME_FILE_IMMAGINE);
    expect(file.endsWith(".png")).toBe(true);
    const salvato = path.join(radice, "public", "uploads", "esercizi", file);
    expect(existsSync(salvato)).toBe(true);
    expect(new Uint8Array(readFileSync(salvato))).toEqual(PNG);
  });

  it("accetta un JPEG", async () => {
    const r = await POST(richiesta(new File([JPG], "foto.jpg", { type: "image/jpeg" })));
    expect(r.status).toBe(201);
    expect(((await r.json()) as { file: string }).file.endsWith(".jpg")).toBe(true);
  });

  it("rifiuta un tipo non ammesso (SVG può contenere script)", async () => {
    const r = await POST(richiesta(new File(["<svg/>"], "a.svg", { type: "image/svg+xml" })));
    expect(r.status).toBe(400);
  });

  // Il tipo dichiarato dal browser non basta: si guardano i primi byte.
  it("rifiuta un file che dice di essere PNG ma non lo è", async () => {
    const r = await POST(richiesta(new File(["<html>ciao</html>"], "finto.png", { type: "image/png" })));
    expect(r.status).toBe(400);
  });

  it("rifiuta un file oltre i 5 MB", async () => {
    const grande = new Uint8Array(5 * 1024 * 1024 + 1);
    grande.set(PNG);
    const r = await POST(richiesta(new File([grande], "grande.png", { type: "image/png" })));
    expect(r.status).toBe(400);
  });

  it("rifiuta una richiesta senza file", async () => {
    expect((await POST(richiesta())).status).toBe(400);
  });

  it("429 quando il limite di richieste scatta", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, retryAfterSeconds: 20 });
    const r = await POST(richiesta(new File([PNG], "figura.png", { type: "image/png" })));
    expect(r.status).toBe(429);
  });

  it("chi non è docente non passa", async () => {
    vi.mocked(requireTeacher).mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) } as never);
    const r = await POST(richiesta(new File([PNG], "figura.png", { type: "image/png" })));
    expect(r.status).toBe(403);
  });
});
