/**
 * Tests for requireHubAdmin. Uses real DB to seed HubAccount rows and mocks
 * getHubSession to return the seeded row (matches the production return shape).
 */
import { describe, it, expect, vi } from "vitest";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));

import { requireHubAdmin } from "../require-hub-admin";
import { getHubSession } from "@/lib/auth/hub-session";

const mockReq = () => new Request("http://localhost/x") as never;

describe("requireHubAdmin", () => {
  it("returns 401 when there is no session", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const r = await requireHubAdmin(mockReq());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("returns 403 when account is not HUB_ADMIN", async () => {
    const u = await prisma.hubAccount.create({
      data: {
        email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@x.it`,
        name: "U",
        authMethod: "PASSWORD",
        linkedProviders: ["password"],
        role: "HUB_USER",
      },
    });
    try {
      (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(u);
      const r = await requireHubAdmin(mockReq());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(403);
    } finally {
      await prisma.hubAccount.delete({ where: { id: u.id } });
    }
  });

  it("returns ok with account when HUB_ADMIN", async () => {
    const u = await prisma.hubAccount.create({
      data: {
        email: `a-${Date.now()}-${Math.random().toString(36).slice(2)}@x.it`,
        name: "A",
        authMethod: "PASSWORD",
        linkedProviders: ["password"],
        role: "HUB_ADMIN",
      },
    });
    try {
      (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValueOnce(u);
      const r = await requireHubAdmin(mockReq());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.account.id).toBe(u.id);
    } finally {
      await prisma.hubAccount.delete({ where: { id: u.id } });
    }
  });
});
