import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

describe("AffiliationRequest model", () => {
  const ids: string[] = [];
  afterAll(async () => { await prisma.affiliationRequest.deleteMany({ where: { id: { in: ids } } }); });

  it("crea una richiesta con default PENDING_EMAIL", async () => {
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "IIS Test", province: "UD", installationUrl: "https://quiz.test.edu.it", contactEmail: "t@test.edu.it" },
    });
    ids.push(r.id);
    expect(r.status).toBe("PENDING_EMAIL");
  });
});
