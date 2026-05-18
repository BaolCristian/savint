import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";

import { SuspendedBanner } from "@/components/hub/suspended-banner";

describe("SuspendedBanner", () => {
  it("renders the banner text and reason", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SuspendedBanner reason="Copyright" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
    expect(screen.getByText(/Copyright/)).toBeInTheDocument();
  });

  it("renders only the banner text when reason is null", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <SuspendedBanner reason={null} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText(/suspended/i)).toBeInTheDocument();
    expect(screen.queryByText(/Reason/i)).not.toBeInTheDocument();
  });
});
