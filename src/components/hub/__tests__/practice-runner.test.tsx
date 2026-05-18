import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { PracticeRunner } from "@/components/hub/practice-runner";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const defaultProps = {
  quizId: "quiz-1",
  runId: "run-1",
  title: "Math Quiz",
  authorName: "Alice",
  questionCount: 3,
};

beforeEach(() => {
  mockFetch.mockReset();
});

describe("PracticeRunner", () => {
  it("renders the intro screen with title and author", () => {
    wrap(<PracticeRunner {...defaultProps} />);
    expect(screen.getByTestId("practice-title")).toHaveTextContent("Math Quiz");
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByTestId("start-button")).toBeInTheDocument();
  });

  it("clicking Start triggers a fetch for question 0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order: 0,
        total: 3,
        question: {
          type: "TRUE_FALSE",
          text: "Is 1+1=2?",
          timeLimit: 20,
          points: 100,
          options: {},
        },
      }),
    });

    wrap(<PracticeRunner {...defaultProps} />);
    fireEvent.click(screen.getByTestId("start-button"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/hub/practice/run-1/question/0",
      );
    });

    await waitFor(() => {
      expect(screen.getByText("Is 1+1=2?")).toBeInTheDocument();
    });
  });

  it("shows question text after loading", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        order: 0,
        total: 1,
        question: {
          type: "TRUE_FALSE",
          text: "The earth is round",
          timeLimit: 30,
          points: 500,
          options: {},
        },
      }),
    });

    wrap(<PracticeRunner {...defaultProps} questionCount={1} />);
    fireEvent.click(screen.getByTestId("start-button"));

    await waitFor(() => {
      expect(screen.getByText("The earth is round")).toBeInTheDocument();
    });
  });
});
