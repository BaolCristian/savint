"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { issueVerificationToken } from "@/lib/auth/verification-token";
import { sendPasswordResetEmail } from "@/lib/email/send";
import { getHubBaseUrl } from "@/lib/config/savint-mode";
import { hubRateLimit, HUB_LIMITS } from "@/lib/rate-limit/hub-rate-limit";
import { withBasePath } from "@/lib/base-path";

const schema = z.object({
  email: z.string().email(),
  locale: z.enum(["it", "en"]).default("it"),
});

export async function requestPasswordReset(input: z.input<typeof schema>) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  const rl = await hubRateLimit({ key: `forgot:${ip}`, ...HUB_LIMITS.FORGOT_PASSWORD });
  if (!rl.allowed) return { ok: true } as const; // silently swallow to avoid enumeration
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: true } as const;
  const email = parsed.data.email.toLowerCase();
  const acct = await prisma.hubAccount.findUnique({ where: { email } });
  if (!acct || acct.authMethod !== "PASSWORD") {
    return { ok: true } as const;
  }
  const { plainToken } = await issueVerificationToken(acct.id, "RESET_PASSWORD");
  const base = getHubBaseUrl().replace(/\/$/, "");
  const link = `${base}${withBasePath("/hub-reset-password")}?token=${plainToken}`;
  await sendPasswordResetEmail({ to: email, link, locale: parsed.data.locale });
  return { ok: true } as const;
}
