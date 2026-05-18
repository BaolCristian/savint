import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// Mock auth
vi.mock("@/lib/auth/config", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", name: "Teacher" } })),
}));

// Mock next-intl/server
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      dashboard: {
        browseRepository: "Browse savint.it repository",
      },
      hub: {
        exploreSubtitle: "Search thousands of quizzes",
        by: "by {author}",
        noResults: "No quizzes match your filters",
      },
    };
    const ns = translations[namespace] ?? {};
    return (key: string, params?: Record<string, string>) => {
      const val = ns[key] ?? key;
      if (params) {
        return val.replace(/\{(\w+)\}/g, (_: string, k: string) => params[k] ?? `{${k}}`);
      }
      return val;
    };
  }),
}));

// Mock hub-client
const mockSearchHubQuizzesRemote = vi.fn();
vi.mock("@/lib/hub/hub-client", () => ({
  searchHubQuizzesRemote: (...args: unknown[]) => mockSearchHubQuizzesRemote(...args),
}));

import HubBrowsePage from "@/app/(dashboard)/dashboard/hub/page";

describe("/dashboard/hub browse page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SAVINT_HUB_URL = "https://hub.example";
  });

  it("renders a quiz card with the mocked title", async () => {
    mockSearchHubQuizzesRemote.mockResolvedValueOnce({
      items: [
        {
          id: "hq1",
          title: "Algebra for Beginners",
          description: "Learn algebra",
          author: "Maria",
          schoolLevel: "SECONDARIA_I",
          subject: "matematica",
          language: "it",
          tags: [],
          questionCount: 10,
          downloadsCount: 5,
          playsCount: 2,
          license: "CC_BY",
          publishedAt: new Date("2026-05-01"),
        },
      ],
      total: 1,
      page: 1,
      perPage: 20,
    });

    const ui = await HubBrowsePage();
    render(ui);

    expect(screen.getByText("Algebra for Beginners")).toBeInTheDocument();
    expect(screen.getByText("Browse savint.it repository")).toBeInTheDocument();
  });

  it("shows not-configured message when SAVINT_HUB_URL is unset", async () => {
    delete process.env.SAVINT_HUB_URL;

    const ui = await HubBrowsePage();
    render(ui);

    expect(screen.getByText(/Hub not configured/i)).toBeInTheDocument();
  });

  it("shows error message when hub is not reachable", async () => {
    mockSearchHubQuizzesRemote.mockRejectedValueOnce(new Error("fetch failed"));

    const ui = await HubBrowsePage();
    render(ui);

    expect(screen.getByText(/Hub not reachable/i)).toBeInTheDocument();
  });
});
