import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ prisma: { esercizio: { findMany: vi.fn() } } }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(prisma.esercizio.findMany).mockReset().mockResolvedValue([]);
});

async function rendi() {
  render(await Page());
}

// Task 6: collegamenti dalla home della sezione alle nuove pagine, così il
// docente non deve conoscerne l'URL a memoria.
describe("hub della sezione esercizi del docente", () => {
  it("collega classi, contenitori, batterie e compiti", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: /classi/i })).toHaveAttribute(
      "href", "/dashboard/esercizi/classi",
    );
    expect(screen.getByRole("link", { name: /contenitori/i })).toHaveAttribute(
      "href", "/dashboard/esercizi/contenitori",
    );
    expect(screen.getByRole("link", { name: /batterie/i })).toHaveAttribute(
      "href", "/dashboard/esercizi/batterie",
    );
    expect(screen.getByRole("link", { name: /compiti/i })).toHaveAttribute(
      "href", "/dashboard/esercizi/compiti",
    );
  });
});
