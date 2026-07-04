import type { HubAccount } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/** Email dell'account neutro "SAVINT" (super partes + proprietario contenuti adottati). */
export const SYSTEM_ACCOUNT_EMAIL = (
  process.env.SAVINT_SYSTEM_ACCOUNT_EMAIL ?? "cvirgili@sterpo.it"
).toLowerCase();

export async function getSystemHubAccount(): Promise<HubAccount | null> {
  return prisma.hubAccount.findUnique({ where: { email: SYSTEM_ACCOUNT_EMAIL } });
}
