import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HubExploreClient } from "@/components/hub/hub-explore-client";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}:${JSON.stringify(params)}`;
    return key;
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/explore",
}));

// Mock @prisma/client SchoolLevel enum
vi.mock("@prisma/client", () => ({
  SchoolLevel: {
    PRIMARIA: "PRIMARIA",
    SECONDARIA_I: "SECONDARIA_I",
    SECONDARIA_II: "SECONDARIA_II",
    UNIVERSITA: "UNIVERSITA",
    ALTRO: "ALTRO",
  },
}));

const sampleItems = [
  {
    id: "q1",
    title: "Math Quiz",
    description: "A math quiz",
    author: "Alice",
    schoolLevel: "PRIMARIA",
    subject: "matematica",
    language: "it",
    downloadsCount: 10,
    playsCount: 5,
  },
  {
    id: "q2",
    title: "History Quiz",
    description: null,
    author: "Bob",
    schoolLevel: null,
    subject: null,
    language: "en",
    downloadsCount: 0,
    playsCount: 0,
  },
];

const defaultProps = {
  items: sampleItems,
  total: 2,
  page: 1,
  perPage: 20,
  initialFilters: { q: "", schoolLevel: "", subject: "", language: "", ageMin: "", ageMax: "", sort: "relevant" },
  basePath: "/explore",
};

describe("HubExploreClient", () => {
  it("renders title and subtitle", () => {
    render(<HubExploreClient {...defaultProps} />);
    expect(screen.getByText("exploreTitle")).toBeInTheDocument();
    expect(screen.getByText("exploreSubtitle")).toBeInTheDocument();
  });

  it("renders quiz cards for each item", () => {
    render(<HubExploreClient {...defaultProps} />);
    expect(screen.getByText("Math Quiz")).toBeInTheDocument();
    expect(screen.getByText("History Quiz")).toBeInTheDocument();
  });

  it("shows no-results message when items is empty", () => {
    render(<HubExploreClient {...defaultProps} items={[]} total={0} />);
    expect(screen.getByText("noResults")).toBeInTheDocument();
  });

  it("renders sort buttons", () => {
    render(<HubExploreClient {...defaultProps} />);
    expect(screen.getByTestId("sort-relevant")).toBeInTheDocument();
    expect(screen.getByTestId("sort-recent")).toBeInTheDocument();
    expect(screen.getByTestId("sort-popular")).toBeInTheDocument();
  });

  it("renders filter dropdowns", () => {
    render(<HubExploreClient {...defaultProps} />);
    expect(screen.getByTestId("filter-school-level")).toBeInTheDocument();
    expect(screen.getByTestId("filter-subject")).toBeInTheDocument();
    expect(screen.getByTestId("filter-language")).toBeInTheDocument();
  });
});
