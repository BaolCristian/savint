import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { hashToken, generateOpaqueToken } from "@/lib/hub/token-hash";
import { GET } from "@/app/api/hub/quizzes/[id]/download/route";
import { _resetForTests } from "@/lib/rate-limit/hub-rate-limit";
import { NextRequest } from "next/server";
import JSZip from "jszip";
import { createHash } from "crypto";

async function makeQlzBuffer(): Promise<Buffer> {
  const z = new JSZip();
  z.file(
    "manifest.json",
    JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      quiz: {
        title: "Download Test",
        questions: [
          {
            type: "TRUE_FALSE",
            text: "q1",
            timeLimit: 10,
            points: 100,
            confidenceEnabled: false,
            options: { correct: true },
          },
        ],
      },
    }),
  );
  return z.generateAsync({ type: "nodebuffer" });
}

describe("GET /api/hub/quizzes/:id/download", () => {
  let hubAccountId: string;
  let installationId: string;
  let hubQuizId: string;
  let cloneToken: string;
  let publishOnlyToken: string;

  beforeAll(async () => {
    _resetForTests();
    const buf = await makeQlzBuffer();
    const hash = createHash("sha256").update(buf).digest("hex");

    const ha = await prisma.hubAccount.create({
      data: {
        email: `dl-${Date.now()}-${Math.random()}@test.invalid`,
        name: "Download Author",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
      },
    });
    hubAccountId = ha.id;

    const inst = await prisma.installation.create({
      data: {
        name: "DlInst",
        contactEmail: "dl@test.invalid",
        clientId: `dl-${Date.now()}-${Math.random()}`,
        clientSecretHash: "hash",
      },
    });
    installationId = inst.id;

    const quiz = await prisma.hubQuiz.create({
      data: {
        hubAccountId,
        title: "Download Test Quiz",
        description: null,
        license: "CC_BY",
        tags: [],
        schoolLevel: "PRIMARIA",
        subject: "matematica",
        language: "it",
        questionCount: 1,
        estimatedDurationSec: 30,
        payloadBlob: buf as unknown as Uint8Array<ArrayBuffer>,
        payloadHash: hash,
        payloadSize: buf.length,
      },
    });
    hubQuizId = quiz.id;

    cloneToken = generateOpaqueToken();
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(cloneToken),
        refreshTokenHash: `rt-dl-clone-${Date.now()}-${Math.random()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["clone"],
      },
    });

    publishOnlyToken = generateOpaqueToken();
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(publishOnlyToken),
        refreshTokenHash: `rt-dl-pub-${Date.now()}-${Math.random()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["publish"],
      },
    });
  });

  afterAll(async () => {
    await prisma.hubQuiz.deleteMany({ where: { hubAccountId } });
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  function makeReq(token?: string) {
    return new NextRequest(`http://localhost/api/hub/quizzes/${hubQuizId}/download`, {
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  }

  it("401 without bearer token", async () => {
    _resetForTests();
    const res = await GET(makeReq(), { params: Promise.resolve({ id: hubQuizId }) });
    expect(res.status).toBe(401);
  });

  it("403 with publish-only scope", async () => {
    _resetForTests();
    const res = await GET(makeReq(publishOnlyToken), {
      params: Promise.resolve({ id: hubQuizId }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("200 returns qlzBase64 and increments downloadsCount", async () => {
    _resetForTests();
    const before = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
    const prevCount = before!.downloadsCount;

    const res = await GET(makeReq(cloneToken), {
      params: Promise.resolve({ id: hubQuizId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.qlzBase64).toBeTruthy();
    expect(body.hubQuizId).toBe(hubQuizId);
    expect(body.hubAuthor).toBe("Download Author");
    expect(body.version).toBe(1);

    const after = await prisma.hubQuiz.findUnique({ where: { id: hubQuizId } });
    expect(after!.downloadsCount).toBe(prevCount + 1);
  });
});
