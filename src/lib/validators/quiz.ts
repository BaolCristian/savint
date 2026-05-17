import { z } from "zod";
import { isValidSubject } from "@/lib/quiz-subjects";

const multipleChoiceOptionsSchema = z.object({
  choices: z.array(z.object({
    text: z.string().min(1),
    isCorrect: z.boolean(),
  })).min(2).max(6),
});

const trueFalseOptionsSchema = z.object({
  correct: z.boolean(),
});

const openAnswerOptionsSchema = z.object({
  acceptedAnswers: z.array(z.string().min(1)).min(1),
});

const orderingOptionsSchema = z.object({
  items: z.array(z.string().min(1)).min(2),
  correctOrder: z.array(z.number()),
});

const matchingOptionsSchema = z.object({
  pairs: z.array(z.object({
    left: z.string().min(1),
    right: z.string().min(1),
  })).min(2),
});

const spotErrorOptionsSchema = z.object({
  lines: z.array(z.string().min(1)).min(2),
  errorIndices: z.array(z.number().int().min(0)).min(1),
  explanation: z.string().optional(),
});

const numericEstimationOptionsSchema = z.object({
  correctValue: z.number(),
  tolerance: z.number().min(0),
  maxRange: z.number().min(0),
  unit: z.string().optional(),
});

const imageHotspotOptionsSchema = z.object({
  imageUrl: z.string().refine(
    (val) => val.startsWith("/uploads/") || val.startsWith("/api/uploads/") || val.startsWith("http://") || val.startsWith("https://"),
    { message: "Must be a URL or a local upload path" }
  ),
  hotspot: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    radius: z.number().min(0.01).max(0.5),
  }),
  tolerance: z.number().min(0).max(0.5),
});

const codeCompletionOptionsSchema = z.object({
  codeLines: z.array(z.string()).min(2),
  blankLineIndex: z.number().int().min(0),
  correctAnswer: z.string().min(1),
  mode: z.enum(["choice", "text"]),
  choices: z.array(z.string().min(1)).min(2).max(6).optional(),
});

export const questionSchema = z.object({
  type: z.enum([
    "MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING",
    "SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT", "CODE_COMPLETION",
  ]),
  text: z.string().min(1).max(500),
  mediaUrl: z.string().refine(
    (val) => val.startsWith("/uploads/") || val.startsWith("/api/uploads/") || val.startsWith("http://") || val.startsWith("https://") || val.startsWith("data:"),
    { message: "Must be a URL or a local upload path" }
  ).nullable().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
  order: z.number().int().min(0),
  confidenceEnabled: z.boolean().default(false),
  options: z.union([
    multipleChoiceOptionsSchema,
    trueFalseOptionsSchema,
    openAnswerOptionsSchema,
    orderingOptionsSchema,
    matchingOptionsSchema,
    spotErrorOptionsSchema,
    numericEstimationOptionsSchema,
    imageHotspotOptionsSchema,
    codeCompletionOptionsSchema,
  ]),
});

export const schoolLevelSchema = z.enum([
  "PRIMARIA",
  "SECONDARIA_I",
  "SECONDARIA_II",
  "UNIVERSITA",
  "ALTRO",
]);

// Base schema without cross-field validation; used for both quizSchema and updateQuizSchema.
const quizSchemaBase = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  questions: z.array(questionSchema).min(1),
  consentAccepted: z.boolean().optional(),
  license: z.enum(["CC_BY", "CC_BY_SA"]).optional(),

  // Pedagogical metadata (all optional).
  schoolLevel: schoolLevelSchema.nullable().optional(),
  subject: z
    .string()
    .refine(isValidSubject, { message: "Unknown subject slug" })
    .nullable()
    .optional(),
  language: z
    .string()
    .regex(/^[a-z]{2}$/, "Language must be a lowercase ISO 639-1 code")
    .nullable()
    .optional(),
  ageMin: z.number().int().min(3).max(99).nullable().optional(),
  ageMax: z.number().int().min(3).max(99).nullable().optional(),
});

// Apply cross-field constraint: ageMin must be <= ageMax (only when both are present).
// Separated from base so .partial() can be applied without triggering the constraint on partial updates.
export const quizSchema = quizSchemaBase.refine(
  (q) => q.ageMin == null || q.ageMax == null || q.ageMin <= q.ageMax,
  { message: "ageMin must be <= ageMax", path: ["ageMin"] },
);

export const updateQuizSchema = quizSchemaBase.partial();

export type QuizInput = z.infer<typeof quizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
