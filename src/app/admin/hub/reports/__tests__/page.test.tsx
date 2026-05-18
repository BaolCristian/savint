import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { HubReportsClient } from "@/components/admin/hub/hub-reports-client";
import type { ReportItem } from "@/components/admin/hub/hub-reports-client";

const sample: ReportItem[] = [
  {
    id: "r1",
    reason: "OFFENSIVE",
    description: "rude",
    status: "PENDING",
    createdAt: new Date().toISOString(),
    reporter: null,
    hubQuiz: {
      id: "q1",
      title: "Hello",
      hubAccount: { id: "a1", name: "Maria", email: "m@x.it" },
    },
    otherReportsCount: 2,
  },
];

describe("HubReportsClient", () => {
  it("renders quiz title, reporter type and other-reports count", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <HubReportsClient initialReports={sample} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText(/Anonymous/i)).toBeInTheDocument();
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });
});
