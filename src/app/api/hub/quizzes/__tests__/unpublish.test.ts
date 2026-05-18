import { describe, it, expect, beforeAll, afterAll } from "vitest";
import JSZip from "jszip";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashToken, generateOpaqueToken } from "@/lib/hub/token-hash";
import { DELETE } from "@/app/api/hub/quizzes/[id]/route";

async function makeQlz(questions = 2): Promise<Buffer> {
  const z = new JSZip();
  const manifest = {
    version: 1,
    exportedAt: new Date().toISOString(),
    quiz: {
      title: "T",
      questions: Array.from({ length: questions }, (_, i) => ({
        type: "TRUE_FALSE",
        text: `q${i}`,
        timeLimit: 10,
        points: 100,
        confidenceEnabled: false,
        options: { correct: true },
      })),
    },
  };
  z.file("manifest.json", JSON.stringify(manifest));
  return z.generateAsync({ type: "nodebuffer" });
}

function makeReq(token: string, quizId: string) {
  return {
    request: new Request(`http://localhost/api/hub/quizzes/${quizId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    }) as never,
    params: Promise.resolve({ id: quizId }),
  };
}

describe("DELETE /api/hub/quizzes/:id", () => {
  let hubAccountId: string;
  let foreignHubAccountId: string;
  let installationId: string;
  let publishToken: string;
  let foreignToken: string;
  let cloneOnlyToken: string;
  let quizId: string;

  beforeAll(async () => {
    const suffix = `${Date.now()}-${Math.random()}`;

    const ha = await prisma.hubAccount.create({
      data: {
        email: `unpub-owner-${suffix}@test.invalid`,
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
      },
    });
    hubAccountId = ha.id;

    const ha2 = await prisma.hubAccount.create({
      data: {
        email: `unpub-foreign-${suffix}@test.invalid`,
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
      },
    });
    foreignHubAccountId = ha2.id;

    const inst = await prisma.installation.create({
      data: {
        name: "TestInst",
        contactEmail: "a@b",
        clientId: `c-${suffix}`,
        clientSecretHash: "hash",
      },
    });
    installationId = inst.id;

    publishToken = generateOpaqueToken();
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(publishToken),
        refreshTokenHash: `rt-pub-${suffix}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["publish"],
      },
    });

    foreignToken = generateOpaqueToken();
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId: foreignHubAccountId,
        installationId,
        accessTokenHash: hashToken(foreignToken),
        refreshTokenHash: `rt-foreign-${suffix}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["publish"],
      },
    });

    cloneOnlyToken = generateOpaqueToken();
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(cloneOnlyToken),
        refreshTokenHash: `rt-clone-${suffix}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["clone"],
      },
    });

    // Create a quiz owned by hubAccountId
    const buf = await makeQlz(2);
    const quiz = await prisma.hubQuiz.create({
      data: {
        hubAccountId,
        title: "Test Quiz",
        schoolLevel: "SECONDARIA_I",
        subject: "matematica",
        language: "it",
        questionCount: 2,
        estimatedDurationSec: 60,
        payloadBlob: buf as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: createHash("sha256").update(buf).digest("hex"),
        payloadSize: buf.length,
      },
    });
    quizId = quiz.id;
  });

  afterAll(async () => {
    await prisma.hubQuizVersion.deleteMany({
      where: { hubQuiz: { hubAccountId } },
    });
    await prisma.hubQuiz.deleteMany({ where: { hubAccountId } });
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.deleteMany({
      where: { id: { in: [hubAccountId, foreignHubAccountId] } },
    });
  });

  it("foreign account token returns 403", async () => {
    const { request, params } = makeReq(foreignToken, quizId);
    const res = await DELETE(request, { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("happy path returns 200 with unpublishedAt set", async () => {
    const { request, params } = makeReq(publishToken, quizId);
    const res = await DELETE(request, { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(quizId);
    expect(body.unpublishedAt).toBeTruthy();

    // Verify in DB
    const quiz = await prisma.hubQuiz.findUnique({ where: { id: quizId } });
    expect(quiz?.unpublishedAt).toBeTruthy();
  });

  it("clone-only token returns 403", async () => {
    const { request, params } = makeReq(cloneOnlyToken, quizId);
    const res = await DELETE(request, { params });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });
});
