/**
 * Controlled vocabulary for quiz subjects.
 *
 * This is intentionally NOT a Prisma enum: extending the list must be a code
 * change reviewed in PR (so labels stay consistent across both locales) but
 * must NOT require a database migration. The `Quiz.subject` column stores the
 * slug as a free String validated at the API boundary via `isValidSubject`.
 */
export interface QuizSubject {
  slug: string;
  label_it: string;
  label_en: string;
}

export const QUIZ_SUBJECTS: readonly QuizSubject[] = [
  { slug: "matematica", label_it: "Matematica", label_en: "Mathematics" },
  { slug: "italiano", label_it: "Italiano", label_en: "Italian language" },
  { slug: "storia", label_it: "Storia", label_en: "History" },
  { slug: "geografia", label_it: "Geografia", label_en: "Geography" },
  { slug: "scienze", label_it: "Scienze", label_en: "Science" },
  { slug: "fisica", label_it: "Fisica", label_en: "Physics" },
  { slug: "chimica", label_it: "Chimica", label_en: "Chemistry" },
  { slug: "biologia", label_it: "Biologia", label_en: "Biology" },
  { slug: "informatica", label_it: "Informatica", label_en: "Computer science" },
  { slug: "inglese", label_it: "Inglese", label_en: "English" },
  { slug: "francese", label_it: "Francese", label_en: "French" },
  { slug: "spagnolo", label_it: "Spagnolo", label_en: "Spanish" },
  { slug: "tedesco", label_it: "Tedesco", label_en: "German" },
  { slug: "latino", label_it: "Latino", label_en: "Latin" },
  { slug: "greco", label_it: "Greco", label_en: "Ancient Greek" },
  { slug: "filosofia", label_it: "Filosofia", label_en: "Philosophy" },
  { slug: "arte", label_it: "Arte e immagine", label_en: "Art" },
  { slug: "musica", label_it: "Musica", label_en: "Music" },
  { slug: "educazione_fisica", label_it: "Educazione fisica", label_en: "Physical education" },
  { slug: "educazione_civica", label_it: "Educazione civica", label_en: "Civic education" },
  { slug: "religione", label_it: "Religione", label_en: "Religion" },
  { slug: "tecnologia", label_it: "Tecnologia", label_en: "Technology" },
  { slug: "economia", label_it: "Economia", label_en: "Economics" },
  { slug: "diritto", label_it: "Diritto", label_en: "Law" },
  { slug: "altro", label_it: "Altro", label_en: "Other" },
] as const;

export const SUBJECT_SLUGS: ReadonlySet<string> = new Set(
  QUIZ_SUBJECTS.map((s) => s.slug),
);

export function isValidSubject(slug: unknown): slug is string {
  return typeof slug === "string" && SUBJECT_SLUGS.has(slug);
}

export function getSubjectLabel(
  slug: string,
  locale: "it" | "en",
): string | null {
  const found = QUIZ_SUBJECTS.find((s) => s.slug === slug);
  if (!found) return null;
  return locale === "it" ? found.label_it : found.label_en;
}
