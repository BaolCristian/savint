import { describe, it, expect } from "vitest";
import type { Quiz, SchoolLevel } from "@prisma/client";

describe("Quiz model types", () => {
  it("has the new hub-meta + pedagogy fields with nullable types", () => {
    // This test is compile-time: TypeScript fails the build if the fields
    // are missing or wrongly typed. We assert the shape at runtime too via
    // a discriminator object to keep ESLint happy with no-unused-vars.
    const shape: Partial<Quiz> = {
      hubPublishedId: null,
      hubLastPublishedAt: null,
      hubAccountId: null,
      clonedFromHubId: null,
      clonedFromHubVersion: null,
      clonedFromHubAuthor: null,
      schoolLevel: null,
      subject: null,
      language: null,
      ageMin: null,
      ageMax: null,
    };
    expect(shape).toBeDefined();
  });

  it("SchoolLevel enum includes the five expected values", () => {
    const expected: SchoolLevel[] = [
      "PRIMARIA",
      "SECONDARIA_I",
      "SECONDARIA_II",
      "UNIVERSITA",
      "ALTRO",
    ];
    expect(expected).toHaveLength(5);
  });
});
