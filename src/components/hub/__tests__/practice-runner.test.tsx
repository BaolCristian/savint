import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { PracticeRunner } from "@/components/hub/practice-runner";

// Mock player-view to avoid socket.io / AudioContext in test environment.
// Exposes a minimal AnswerInput that handles TRUE_FALSE for submit testing.
vi.mock("@/components/live/player-view", () => ({
  AnswerInput: ({
    type,
    onSubmit,
  }: {
    type: string;
    options: unknown;
    onSubmit: (v: { selected: boolean }) => void;
  }) => {
    if (type === "TRUE_FALSE") {
      return (
        <div>
          <button onClick={() => onSubmit({ selected: true })}>True</button>
          <button onClick={() => onSubmit({ selected: false })}>False</button>
        </div>
      );
    }
    return <div data-testid="answer-input" data-type={type} />;
  },
}));

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

/** A TRUE_FALSE question payload as returned by the hub question API */
const trueFalseQuestion = {
  order: 0,
  total: 1,
  question: {
    type: "TRUE_FALSE",
    text: "The earth is round",
    timeLimit: 30,
    points: 500,
    options: {},
  },
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

  it("shows question text and answer buttons after loading", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => trueFalseQuestion,
    });

    wrap(<PracticeRunner {...defaultProps} questionCount={1} />);
    fireEvent.click(screen.getByTestId("start-button"));

    await waitFor(() => {
      expect(screen.getByText("The earth is round")).toBeInTheDocument();
    });

    // Shared AnswerInput mock renders True/False buttons for TRUE_FALSE type
    expect(screen.getByText("True")).toBeInTheDocument();
    expect(screen.getByText("False")).toBeInTheDocument();
  });

  it("submitting an answer POSTs to the answer API and shows feedback with correct answer", async () => {
    // GET question
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => trueFalseQuestion,
    });
    // POST answer
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isCorrect: true,
        correctOptions: { correct: true },
        isLast: true,
      }),
    });

    wrap(<PracticeRunner {...defaultProps} questionCount={1} />);
    fireEvent.click(screen.getByTestId("start-button"));

    await waitFor(() => {
      expect(screen.getByText("The earth is round")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("True"));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/hub/practice/run-1/answer",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ order: 0, value: { selected: true } }),
        }),
      );
    });

    // Feedback phase: next button is present
    await waitFor(() => {
      expect(screen.getByTestId("next-button")).toBeInTheDocument();
    });

    // CorrectAnswerView renders "True" for TRUE_FALSE with correct: true
    expect(screen.getByText("True", { selector: "span" })).toBeInTheDocument();
  });

  it("shows results screen after clicking Next on the last question", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => trueFalseQuestion,
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        isCorrect: true,
        correctOptions: { correct: true },
        isLast: true,
      }),
    });

    wrap(<PracticeRunner {...defaultProps} questionCount={1} />);
    fireEvent.click(screen.getByTestId("start-button"));

    await waitFor(() => {
      expect(screen.getByText("The earth is round")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("True"));

    await waitFor(() => {
      expect(screen.getByTestId("next-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("next-button"));

    await waitFor(() => {
      expect(screen.getByText("Final result")).toBeInTheDocument();
    });

    // 1/1 correct → 100 %
    expect(screen.getByText("100%")).toBeInTheDocument();
  });
});
