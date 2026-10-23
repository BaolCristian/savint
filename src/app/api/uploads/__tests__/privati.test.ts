// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { GET } from "@/app/api/uploads/[...path]/route";

// I file sotto public/uploads/privati (i formulari delle verifiche) vivono
// nello stesso volume degli altri caricamenti ma non si servono mai da qui.
const radice = mkdtempSync(path.join(tmpdir(), "uploads-privati-"));
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const NOME = "0f3c2a1e-1b2c-4d5e-8f90-a1b2c3d4e5f6.png";
const appRootPrima = process.env.APP_ROOT;

const get = (segmenti: string[]) => GET({} as never, { params: Promise.resolve({ path: segmenti }) });

beforeAll(() => {
  process.env.APP_ROOT = radice;
  for (const cartella of [["privati", "formulari"], ["esercizi"]]) {
    mkdirSync(path.join(radice, "public", "uploads", ...cartella), { recursive: true });
    writeFileSync(path.join(radice, "public", "uploads", ...cartella, NOME), PNG);
  }
});

afterAll(() => {
  if (appRootPrima === undefined) delete process.env.APP_ROOT;
  else process.env.APP_ROOT = appRootPrima;
  rmSync(radice, { recursive: true, force: true });
});

describe("GET /api/uploads/[...path]", () => {
  it("un file sotto privati ⇒ 404", async () => {
    expect((await get(["privati", "formulari", NOME])).status).toBe(404);
    expect((await get([".", "privati", "formulari", NOME])).status).toBe(404);
    expect((await get(["", "privati", "formulari", NOME])).status).toBe(404);
    expect((await get(["Privati", "formulari", NOME])).status).toBe(404);
  });

  it("un'immagine pubblica si serve ancora", async () => {
    const r = await get(["esercizi", NOME]);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("image/png");
  });
});
