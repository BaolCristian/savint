import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next-intl
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));

// Mock ExploreClient
vi.mock("@/components/practice/explore-client", () => ({
  ExploreClient: ({ quizzes }: { quizzes: unknown[] }) => (
    <div data-testid="explore-client">quizzes:{quizzes.length}</div>
  ),
}));

// Mock HubExploreClient
vi.mock("@/components/hub/hub-explore-client", () => ({
  HubExploreClient: ({ items, total }: { items: unknown[]; total: number }) => (
    <div data-testid="hub-explore">hub-items:{items.length} total:{total}</div>
  ),
}));

// Mock prisma
vi.mock("@/lib/db/client", () => ({
  prisma: {
    quiz: {
      findMany: vi.fn(async () => []),
    },
  },
}));

// Mock searchHubQuizzes
vi.mock("@/lib/hub/search", () => ({
  searchHubQuizzes: vi.fn(async () => ({
    items: [{ id: "h1", title: "Hub Quiz" }],
    total: 1,
    page: 1,
    perPage: 20,
  })),
}));

// savint-mode mock — controlled per test
const mockGetSavintMode = vi.fn(() => "installation");
vi.mock("@/lib/config/savint-mode", () => ({
  getSavintMode: () => mockGetSavintMode(),
}));

import Page from "@/app/explore/page";

describe("/explore page branching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders installation ExploreClient when SAVINT_MODE=installation", async () => {
    mockGetSavintMode.mockReturnValue("installation");
    const ui = await Page({});
    render(ui);
    expect(screen.getByTestId("explore-client")).toBeInTheDocument();
    expect(screen.queryByTestId("hub-explore")).not.toBeInTheDocument();
  });

  it("renders HubExploreClient when SAVINT_MODE=hub", async () => {
    mockGetSavintMode.mockReturnValue("hub");
    const ui = await Page({});
    render(ui);
    expect(screen.getByTestId("hub-explore")).toBeInTheDocument();
    expect(screen.queryByTestId("explore-client")).not.toBeInTheDocument();
  });
});
