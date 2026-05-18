/**
 * Integration tests for hub admin actions: dismiss / suspend / ban.
 * Uses the real DB. getHubSession and sendEmail are mocked.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";

vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => undefined) }));

import { POST as dismiss } from "../reports/[id]/dismiss/route";
import { POST as suspend } from "../reports/[id]/suspend/route";
import { POST as ban } from "../accounts/[id]/ban/route";
import { sendEmail } from "@/lib/email/send";
import { getHubSession } from "@/lib/auth/hub-session";

const createdAccountIds: string[] = [];
const createdQuizIds: string[] = [];
const createdReportIds: string[] = [];

async function asAdmin() {
  const a = await prisma.hubAccount.create({
    data: {
      email: `admin-${Date.now()}-${Math.random().toString(36).slice(2)}@x.it`,
      name: "Adm",
      authMethod: "PASSWORD",
      linkedProviders: ["password"],
      role: "HUB_ADMIN",
    },
  });
  createdAccountIds.push(a.id);
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a);
  return a;
}

async function seed() {
  const author = await prisma.hubAccount.create({
    data: {
      email: `author-${Date.now()}-${Math.random().toString(36).slice(2)}@x.it`,
      name: "Au",
      authMethod: "PASSWORD",
      linkedProviders: ["password"],
    },
  });
  createdAccountIds.push(author.id);
  const quiz = await prisma.hubQuiz.create({
    data: {
      hubAccountId: author.id,
      title: "t",
      license: "CC_BY",
      schoolLevel: "PRIMARIA",
      subject: "storia",
      language: "it",
      questionCount: 1,
      estimatedDurationSec: 60,
      payloadBlob: Buffer.from("x") as unknown as Uint8Array<ArrayBuffer>,
      payloadHash: "h",
      payloadSize: 1,
    },
  });
  createdQuizIds.push(quiz.id);
  const report = await prisma.hubReport.create({
    data: { hubQuizId: quiz.id, reporterIpHash: "h", reason: "OFFENSIVE" },
  });
  createdReportIds.push(report.id);
  return { author, quiz, report };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(async () => {
  if (createdReportIds.length) {
    await prisma.hubReport.deleteMany({ where: { id: { in: createdReportIds.splice(0) } } });
  }
  if (createdQuizIds.length) {
    await prisma.hubQuiz.deleteMany({ where: { id: { in: createdQuizIds.splice(0) } } });
  }
  if (createdAccountIds.length) {
    await prisma.hubAccount.deleteMany({ where: { id: { in: createdAccountIds.splice(0) } } });
  }
});

describe("POST /api/hub/admin/reports/:id/dismiss", () => {
  it("sets the report to DISMISSED", async () => {
    await asAdmin();
    const { report } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await dismiss(
      new Request("http://localhost/x", { method: "POST" }) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    const fresh = await prisma.hubReport.findUnique({ where: { id: report.id } });
    expect(fresh?.status).toBe("DISMISSED");
  });

  it("returns 401/403 when not admin", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { report } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await dismiss(
      new Request("http://localhost/x", { method: "POST" }) as never,
      ctx as never,
    );
    expect([401, 403]).toContain(res.status);
  });
});

describe("POST /api/hub/admin/reports/:id/suspend", () => {
  it("suspends the quiz, resolves the report, and emails the author", async () => {
    await asAdmin();
    const { quiz, report, author } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await suspend(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Plagio" }),
      }) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    const q = await prisma.hubQuiz.findUnique({ where: { id: quiz.id } });
    expect(q?.suspended).toBe(true);
    expect(q?.suspendedReason).toBe("Plagio");
    const r = await prisma.hubReport.findUnique({ where: { id: report.id } });
    expect(r?.status).toBe("RESOLVED");
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: author.email }),
    );
  });

  it("returns 401/403 when not admin", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { report } = await seed();
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await suspend(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Plagio" }),
      }) as never,
      ctx as never,
    );
    expect([401, 403]).toContain(res.status);
  });

  it("is idempotent when the report is already resolved", async () => {
    await asAdmin();
    const { report } = await seed();
    await prisma.hubReport.update({
      where: { id: report.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    const ctx = { params: Promise.resolve({ id: report.id }) };
    const res = await suspend(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Plagio" }),
      }) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyResolved?: boolean };
    expect(body.alreadyResolved).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("POST /api/hub/admin/accounts/:id/ban", () => {
  it("bans the account and suspends all their quizzes", async () => {
    await asAdmin();
    const { author, quiz } = await seed();
    const ctx = { params: Promise.resolve({ id: author.id }) };
    const res = await ban(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Abuso ripetuto" }),
      }) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    const a = await prisma.hubAccount.findUnique({ where: { id: author.id } });
    expect(a?.bannedAt).not.toBeNull();
    const q = await prisma.hubQuiz.findUnique({ where: { id: quiz.id } });
    expect(q?.suspended).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: author.email }),
    );
  });

  it("returns 401/403 when not admin", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { author } = await seed();
    const ctx = { params: Promise.resolve({ id: author.id }) };
    const res = await ban(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Abuso ripetuto" }),
      }) as never,
      ctx as never,
    );
    expect([401, 403]).toContain(res.status);
  });

  it("is idempotent when the account is already banned", async () => {
    await asAdmin();
    const { author } = await seed();
    const previousBannedAt = new Date(Date.now() - 60_000);
    await prisma.hubAccount.update({
      where: { id: author.id },
      data: { bannedAt: previousBannedAt },
    });
    const ctx = { params: Promise.resolve({ id: author.id }) };
    const res = await ban(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Abuso ripetuto" }),
      }) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyBanned?: boolean };
    expect(body.alreadyBanned).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    const a = await prisma.hubAccount.findUnique({ where: { id: author.id } });
    expect(a?.bannedAt?.getTime()).toBe(previousBannedAt.getTime());
  });

  it("succeeds even if email sending fails", async () => {
    await asAdmin();
    const { author, quiz } = await seed();
    (sendEmail as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("smtp down"),
    );
    const ctx = { params: Promise.resolve({ id: author.id }) };
    const res = await ban(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Abuso ripetuto" }),
      }) as never,
      ctx as never,
    );
    expect(res.status).toBe(200);
    const a = await prisma.hubAccount.findUnique({ where: { id: author.id } });
    expect(a?.bannedAt).not.toBeNull();
    const q = await prisma.hubQuiz.findUnique({ where: { id: quiz.id } });
    expect(q?.suspended).toBe(true);
  });
});
