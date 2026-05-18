import { z } from "zod";
import { prisma } from "@/lib/db/client";
import type { Prisma, SchoolLevel } from "@prisma/client";

export const searchInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  schoolLevel: z
    .enum(["PRIMARIA", "SECONDARIA_I", "SECONDARIA_II", "UNIVERSITA", "ALTRO"])
    .optional(),
  subject: z.string().max(64).optional(),
  language: z.string().length(2).optional(),
  ageMin: z.coerce.number().int().min(3).max(99).optional(),
  ageMax: z.coerce.number().int().min(3).max(99).optional(),
  sort: z.enum(["recent", "popular", "relevant"]).default("relevant"),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(50).default(20),
});

export type SearchInput = z.infer<typeof searchInputSchema>;

export interface SearchResultItem {
  id: string;
  title: string;
  description: string | null;
  author: string;
  schoolLevel: SchoolLevel | null;
  subject: string | null;
  language: string | null;
  tags: string[];
  questionCount: number;
  downloadsCount: number;
  playsCount: number;
  license: "CC_BY" | "CC_BY_SA";
  publishedAt: Date;
}

export async function searchHubQuizzes(rawInput: Partial<SearchInput>): Promise<{
  items: SearchResultItem[];
  total: number;
  page: number;
  perPage: number;
}> {
  const input = searchInputSchema.parse(rawInput);
  const where: Prisma.HubQuizWhereInput = { suspended: false, unpublishedAt: null };
  if (input.schoolLevel) where.schoolLevel = input.schoolLevel;
  if (input.subject) where.subject = input.subject;
  if (input.language) where.language = input.language;
  if (input.ageMin !== undefined) where.ageMax = { gte: input.ageMin };
  if (input.ageMax !== undefined) where.ageMin = { lte: input.ageMax };
  if (input.q) {
    where.OR = [
      { title: { contains: input.q, mode: "insensitive" } },
      { description: { contains: input.q, mode: "insensitive" } },
      { tags: { has: input.q } },
    ];
  }

  const orderBy: Prisma.HubQuizOrderByWithRelationInput[] =
    input.sort === "recent"
      ? [{ publishedAt: "desc" }]
      : input.sort === "popular"
        ? [{ downloadsCount: "desc" }, { playsCount: "desc" }]
        : [{ publishedAt: "desc" }];

  const [rows, total] = await Promise.all([
    prisma.hubQuiz.findMany({
      where,
      orderBy,
      include: { hubAccount: { select: { name: true, email: true } } },
      skip: (input.page - 1) * input.perPage,
      take: input.perPage,
    }),
    prisma.hubQuiz.count({ where }),
  ]);

  return {
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      author: r.hubAccount.name ?? r.hubAccount.email.split("@")[0],
      schoolLevel: r.schoolLevel,
      subject: r.subject,
      language: r.language,
      tags: r.tags,
      questionCount: r.questionCount,
      downloadsCount: r.downloadsCount,
      playsCount: r.playsCount,
      license: r.license as "CC_BY" | "CC_BY_SA",
      publishedAt: r.publishedAt,
    })),
    total,
    page: input.page,
    perPage: input.perPage,
  };
}
