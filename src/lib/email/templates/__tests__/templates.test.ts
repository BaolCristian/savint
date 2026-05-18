import { describe, it, expect } from "vitest";
import { quizSuspendedTemplate } from "../quiz-suspended";
import { accountBannedTemplate } from "../account-banned";

describe("quizSuspendedTemplate", () => {
  it("renders an IT subject and includes quiz title + reason + appeal", () => {
    const subj = quizSuspendedTemplate.subject("it");
    const body = quizSuspendedTemplate.body(
      { quizTitle: "Quiz X", reason: "Plagio", appealEmail: "support@savint.it" },
      "it",
    );
    expect(subj).toMatch(/sospeso/i);
    expect(body).toContain("Quiz X");
    expect(body).toContain("Plagio");
    expect(body).toContain("support@savint.it");
  });

  it("renders EN", () => {
    const body = quizSuspendedTemplate.body(
      { quizTitle: "Quiz Y", reason: "Spam", appealEmail: "support@savint.it" },
      "en",
    );
    expect(body).toContain("Quiz Y");
    expect(body).toContain("Spam");
  });
});

describe("accountBannedTemplate", () => {
  it("renders subject and body with reason and appeal email", () => {
    const subj = accountBannedTemplate.subject("it");
    const body = accountBannedTemplate.body(
      { reason: "Abuso", appealEmail: "support@savint.it" },
      "it",
    );
    expect(subj).toMatch(/account/i);
    expect(body).toContain("Abuso");
    expect(body).toContain("support@savint.it");
  });
});
