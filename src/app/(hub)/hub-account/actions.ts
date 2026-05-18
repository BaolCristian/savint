"use server";

import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";

const profileSchema = z.object({
  name: z.string().min(1).max(120),
  affiliation: z.string().max(200).optional().nullable(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

type UpdateProfileResult = { ok: true } | { ok: false; error: "unauthorized" | "invalid" };
type ChangePasswordResult =
  | { ok: true }
  | { ok: false; error: "unauthorized" | "wrong_password" | "weak_password" | "not_password_account" };

export async function updateProfile(input: z.input<typeof profileSchema>): Promise<UpdateProfileResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  await prisma.hubAccount.update({
    where: { id: session.user.id },
    data: {
      name: parsed.data.name,
      affiliation: parsed.data.affiliation ?? null,
    },
  });
  return { ok: true };
}

export async function changePassword(input: z.input<typeof passwordSchema>): Promise<ChangePasswordResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "unauthorized" };
  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "weak_password" };
  const acct = await prisma.hubAccount.findUnique({ where: { id: session.user.id } });
  if (!acct || acct.authMethod !== "PASSWORD" || !acct.passwordHash) {
    return { ok: false, error: "not_password_account" };
  }
  const ok = await verifyPassword(parsed.data.currentPassword, acct.passwordHash);
  if (!ok) return { ok: false, error: "wrong_password" };
  const newHash = await hashPassword(parsed.data.newPassword);
  await prisma.hubAccount.update({
    where: { id: acct.id },
    data: { passwordHash: newHash },
  });
  return { ok: true };
}
