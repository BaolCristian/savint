import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import AffiliationForm from "../affiliation-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
  usePathname: () => "/affiliazione",
}));

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("AffiliationForm", () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), { status: 201 }),
    ) as typeof fetch;
  });

  it("submits the form and calls fetch with the correct body", async () => {
    wrap(<AffiliationForm />);

    fireEvent.change(screen.getByLabelText(/school name/i), {
      target: { value: "Liceo Scientifico XYZ" },
    });
    fireEvent.change(screen.getByLabelText(/province/i), {
      target: { value: "RM" },
    });
    fireEvent.change(screen.getByLabelText(/installation url/i), {
      target: { value: "https://quiz.scuola.it" },
    });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: "preside@scuola.it" },
    });

    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/hub/affiliation/request",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("Liceo Scientifico XYZ"),
        }),
      );
    });

    const callArgs = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body).toMatchObject({
      schoolName: "Liceo Scientifico XYZ",
      province: "RM",
      installationUrl: "https://quiz.scuola.it",
      contactEmail: "preside@scuola.it",
    });
  });

  it("shows success state after successful submit", async () => {
    wrap(<AffiliationForm />);

    fireEvent.change(screen.getByLabelText(/school name/i), {
      target: { value: "Istituto Test" },
    });
    fireEvent.change(screen.getByLabelText(/province/i), {
      target: { value: "MI" },
    });
    fireEvent.change(screen.getByLabelText(/installation url/i), {
      target: { value: "https://quiz.istituto.it" },
    });
    fireEvent.change(screen.getByLabelText(/contact email/i), {
      target: { value: "test@istituto.it" },
    });

    fireEvent.click(screen.getByRole("button", { name: /send request/i }));

    await waitFor(() => {
      expect(screen.getByText(/request sent/i)).toBeInTheDocument();
    });
  });

  it("shows verified notice when verified prop is true", () => {
    wrap(<AffiliationForm verified />);
    expect(screen.getByText(/email confirmed/i)).toBeInTheDocument();
  });
});
