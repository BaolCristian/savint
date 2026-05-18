import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { searchHubQuizzes } from "@/lib/hub/search";

describe("searchHubQuizzes", () => {
  let accountId: string;
  const titles = ["S4T2-Algebra Basics", "S4T2-Storia Romana", "S4T2-Suspended"];

  beforeAll(async () => {
    const acc = await prisma.hubAccount.create({
      data: {
        email: `s-${Date.now()}@t`,
        name: "A",
        authMethod: "PASSWORD",
        passwordHash: "x",
        emailVerified: new Date(),
        linkedProviders: ["password"],
      },
    });
    accountId = acc.id;
    await prisma.hubQuiz.createMany({
      data: [
        {
          hubAccountId: accountId,
          title: titles[0],
          description: "linear equations",
          license: "CC_BY",
          tags: ["algebra"],
          schoolLevel: "SECONDARIA_II",
          subject: "matematica",
          language: "it",
          questionCount: 5,
          estimatedDurationSec: 300,
          payloadBlob: Buffer.from("a") as unknown as Uint8Array<ArrayBuffer>,
          payloadHash: "h1",
          payloadSize: 1,
          playsCount: 10,
          downloadsCount: 3,
        },
        {
          hubAccountId: accountId,
          title: titles[1],
          description: "impero",
          license: "CC_BY_SA",
          tags: ["history"],
          schoolLevel: "SECONDARIA_I",
          subject: "storia",
          language: "it",
          questionCount: 10,
          estimatedDurationSec: 600,
          payloadBlob: Buffer.from("b") as unknown as Uint8Array<ArrayBuffer>,
          payloadHash: "h2",
          payloadSize: 1,
          playsCount: 50,
          downloadsCount: 20,
        },
        {
          hubAccountId: accountId,
          title: titles[2],
          description: "x",
          license: "CC_BY",
          tags: [],
          schoolLevel: "PRIMARIA",
          subject: "matematica",
          language: "it",
          questionCount: 1,
          estimatedDurationSec: 60,
          payloadBlob: Buffer.from("c") as unknown as Uint8Array<ArrayBuffer>,
          payloadHash: "h3",
          payloadSize: 1,
          suspended: true,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.hubQuiz.deleteMany({ where: { hubAccountId: accountId } });
    await prisma.hubAccount.delete({ where: { id: accountId } });
  });

  it("filters by subject", async () => {
    const { items } = await searchHubQuizzes({ subject: "storia" });
    expect(items.some((i) => i.title === titles[1])).toBe(true);
  });

  it("filters by schoolLevel", async () => {
    const { items } = await searchHubQuizzes({ schoolLevel: "SECONDARIA_II" });
    expect(items.some((i) => i.title === titles[0])).toBe(true);
  });

  it("hides suspended", async () => {
    const { items } = await searchHubQuizzes({});
    expect(items.find((i) => i.title === titles[2])).toBeUndefined();
  });

  it("full-text q on title", async () => {
    const { items } = await searchHubQuizzes({ q: "Algebra" });
    expect(items[0]?.title).toBe(titles[0]);
  });

  it("sort=popular orders by downloads + plays weighting", async () => {
    const { items } = await searchHubQuizzes({ sort: "popular" });
    const a = items.findIndex((i) => i.title === titles[0]);
    const b = items.findIndex((i) => i.title === titles[1]);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(a); // Storia (more downloads/plays) ranks higher
  });

  it("paginates with perPage", async () => {
    const { items, total } = await searchHubQuizzes({ page: 1, perPage: 1 });
    expect(items.length).toBe(1);
    expect(total).toBeGreaterThanOrEqual(2);
  });
});
