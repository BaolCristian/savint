import { prisma } from "@/lib/db/client";

/**
 * Promote a HubAccount to HUB_ADMIN by email.
 * Usage: npx tsx scripts/promote-hub-admin.ts <email>
 */
export async function promoteHubAdmin(rawEmail: string) {
  if (!rawEmail) throw new Error("email argument is required");
  const email = rawEmail.toLowerCase();
  const acct = await prisma.hubAccount.findUnique({ where: { email } });
  if (!acct) throw new Error(`No HubAccount found for ${email}`);
  const updated = await prisma.hubAccount.update({
    where: { email },
    data: { role: "HUB_ADMIN" },
  });
  return updated;
}

async function main() {
  const email = process.argv[2];
  const updated = await promoteHubAdmin(email);
  // eslint-disable-next-line no-console
  console.log(`Promoted ${updated.email} to HUB_ADMIN (id=${updated.id})`);
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
