import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { ReportQuizButton } from "@/components/hub/report-quiz-button";

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ReportQuizButton", () => {
  it("renders the report button", () => {
    wrap(<ReportQuizButton hubQuizId="quiz-1" />);
    expect(screen.getByRole("button", { name: /Report/i })).toBeInTheDocument();
  });

  it("opens the modal when the report button is clicked", () => {
    wrap(<ReportQuizButton hubQuizId="quiz-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Report/i }));
    expect(screen.getByText("Report this quiz")).toBeInTheDocument();
    expect(screen.getByLabelText(/Reason/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Details/i)).toBeInTheDocument();
  });

  it("shows the reasons in the select", () => {
    wrap(<ReportQuizButton hubQuizId="quiz-1" />);
    fireEvent.click(screen.getByRole("button", { name: /Report/i }));
    expect(screen.getByText("Copyright violation")).toBeInTheDocument();
    expect(screen.getByText("Contains personal data")).toBeInTheDocument();
    expect(screen.getByText("Offensive content")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
  });

  it("shows success message after successful submission", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "report-1" }), { status: 201 }),
    );
    wrap(<ReportQuizButton hubQuizId="quiz-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Report/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Report submitted. Thanks."),
      ).toBeInTheDocument();
    });
  });

  it("shows alreadyReported message on 409 response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "already_reported" }), {
        status: 409,
      }),
    );
    wrap(<ReportQuizButton hubQuizId="quiz-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Report/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));

    await waitFor(() => {
      expect(
        screen.getByText("You've already reported this quiz."),
      ).toBeInTheDocument();
    });
  });

  it("shows error message on failed submission", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    wrap(<ReportQuizButton hubQuizId="quiz-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Report/i }));
    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Could not submit the report."),
      ).toBeInTheDocument();
    });
  });

  it("sends the correct payload to /api/hub/reports", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "report-2" }), { status: 201 }),
      );

    wrap(<ReportQuizButton hubQuizId="quiz-abc" />);
    fireEvent.click(screen.getByRole("button", { name: /Report/i }));

    // Change reason to COPYRIGHT
    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: "COPYRIGHT" },
    });

    // Add a description
    fireEvent.change(screen.getByLabelText(/Details/i), {
      target: { value: "Stolen content" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Submit report/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/hub/reports",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            hubQuizId: "quiz-abc",
            reason: "COPYRIGHT",
            description: "Stolen content",
          }),
        }),
      );
    });
  });
});
