import { prisma } from "@/lib/db/client";
import { verifyPassword } from "./password";

export interface HubUserPayload {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
}

export async function verifyHubCredentials(
  email: string,
  password: string,
): Promise<HubUserPayload | null> {
  if (!email || !password) return null;
  const acct = await prisma.hubAccount.findUnique({ where: { email: email.toLowerCase() } });
  if (!acct) return null;
  if (acct.authMethod !== "PASSWORD") return null;
  if (!acct.emailVerified) return null;
  if (acct.bannedAt) return null;
  const ok = await verifyPassword(password, acct.passwordHash);
  if (!ok) return null;
  return { id: acct.id, email: acct.email, name: acct.name, image: acct.image };
}
