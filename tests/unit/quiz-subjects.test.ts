import { describe, it, expect } from "vitest";
import {
  QUIZ_SUBJECTS,
  SUBJECT_SLUGS,
  isValidSubject,
  getSubjectLabel,
} from "@/lib/quiz-subjects";

describe("quiz-subjects vocabulary", () => {
  it("exposes a non-empty list", () => {
    expect(QUIZ_SUBJECTS.length).toBeGreaterThan(5);
  });

  it("every entry has slug + label_it + label_en", () => {
    for (const s of QUIZ_SUBJECTS) {
      expect(s.slug).toMatch(/^[a-z][a-z0-9_-]*$/);
      expect(s.label_it.length).toBeGreaterThan(0);
      expect(s.label_en.length).toBeGreaterThan(0);
    }
  });

  it("slugs are unique", () => {
    const slugs = QUIZ_SUBJECTS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("SUBJECT_SLUGS Set matches the list", () => {
    expect(SUBJECT_SLUGS.size).toBe(QUIZ_SUBJECTS.length);
    for (const s of QUIZ_SUBJECTS) {
      expect(SUBJECT_SLUGS.has(s.slug)).toBe(true);
    }
  });

  it("isValidSubject accepts known slugs", () => {
    expect(isValidSubject("matematica")).toBe(true);
    expect(isValidSubject("storia")).toBe(true);
  });

  it("isValidSubject rejects unknown slugs", () => {
    expect(isValidSubject("not-a-subject")).toBe(false);
    expect(isValidSubject("")).toBe(false);
    expect(isValidSubject("MATEMATICA")).toBe(false);
  });

  it("getSubjectLabel returns IT label by default", () => {
    expect(getSubjectLabel("matematica", "it")).toBe("Matematica");
  });

  it("getSubjectLabel returns EN label when requested", () => {
    expect(getSubjectLabel("matematica", "en")).toBe("Mathematics");
  });

  it("getSubjectLabel returns null for unknown slug", () => {
    expect(getSubjectLabel("not-a-subject", "it")).toBeNull();
  });
});
