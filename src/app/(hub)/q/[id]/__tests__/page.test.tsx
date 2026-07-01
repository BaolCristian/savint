import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import JSZip from "jszip";

// We need to build a real .qlz payload so extractQuestionPreviews can parse it
let qlzPayload: Buffer;

beforeAll(async () => {
  const zip = new JSZip();
  const manifest = {
    quiz: {
      questions: [
        {
          type: "choice",
          text: "What is 2+2?",
          timeLimit: 30,
          points: 1000,
          image: null,
          // correct answers intentionally omitted from preview
        },
        {
          type: "trueFalse",
          text: "The sky is blue.",
          timeLimit: 20,
          points: 500,
        },
      ],
    },
  };
  zip.file("manifest.json", JSON.stringify(manifest));
  const arrayBuffer = await zip.generateAsync({ type: "arraybuffer" });
  qlzPayload = Buffer.from(arrayBuffer);
});

// Mock next/navigation (notFound + useRouter)
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

// Use vi.hoisted to avoid hoisting issues
const { mockFindUnique } = vi.hoisted(() => ({
  mockFindUnique: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  prisma: {
    hubQuiz: { findUnique: mockFindUnique },
  },
}));

function makeQuizRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "q1",
    title: "Math Quiz",
    description: "A quiz about math",
    tags: ["math"],
    license: "CC_BY",
    schoolLevel: "PRIMARIA",
    subject: "matematica",
    language: "it",
    ageMin: null,
    ageMax: null,
    questionCount: 2,
    downloadsCount: 7,
    playsCount: 3,
    publishedAt: new Date("2026-05-01T10:00:00Z"),
    updatedAt: new Date("2026-05-10T10:00:00Z"),
    version: 1,
    suspended: false,
    payloadBlob: qlzPayload,
    hubAccount: {
      id: "ha1",
      name: "Maria Rossi",
      email: "maria@example.com",
      affiliation: "Liceo Galilei",
    },
    ...overrides,
  };
}

import Page from "@/app/(hub)/q/[id]/page";

describe("/q/:id detail page", () => {
  it("renders title and author", async () => {
    mockFindUnique.mockResolvedValueOnce(makeQuizRow());
    const ui = await Page({ params: Promise.resolve({ id: "q1" }) });
    const { container } = render(ui);
    expect(screen.getByText("Math Quiz")).toBeInTheDocument();
    expect(container.innerHTML).toMatch(/Maria Rossi/);
  });

  it("does NOT contain the word 'correct' in the HTML (no answer leakage)", async () => {
    mockFindUnique.mockResolvedValueOnce(makeQuizRow());
    const ui = await Page({ params: Promise.resolve({ id: "q1" }) });
    const { container } = render(ui);
    // The question previews must not expose correct answers
    expect(container.innerHTML.toLowerCase()).not.toMatch(/\bcorrect\b/);
  });

  it("calls notFound() for an unknown id", async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    await expect(
      Page({ params: Promise.resolve({ id: "missing" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
