import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import HubLoginPage from "@/app/(hub)/hub-login/page";
import messages from "@/messages/en.json";

vi.mock("next-auth/react", () => ({
  signIn: vi.fn(),
  getProviders: vi.fn(async () => ({ google: { id: "google" } })),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SAVINT_MODE = "hub";
});

describe("HubLoginPage", () => {
  it("renders both Google and email/password fields", async () => {
    const { getByLabelText } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HubLoginPage />
      </NextIntlClientProvider>,
    );
    expect(await screen.findByText(/sign in with google/i)).toBeTruthy();
    expect(getByLabelText(/email/i)).toBeTruthy();
    expect(getByLabelText(/password/i)).toBeTruthy();
  });

  it("links to /hub-register and /hub-forgot-password", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HubLoginPage />
      </NextIntlClientProvider>,
    );
    const links = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(links).toContain("/hub-register");
    expect(links).toContain("/hub-forgot-password");
  });
});
