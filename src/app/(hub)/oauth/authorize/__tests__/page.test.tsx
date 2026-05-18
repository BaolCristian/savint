import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import AuthorizePage from "@/app/(hub)/oauth/authorize/page";

vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "ha1", email: "u@x" } })),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    installation: {
      findUnique: vi.fn(async ({ where }: { where: { clientId: string } }) =>
        where.clientId === "good"
          ? { id: "i1", name: "Liceo Galilei", clientId: "good", status: "ACTIVE" }
          : null,
      ),
    },
  },
}));

// Mock next-intl/server so getTranslations works in jsdom
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    // Resolve the namespace path inside messages
    const parts = namespace.split(".");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let node: any = messages;
    for (const p of parts) {
      node = node?.[p];
    }
    return (key: string, params?: Record<string, string>) => {
      const keys = key.split(".");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let value: any = node;
      for (const k of keys) {
        value = value?.[k];
      }
      if (typeof value !== "string") return key;
      if (params) {
        return value.replace(/\{(\w+)\}/g, (_: string, k: string) => params[k] ?? `{${k}}`);
      }
      return value;
    };
  }),
  getLocale: vi.fn(async () => "en"),
}));

// Mock next/navigation redirect to avoid NEXT_REDIRECT error in tests
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

function wrap(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

describe("oauth authorize page", () => {
  it("renders consent for a valid installation", async () => {
    const params = new URLSearchParams({
      client_id: "good",
      redirect_uri: "https://school.example/api/hub/oauth/callback",
      scope: "publish clone",
      state: "s",
      code_challenge: "c".repeat(43),
      code_challenge_method: "S256",
    });
    const ui = await AuthorizePage({ searchParams: Promise.resolve(Object.fromEntries(params)) });
    wrap(ui);
    expect(screen.getAllByText(/Liceo Galilei/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Allow/i })).toBeInTheDocument();
  });

  it("rejects an unknown client_id", async () => {
    const ui = await AuthorizePage({
      searchParams: Promise.resolve({
        client_id: "nope",
        redirect_uri: "x",
        scope: "publish",
        state: "s",
        code_challenge: "c",
        code_challenge_method: "S256",
      }),
    });
    wrap(ui);
    expect(screen.getByText(/Unknown installation/)).toBeInTheDocument();
  });
});
