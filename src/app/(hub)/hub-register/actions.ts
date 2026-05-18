"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { issueVerificationToken } from "@/lib/auth/verification-token";
import { sendVerificationEmail } from "@/lib/email/send";
import { getHubBaseUrl } from "@/lib/config/savint-mode";
import { hubRateLimit, HUB_LIMITS } from "@/lib/rate-limit/hub-rate-limit";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
  locale: z.enum(["it", "en"]).default("it"),
});

export type RegisterInput = z.infer<typeof schema>;
export type RegisterResult =
  | { ok: true }
  | { ok: false; error: "invalid_email" | "weak_password" | "invalid_name" | "internal_error" | "rate_limited" };

export async function registerHubAccount(input: RegisterInput): Promise<RegisterResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  const rl = await hubRateLimit({ key: `register:${ip}`, ...HUB_LIMITS.REGISTER });
  if (!rl.allowed) return { ok: false, error: "rate_limited" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "email") return { ok: false, error: "invalid_email" };
    if (issue?.path[0] === "password") return { ok: false, error: "weak_password" };
    if (issue?.path[0] === "name") return { ok: false, error: "invalid_name" };
    return { ok: false, error: "internal_error" };
  }
  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.hubAccount.findUnique({ where: { email } });
  if (existing) {
    // Anti-enumeration: return ok even when email is taken.
    return { ok: true };
  }
  const passwordHash = await hashPassword(parsed.data.password);
  const created = await prisma.hubAccount.create({
    data: {
      email,
      name: parsed.data.name,
      authMethod: "PASSWORD",
      passwordHash,
      linkedProviders: ["password"],
    },
  });
  const { plainToken } = await issueVerificationToken(created.id, "VERIFY_EMAIL");
  const base = getHubBaseUrl().replace(/\/$/, "");
  const link = `${base}/savint/api/hub/auth/verify?token=${plainToken}`;
  await sendVerificationEmail({ to: email, link, locale: parsed.data.locale });
  return { ok: true };
}
