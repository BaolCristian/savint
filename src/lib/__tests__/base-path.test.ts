import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_NEXT = process.env.__NEXT_ROUTER_BASEPATH;
const ORIGINAL_BASE = process.env.BASE_PATH;

async function loadFresh() {
  // base-path.ts calcola BASE_PATH a import-time: serve un import isolato.
  vi.resetModules();
  return await import("../base-path");
}

describe("base-path", () => {
  beforeEach(() => {
    delete process.env.__NEXT_ROUTER_BASEPATH;
    delete process.env.BASE_PATH;
  });
  afterEach(() => {
    if (ORIGINAL_NEXT === undefined) delete process.env.__NEXT_ROUTER_BASEPATH;
    else process.env.__NEXT_ROUTER_BASEPATH = ORIGINAL_NEXT;
    if (ORIGINAL_BASE === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = ORIGINAL_BASE;
  });

  it("defaults to empty base path (root)", async () => {
    const { BASE_PATH, withBasePath } = await loadFresh();
    expect(BASE_PATH).toBe("");
    expect(withBasePath("/logo.png")).toBe("/logo.png");
  });

  it("uses __NEXT_ROUTER_BASEPATH when set", async () => {
    process.env.__NEXT_ROUTER_BASEPATH = "/demo";
    const { BASE_PATH, withBasePath } = await loadFresh();
    expect(BASE_PATH).toBe("/demo");
    expect(withBasePath("/logo.png")).toBe("/demo/logo.png");
  });

  it("falls back to BASE_PATH env (custom server context)", async () => {
    process.env.BASE_PATH = "/demo";
    const { BASE_PATH } = await loadFresh();
    expect(BASE_PATH).toBe("/demo");
  });

  it("does not double-prefix an already-prefixed path", async () => {
    process.env.__NEXT_ROUTER_BASEPATH = "/demo";
    const { withBasePath } = await loadFresh();
    expect(withBasePath("/demo/logo.png")).toBe("/demo/logo.png");
  });
});
