import { z } from "zod";

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
    (val) => val.startsWith("/uploads/") || val.startsWith("http://") || val.startsWith("https://"),
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

const qlzQuestionSchema = z.object({
  type: z.enum([
    "MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING",
    "SPOT_ERROR", "NUMERIC_ESTIMATION", "IMAGE_HOTSPOT", "CODE_COMPLETION",
  ]),
  text: z.string().min(1).max(500),
  image: z.string().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
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

export const qlzManifestSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string().datetime(),
  quiz: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    tags: z.array(z.string()).default([]),
    questions: z.array(qlzQuestionSchema).min(1),
  }),
});

export type QlzManifest = z.infer<typeof qlzManifestSchema>;
export type QlzQuestion = z.infer<typeof qlzQuestionSchema>;
