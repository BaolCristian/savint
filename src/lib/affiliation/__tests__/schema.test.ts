import { describe, it, expect } from "vitest";
import { affiliationRequestSchema } from "@/lib/affiliation/schema";
import { PROVINCES } from "@/lib/affiliation/provinces";

describe("affiliationRequestSchema", () => {
  it("ha 107 province", () => { expect(PROVINCES.length).toBe(107); });
  it("accetta input valido", () => {
    expect(affiliationRequestSchema.safeParse({ schoolName: "IIS Sarpi", province: "UD", installationUrl: "https://quiz.paolosarpi.edu.it", contactEmail: "a@b.edu.it" }).success).toBe(true);
  });
  it("rifiuta provincia inesistente", () => {
    expect(affiliationRequestSchema.safeParse({ schoolName: "X", province: "ZZ", installationUrl: "https://x.it", contactEmail: "a@b.it" }).success).toBe(false);
  });
});
