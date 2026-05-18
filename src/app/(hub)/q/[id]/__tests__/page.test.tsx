import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "@/app/(hub)/q/[id]/page";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    hubQuiz: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === "found"
          ? {
              id: "found", title: "T", language: "it",
              hubAccountId: "ha",
              schoolLevel: "SECONDARIA_II",
              subject: "matematica",
              publishedAt: new Date("2026-05-17T10:00:00Z"),
              updatedAt: new Date("2026-05-17T10:00:00Z"),
              version: 2,
              downloadsCount: 0, playsCount: 0,
              description: null,
              unpublishedAt: null,
              suspended: false,
            }
          : null,
      ),
    },
    hubAccount: {
      findUnique: vi.fn(async () => ({ name: "Maria Rossi" })),
    },
  },
}));

describe("/q/:id page", () => {
  it("renders title, author, version for a found quiz", async () => {
    const ui = await Page({ params: Promise.resolve({ id: "found" }) });
    render(ui);
    expect(screen.getByText("T")).toBeInTheDocument();
    expect(screen.getByText(/Maria Rossi/)).toBeInTheDocument();
    expect(screen.getByText(/v2/)).toBeInTheDocument();
  });

  it("shows withdrawn banner for unpublishedAt", async () => {
    const { prisma } = await import("@/lib/db/client");
    (prisma.hubQuiz.findUnique as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "withdrawn", title: "X", description: null, hubAccountId: "ha",
      schoolLevel: "ALTRO", subject: "altro", language: "it",
      publishedAt: new Date(), updatedAt: new Date(), version: 1,
      downloadsCount: 0, playsCount: 0,
      unpublishedAt: new Date(), suspended: false,
    });
    const ui = await Page({ params: Promise.resolve({ id: "withdrawn" }) });
    render(ui);
    expect(screen.getByText(/withdrawn/i)).toBeInTheDocument();
  });

  it("shows Not found for an unknown id", async () => {
    const ui = await Page({ params: Promise.resolve({ id: "missing" }) });
    render(ui);
    expect(screen.getByText(/Not found/i)).toBeInTheDocument();
  });
});
