import { prisma } from "@/lib/db/client";

export type PublishDefaultsInput = {
  schoolLevel?: string;
  subject?: string;
  language?: string;
  ageMin?: number;
  ageMax?: number;
};

/** Persist the metadata just used to publish as the user's defaults (best-effort). */
export async function savePublishDefaults(userId: string, m: PublishDefaultsInput): Promise<void> {
  const data = {
    schoolLevel: m.schoolLevel ?? null,
    subject: m.subject ?? null,
    language: m.language ?? null,
    ageMin: m.ageMin ?? null,
    ageMax: m.ageMax ?? null,
  };
  await prisma.publishDefaults.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
