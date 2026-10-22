import { describe, expect, it } from "vitest";
import { destinazioneLogin, loginDaStudente } from "../destinazione-login";

describe("destinazioneLogin", () => {
  it("accetta un percorso interno", () => {
    expect(destinazioneLogin("/studente")).toBe("/studente");
    expect(destinazioneLogin("/dashboard/esercizi")).toBe("/dashboard/esercizi");
  });

  it("senza indicazione porta alla dashboard", () => {
    expect(destinazioneLogin(null)).toBe("/dashboard");
    expect(destinazioneLogin("")).toBe("/dashboard");
  });

  it("rifiuta gli indirizzi che escono dall'app", () => {
    for (const fuori of ["https://altro.it", "//altro.it", "/\\altro.it", "/a\\b", "studente", "javascript:alert(1)"]) {
      expect(destinazioneLogin(fuori)).toBe("/dashboard");
    }
  });
});

describe("loginDaStudente", () => {
  it("riconosce le pagine dello studente", () => {
    expect(loginDaStudente("/studente")).toBe(true);
    expect(loginDaStudente("/studente/compito/c1")).toBe(true);
    expect(loginDaStudente("/studenteX")).toBe(false);
    expect(loginDaStudente("/dashboard/esercizi")).toBe(false);
  });
});
