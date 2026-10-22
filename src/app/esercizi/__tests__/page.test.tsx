import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/config", () => ({ auth: vi.fn() }));
vi.mock("@/lib/config/savint-mode", () => ({ isHubMode: vi.fn(() => false) }));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { auth } from "@/lib/auth/config";
import { isHubMode } from "@/lib/config/savint-mode";
import EserciziIngressoPage from "../page";

const authMock = vi.mocked(auth as unknown as () => Promise<unknown>);

beforeEach(() => {
  authMock.mockReset().mockResolvedValue(null);
  vi.mocked(isHubMode).mockReturnValue(false);
});

describe("EserciziIngressoPage", () => {
  it("senza accesso manda studente e docente al login, ciascuno verso la sua area", async () => {
    render(await EserciziIngressoPage());
    expect(screen.getByRole("link", { name: "studentAction" })).toHaveAttribute("href", "/login?callbackUrl=%2Fstudente");
    expect(screen.getByRole("link", { name: "teacherAction" })).toHaveAttribute("href", "/login?callbackUrl=%2Fdashboard%2Fesercizi");
    expect(screen.queryByText(/signedInAs/)).not.toBeInTheDocument();
  });

  it("con l'accesso già fatto porta direttamente alle aree", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", name: "Giulia", role: "STUDENT" } });
    render(await EserciziIngressoPage());
    expect(screen.getByRole("link", { name: "studentAction" })).toHaveAttribute("href", "/studente");
    expect(screen.getByRole("link", { name: "teacherAction" })).toHaveAttribute("href", "/dashboard/esercizi");
    expect(screen.getByText('signedInAs:{"name":"Giulia"}')).toBeInTheDocument();
  });

  it("sul sito principale non esiste", async () => {
    vi.mocked(isHubMode).mockReturnValue(true);
    await expect(EserciziIngressoPage()).rejects.toThrow("NOT_FOUND");
  });
});
