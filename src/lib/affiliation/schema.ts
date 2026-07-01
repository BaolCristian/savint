import { z } from "zod";
import { PROVINCE_CODES } from "./provinces";

export const affiliationRequestSchema = z.object({
  schoolName: z.string().trim().min(2).max(200),
  province: z.string().refine((c) => PROVINCE_CODES.has(c), "provincia non valida"),
  installationUrl: z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL non valido").max(300),
  contactEmail: z.string().email().max(200),
});

export type AffiliationRequestInput = z.infer<typeof affiliationRequestSchema>;
