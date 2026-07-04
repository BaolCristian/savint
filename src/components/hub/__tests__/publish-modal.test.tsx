import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { PublishModal } from "@/components/hub/publish-modal";

const baseQuiz = {
  id: "q1", title: "T", description: "",
  schoolLevel: "SECONDARIA_II" as const, subject: "matematica",
  language: "it", ageMin: 14, ageMax: 19,
  license: "CC_BY" as const, tags: [], hubPublishedId: null,
};

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>
  );
}

describe("PublishModal", () => {
  it("shows 'connect' CTA when not linked", () => {
    wrap(<PublishModal open quiz={baseQuiz} link={null} estimatedDurationSec={600} onClose={() => {}} />);
    expect(screen.getByRole("link", { name: /Connect savint.it account/i })).toBeInTheDocument();
  });

  it("shows 'reconnect' CTA when link is revoked", () => {
    wrap(<PublishModal open quiz={baseQuiz} link={{ hubAccountEmail: "h@x" }} revoked estimatedDurationSec={600} onClose={() => {}} />);
    expect(screen.getByRole("link", { name: /Reconnect to savint.it/i })).toBeInTheDocument();
  });

  it("shows publish form when linked", () => {
    wrap(<PublishModal open quiz={baseQuiz} link={{ hubAccountEmail: "h@x" }} estimatedDurationSec={600} onClose={() => {}} />);
    expect(screen.getByRole("button", { name: /^Publish$/i })).toBeInTheDocument();
  });

  it("submits and calls success handler", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ hubQuizId: "H", version: 1, url: "https://savint.it/q/H" }), { status: 200 }),
    ) as typeof fetch;
    const onSuccess = vi.fn();
    wrap(
      <PublishModal
        open
        quiz={baseQuiz}
        link={{ hubAccountEmail: "h@x" }}
        estimatedDurationSec={600}
        onClose={() => {}}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByLabelText(/I confirm the publication declaration/i));
    fireEvent.click(screen.getByRole("button", { name: /^Publish$/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("renders Update title when already published", () => {
    wrap(
      <PublishModal
        open
        quiz={{ ...baseQuiz, hubPublishedId: "H" }}
        link={{ hubAccountEmail: "h@x" }}
        estimatedDurationSec={600}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Update on savint.it/i)).toBeInTheDocument();
  });

  it("shows computed duration line in form", () => {
    wrap(
      <PublishModal
        open
        quiz={baseQuiz}
        link={{ hubAccountEmail: "h@x" }}
        estimatedDurationSec={600}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText(/Estimated duration/i)).toBeInTheDocument();
  });
});
