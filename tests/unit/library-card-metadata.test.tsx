import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { LibraryClient } from "@/components/library/library-client";
import itMessages from "@/messages/it.json";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const baseQuiz = {
  id: "q1",
  title: "Geografia",
  description: null,
  tags: [],
  license: "CC_BY",
  authorName: "Maria",
  questionCount: 5,
  createdAt: new Date().toISOString(),
};

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("LibraryClient card metadata", () => {
  it("renders subject and level badges when present", () => {
    wrap(
      <LibraryClient
        quizzes={[
          {
            ...baseQuiz,
            schoolLevel: "PRIMARIA",
            subject: "matematica",
          },
        ]}
      />,
    );
    expect(screen.getByText(/matematica/i)).toBeInTheDocument();
    expect(screen.getByText(/primaria/i)).toBeInTheDocument();
  });

  it("omits the badges when neither field is set", () => {
    wrap(
      <LibraryClient
        quizzes={[
          { ...baseQuiz, schoolLevel: null, subject: null },
        ]}
      />,
    );
    expect(screen.queryByText(/primaria/i)).not.toBeInTheDocument();
  });
});
