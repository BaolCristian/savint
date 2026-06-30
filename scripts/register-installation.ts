import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

/**
 * Registra una nuova installazione (scuola) sull'hub: genera clientId/clientSecret
 * OAuth, salva l'hash del secret, e ritorna le credenziali in chiaro.
 * Il clientSecret NON è recuperabile dopo: va consegnato subito alla scuola.
 */
export async function registerInstallation(input: {
  name: string;
  contactEmail: string;
}): Promise<{ id: string; clientId: string; clientSecret: string }> {
  const name = input.name?.trim();
  const contactEmail = input.contactEmail?.trim().toLowerCase();
  if (!name) throw new Error("name is required");
  if (!contactEmail) throw new Error("contactEmail is required");

  const clientId = `inst_${randomBytes(16).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const clientSecretHash = await hashPassword(clientSecret);

  const inst = await prisma.installation.create({
    data: { name, contactEmail, clientId, clientSecretHash },
  });
  return { id: inst.id, clientId, clientSecret };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const name = get("--name");
  const contactEmail = get("--email");
  if (!name || !contactEmail) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: tsx scripts/register-installation.ts --name "<scuola>" --email <contatto>',
    );
    process.exit(1);
  }
  const res = await registerInstallation({ name, contactEmail });
  // eslint-disable-next-line no-console
  console.log("Installation creata. Metti queste credenziali nel .env della scuola:");
  // eslint-disable-next-line no-console
  console.log(`HUB_OAUTH_CLIENT_ID=${res.clientId}`);
  // eslint-disable-next-line no-console
  console.log(`HUB_OAUTH_CLIENT_SECRET=${res.clientSecret}`);
  // eslint-disable-next-line no-console
  console.log("(Il secret NON sarà più mostrato: salvalo ora.)");
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
