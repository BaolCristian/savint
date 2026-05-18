import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import { FromHubBadge } from "@/components/hub/from-hub-badge";

describe("FromHubBadge", () => {
  it("renders link with author", () => {
    const { container, getByRole } = render(
      <NextIntlClientProvider locale="en" messages={en}>
        <FromHubBadge hubId="abc" author="Maria" />
      </NextIntlClientProvider>
    );
    expect(container.textContent).toContain("Maria");
    expect(getByRole("link").getAttribute("href")).toContain("/q/abc");
  });
});
