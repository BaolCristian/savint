import { describe, it, expect } from "vitest";
import { publishMetadataSchema } from "../quiz-metadata";

const base = { title: "t", schoolLevel: "PRIMARIA", subject: "matematica", language: "it" } as const;

describe("publishMetadataSchema", () => {
  it("accetta payload senza estimatedDurationSec", () => {
    expect(publishMetadataSchema.safeParse(base).success).toBe(true);
  });
  it("accetta ancora un estimatedDurationSec valido", () => {
    expect(publishMetadataSchema.safeParse({ ...base, estimatedDurationSec: 300 }).success).toBe(true);
  });
  it("rifiuta un estimatedDurationSec fuori range", () => {
    expect(publishMetadataSchema.safeParse({ ...base, estimatedDurationSec: 5 }).success).toBe(false);
  });
});
