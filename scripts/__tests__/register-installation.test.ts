import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { registerInstallation } from "../register-installation";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await prisma.installation.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

describe("registerInstallation", () => {
  it("crea un'Installation e ritorna un secret che verifica contro l'hash salvato", async () => {
    const res = await registerInstallation({
      name: "Test School",
      contactEmail: "IT@Test.School",
    });
    createdIds.push(res.id);

    expect(res.clientId).toMatch(/^inst_[0-9a-f]{32}$/);
    expect(res.clientSecret.length).toBeGreaterThanOrEqual(32);

    const row = await prisma.installation.findUnique({ where: { id: res.id } });
    expect(row).not.toBeNull();
    expect(row!.clientId).toBe(res.clientId);
    expect(row!.name).toBe("Test School");
    expect(row!.contactEmail).toBe("it@test.school"); // normalizzato lowercase
    expect(await verifyPassword(res.clientSecret, row!.clientSecretHash)).toBe(true);
    expect(await verifyPassword("wrong", row!.clientSecretHash)).toBe(false);
  });

  it("rifiuta name o email mancanti", async () => {
    await expect(registerInstallation({ name: "", contactEmail: "a@b.c" })).rejects.toThrow();
    await expect(registerInstallation({ name: "X", contactEmail: "" })).rejects.toThrow();
  });
});
