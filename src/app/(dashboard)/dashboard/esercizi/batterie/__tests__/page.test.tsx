import { describe, it, expect, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

import { redirect } from "next/navigation";
import Page from "../page";

// Nuovo compito, Task 5: la vecchia pagina "Prepara un compito" è diventata
// la pagina Modelli; il vecchio indirizzo porta lì.
describe("vecchia pagina delle batterie", () => {
  it("reindirizza ai modelli", () => {
    expect(() => Page()).toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/dashboard/esercizi/modelli");
  });
});
