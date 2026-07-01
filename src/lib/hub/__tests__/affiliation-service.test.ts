import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { createRequest, verifyEmail, approve, redeem } from "@/lib/hub/affiliation";

describe("affiliation service", () => {
  const cleanup: string[] = [];
  afterAll(async () => {
    await prisma.affiliationRequest.deleteMany({ where: { id: { in: cleanup } } });
    await prisma.installation.deleteMany({ where: { name: "IIS Flow" } });
  });

  it("percorso completo: create → verify → approve → redeem", async () => {
    const { request, emailToken } = await createRequest({ schoolName: "IIS Flow", province: "UD", installationUrl: "https://quiz.flow.edu.it", contactEmail: "f@flow.edu.it" });
    cleanup.push(request.id);
    expect((await verifyEmail(emailToken)).ok).toBe(true);
    const appr = await approve(request.id, "admin-1");
    expect(appr.ok).toBe(true);
    const red = await redeem((appr as { setupCode: string }).setupCode);
    expect(red.ok).toBe(true);
    expect((red as { clientId: string }).clientId).toMatch(/^inst_/);
    // secondo redeem fallisce (monouso)
    expect((await redeem((appr as { setupCode: string }).setupCode)).ok).toBe(false);
  });
});
