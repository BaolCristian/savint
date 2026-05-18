"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/client";
import { issueVerificationToken } from "@/lib/auth/verification-token";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { getHubBaseUrl } from "@/lib/config/savint-mode";

const schema = z.object({
  email: z.string().email(),
  locale: z.enum(["it", "en"]).default("it"),
});

export async function requestPasswordReset(input: z.input<typeof schema>) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: true } as const;
  const email = parsed.data.email.toLowerCase();
  const acct = await prisma.hubAccount.findUnique({ where: { email } });
  if (!acct || acct.authMethod !== "PASSWORD") {
    return { ok: true } as const;
  }
  const { plainToken } = await issueVerificationToken(acct.id, "RESET_PASSWORD");
  const base = getHubBaseUrl().replace(/\/$/, "");
  const link = `${base}/savint/hub-reset-password?token=${plainToken}`;
  await sendPasswordResetEmail({ to: email, link, locale: parsed.data.locale });
  return { ok: true } as const;
}
