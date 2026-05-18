import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { PublishButton } from "@/components/hub/publish-button";

const baseQuiz = {
  id: "q1", title: "T", description: "",
  schoolLevel: null, subject: null, language: null,
  ageMin: null, ageMax: null, license: "CC_BY" as const,
  tags: [], hubPublishedId: null,
};

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>{ui}</NextIntlClientProvider>
  );
}

describe("PublishButton", () => {
  it("renders when hub enabled and user owns the quiz", () => {
    wrap(<PublishButton hubEnabled quiz={baseQuiz} link={null} />);
    expect(screen.getByRole("button", { name: /Publish to savint.it/i })).toBeInTheDocument();
  });

  it("renders 'Update' label when already published", () => {
    wrap(<PublishButton hubEnabled quiz={{ ...baseQuiz, hubPublishedId: "H" }} link={{ hubAccountEmail: "h@x" }} />);
    expect(screen.getByRole("button", { name: /Update on savint.it/i })).toBeInTheDocument();
  });

  it("renders nothing when hub disabled", () => {
    const { container } = wrap(<PublishButton hubEnabled={false} quiz={baseQuiz} link={null} />);
    expect(container.firstChild).toBeNull();
  });
});
