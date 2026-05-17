import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("HubAccount schema", () => {
  it("exposes hubAccount and emailVerificationToken delegates", () => {
    const prisma = new PrismaClient();
    expect(typeof prisma.hubAccount.create).toBe("function");
    expect(typeof prisma.emailVerificationToken.create).toBe("function");
    expect(typeof prisma.hubAccount.findUnique).toBe("function");
  });

  it("exposes HubAccountRole / HubAuthMethod / VerificationPurpose enums", async () => {
    const enums = await import("@prisma/client");
    expect(enums.HubAccountRole.HUB_ADMIN).toBe("HUB_ADMIN");
    expect(enums.HubAccountRole.HUB_USER).toBe("HUB_USER");
    expect(enums.HubAuthMethod.GOOGLE).toBe("GOOGLE");
    expect(enums.HubAuthMethod.PASSWORD).toBe("PASSWORD");
    expect(enums.VerificationPurpose.VERIFY_EMAIL).toBe("VERIFY_EMAIL");
    expect(enums.VerificationPurpose.RESET_PASSWORD).toBe("RESET_PASSWORD");
  });
});
