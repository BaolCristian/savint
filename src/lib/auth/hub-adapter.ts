import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/db/client";

export function hubAccountAdapter(): Adapter {
  return {
    async createUser(data) {
      const created = await prisma.hubAccount.create({
        data: {
          email: data.email.toLowerCase(),
          name: data.name ?? null,
          image: data.image ?? null,
          authMethod: "GOOGLE",
          emailVerified: data.emailVerified ?? new Date(),
          linkedProviders: ["google"],
        },
      });
      return mapHubToAdapter(created);
    },
    async getUser(id) {
      const row = await prisma.hubAccount.findUnique({ where: { id } });
      return row ? mapHubToAdapter(row) : null;
    },
    async getUserByEmail(email) {
      const row = await prisma.hubAccount.findUnique({ where: { email: email.toLowerCase() } });
      return row ? mapHubToAdapter(row) : null;
    },
    async getUserByAccount() {
      return null;
    },
    async updateUser(data) {
      const updated = await prisma.hubAccount.update({
        where: { id: data.id! },
        data: {
          name: data.name ?? undefined,
          email: data.email ? data.email.toLowerCase() : undefined,
          image: data.image ?? undefined,
          emailVerified: data.emailVerified ?? undefined,
        },
      });
      return mapHubToAdapter(updated);
    },
    async deleteUser(id) {
      await prisma.hubAccount.delete({ where: { id } });
    },
    async linkAccount() {
      return undefined;
    },
    async unlinkAccount() {
      return undefined;
    },
    async createVerificationToken() {
      return null;
    },
    async useVerificationToken() {
      return null;
    },
  };
}

function mapHubToAdapter(row: {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: Date | null;
}): AdapterUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    image: row.image,
    emailVerified: row.emailVerified ?? new Date(0),
  };
}
