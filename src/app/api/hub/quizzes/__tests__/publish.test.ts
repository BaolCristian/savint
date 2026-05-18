import { describe, it, expect, beforeAll, afterAll } from "vitest";
import JSZip from "jszip";
import { createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashToken, generateOpaqueToken } from "@/lib/hub/token-hash";
import { POST } from "@/app/api/hub/quizzes/route";
import { resetRateLimitsByPrefix } from "@/lib/rate-limit/hub-rate-limit";
const _resetForTests = () => Promise.all([
  resetRateLimitsByPrefix("publish:"),
  resetRateLimitsByPrefix("search:"),
]);

async function makeQlz(questions = 2): Promise<{ b64: string; hash: string }> {
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
  const buffer = await z.generateAsync({ type: "nodebuffer" });
  return {
    b64: buffer.toString("base64"),
    hash: createHash("sha256").update(buffer).digest("hex"),
  };
}

const VALID_META = {
  title: "Test Quiz",
  description: "A test quiz",
  license: "CC_BY",
  tags: ["math"],
  schoolLevel: "SECONDARIA_I",
  subject: "matematica",
  language: "it",
  estimatedDurationSec: 120,
};

function makeReq(
  token: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
) {
  return new Request("http://localhost/api/hub/quizzes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }) as never;
}

describe("POST /api/hub/quizzes", () => {
  let hubAccountId: string;
  let installationId: string;
  let publishToken: string;
  let cloneOnlyToken: string;
  let publishTokenRow: { id: string };

  beforeAll(async () => {
    _resetForTests();
    const clientId = `c-${Date.now()}-${Math.random()}`;
    const ha = await prisma.hubAccount.create({
      data: {
        email: `pub-${Date.now()}-${Math.random()}@test.invalid`,
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
      },
    });
    hubAccountId = ha.id;

    const inst = await prisma.installation.create({
      data: {
        name: "TestInst",
        contactEmail: "a@b",
        clientId,
        clientSecretHash: "hash",
      },
    });
    installationId = inst.id;

    publishToken = generateOpaqueToken();
    const pRow = await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(publishToken),
        refreshTokenHash: `rt-pub-${Date.now()}-${Math.random()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["publish"],
      },
    });
    publishTokenRow = pRow;

    cloneOnlyToken = generateOpaqueToken();
    await prisma.hubAccessToken.create({
      data: {
        hubAccountId,
        installationId,
        accessTokenHash: hashToken(cloneOnlyToken),
        refreshTokenHash: `rt-clone-${Date.now()}-${Math.random()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
        refreshTokenExpiresAt: new Date(Date.now() + 90 * 86_400_000),
        scopes: ["clone"],
      },
    });
  });

  afterAll(async () => {
    await prisma.hubQuizVersion.deleteMany({
      where: { hubQuiz: { hubAccountId } },
    });
    await prisma.hubQuiz.deleteMany({ where: { hubAccountId } });
    await prisma.hubAccessToken.deleteMany({ where: { installationId } });
    await prisma.installation.delete({ where: { id: installationId } });
    await prisma.hubAccount.delete({ where: { id: hubAccountId } });
  });

  it("happy path: returns 201 with version 1 and creates HubQuizVersion", async () => {
    _resetForTests();
    const { b64, hash } = await makeQlz(2);
    const res = await POST(
      makeReq(publishToken, { metadata: VALID_META, qlzBase64: b64, payloadHash: hash }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.version).toBe(1);
    expect(body.hubQuizId).toBeTruthy();
    expect(body.publishedAt).toBeTruthy();
    expect(body.url).toContain("/q/");

    const version = await prisma.hubQuizVersion.findFirst({
      where: { hubQuizId: body.hubQuizId, version: 1 },
    });
    expect(version).toBeTruthy();
  });

  it("wrong scope returns 403", async () => {
    _resetForTests();
    const { b64, hash } = await makeQlz(2);
    const res = await POST(
      makeReq(cloneOnlyToken, { metadata: VALID_META, qlzBase64: b64, payloadHash: hash }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("insufficient_scope");
  });

  it("invalid metadata returns 400", async () => {
    _resetForTests();
    const { b64, hash } = await makeQlz(2);
    const badMeta = { ...VALID_META, subject: "not-a-valid-subject" };
    const res = await POST(
      makeReq(publishToken, { metadata: badMeta, qlzBase64: b64, payloadHash: hash }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_metadata");
  });

  it("payload hash mismatch returns 400", async () => {
    _resetForTests();
    const { b64 } = await makeQlz(2);
    const res = await POST(
      makeReq(publishToken, {
        metadata: VALID_META,
        qlzBase64: b64,
        payloadHash: "0".repeat(64),
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("payload_hash_mismatch");
  });

  it("oversize payload returns 413", async () => {
    _resetForTests();
    // Create a buffer larger than 50MB
    const bigBuffer = Buffer.alloc(51 * 1024 * 1024, "x");
    const bigB64 = bigBuffer.toString("base64");
    const bigHash = createHash("sha256").update(bigBuffer).digest("hex");
    const res = await POST(
      makeReq(publishToken, {
        metadata: VALID_META,
        qlzBase64: bigB64,
        payloadHash: bigHash,
      }),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("payload_too_large");
  });

  it("re-publish with If-Match returns 200 with version 2 and creates prior HubQuizVersion", async () => {
    _resetForTests();
    // First publish
    const { b64: b641, hash: hash1 } = await makeQlz(2);
    const res1 = await POST(
      makeReq(publishToken, { metadata: VALID_META, qlzBase64: b641, payloadHash: hash1 }),
    );
    expect(res1.status).toBe(201);
    const body1 = await res1.json();
    const quizId = body1.hubQuizId;

    // Re-publish with If-Match
    _resetForTests();
    const { b64: b642, hash: hash2 } = await makeQlz(3);
    const res2 = await POST(
      makeReq(
        publishToken,
        { metadata: { ...VALID_META, title: "Updated Quiz" }, qlzBase64: b642, payloadHash: hash2 },
        { "if-match": quizId },
      ),
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.version).toBe(2);
    expect(body2.hubQuizId).toBe(quizId);

    // Check prior version row was created
    const versionRows = await prisma.hubQuizVersion.findMany({
      where: { hubQuizId: quizId },
      orderBy: { version: "asc" },
    });
    expect(versionRows.length).toBeGreaterThanOrEqual(2);
    expect(versionRows.some((v) => v.version === 1)).toBe(true);
  });
});
