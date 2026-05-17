import { createHash, randomBytes } from "crypto";
import { VerificationPurpose } from "@prisma/client";
import { prisma } from "@/lib/db/client";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function issueVerificationToken(
  hubAccountId: string,
  purpose: VerificationPurpose,
): Promise<{ plainToken: string; expiresAt: Date }> {
  const plainToken = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(plainToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  await prisma.emailVerificationToken.create({
    data: { hubAccountId, tokenHash, purpose, expiresAt },
  });
  return { plainToken, expiresAt };
}

export async function consumeVerificationToken(
  plainToken: string,
  purpose: VerificationPurpose,
): Promise<{ hubAccountId: string } | null> {
  if (!plainToken || plainToken.length < 32) return null;
  const tokenHash = sha256Hex(plainToken);
  const row = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!row) return null;
  if (row.purpose !== purpose) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await prisma.emailVerificationToken.update({
    where: { tokenHash },
    data: { usedAt: new Date() },
  });
  return { hubAccountId: row.hubAccountId };
}
