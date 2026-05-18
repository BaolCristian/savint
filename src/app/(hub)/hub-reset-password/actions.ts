"use server";

import { z } from "zod";
import { consumeVerificationToken } from "@/lib/auth/verification-token";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

const schema = z.object({
  token: z.string().min(32),
  newPassword: z.string().min(8),
});

export type ResetResult =
  | { ok: true }
  | { ok: false; error: "invalid_token" | "weak_password" };

export async function resetPassword(input: z.input<typeof schema>): Promise<ResetResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "newPassword") return { ok: false, error: "weak_password" };
    return { ok: false, error: "invalid_token" };
  }
  const result = await consumeVerificationToken(parsed.data.token, "RESET_PASSWORD");
  if (!result) return { ok: false, error: "invalid_token" };
  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.hubAccount.update({
    where: { id: result.hubAccountId },
    data: { passwordHash },
  });
  return { ok: true };
}
