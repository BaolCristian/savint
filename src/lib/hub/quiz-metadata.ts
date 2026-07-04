import { z } from "zod";
import { SUBJECT_SLUGS } from "@/lib/quiz-subjects";

export const ISO_639_1 = /^[a-z]{2}$/;

export const publishMetadataSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    license: z.enum(["CC_BY", "CC_BY_SA"]).default("CC_BY"),
    tags: z.array(z.string().max(40)).max(20).default([]),
    schoolLevel: z.enum(["PRIMARIA", "SECONDARIA_I", "SECONDARIA_II", "UNIVERSITA", "ALTRO"]),
    subject: z.string().refine((s) => SUBJECT_SLUGS.has(s), "invalid subject"),
    language: z.string().regex(ISO_639_1, "invalid language"),
    ageMin: z.number().int().min(3).max(120).optional(),
    ageMax: z.number().int().min(3).max(120).optional(),
    estimatedDurationSec: z.number().int().min(10).max(86400).optional(),
  })
  .refine(
    (m) => m.ageMin === undefined || m.ageMax === undefined || m.ageMin <= m.ageMax,
    { message: "ageMin > ageMax", path: ["ageMin"] },
  );

export type PublishMetadata = z.infer<typeof publishMetadataSchema>;
