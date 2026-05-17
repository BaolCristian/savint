import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const ORIGINAL = process.env.SAVINT_MODE;

async function importMiddleware() {
  return (await import("@/middleware")).middleware;
}

describe("hub middleware", () => {
  beforeEach(() => { delete process.env.SAVINT_MODE; });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.SAVINT_MODE;
    else process.env.SAVINT_MODE = ORIGINAL;
  });

  it("returns 404 for /hub-register in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-register");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /hub-login in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-login");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /hub-forgot-password in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-forgot-password");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /hub-reset-password in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-reset-password");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /hub-account in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-account");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /hub-verify-email in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-verify-email");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("returns 404 for /api/hub/* in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/api/hub/auth/verify?token=x");
    const res = await middleware(req);
    expect(res?.status).toBe(404);
  });

  it("passes through unrelated routes in installation mode", async () => {
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/dashboard");
    const res = await middleware(req);
    expect(res?.status).not.toBe(404);
  });

  it("passes through hub routes when SAVINT_MODE=hub", async () => {
    process.env.SAVINT_MODE = "hub";
    const middleware = await importMiddleware();
    const req = new NextRequest("http://localhost/hub-register");
    const res = await middleware(req);
    expect(res?.status).not.toBe(404);
  });
});
