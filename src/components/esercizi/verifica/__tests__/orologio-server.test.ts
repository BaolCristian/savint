import { describe, expect, it } from "vitest";
import { formattaResiduo, millisecondiResidui, scarto } from "../orologio-server";

describe("orologio del server", () => {
  it("conta il tempo sull'ora del server, non su quella del PC", () => {
    // Il PC è indietro di 10 minuti rispetto al server.
    const pc = Date.parse("2026-10-23T10:00:00Z");
    const s = scarto("2026-10-23T10:10:00Z", pc);
    expect(s).toBe(10 * 60_000);
    // Scadenza alle 10:30 del server: restano 20 minuti, non 30.
    expect(millisecondiResidui("2026-10-23T10:30:00Z", s, pc)).toBe(20 * 60_000);
    expect(millisecondiResidui("2026-10-23T10:30:00Z", s, pc + 5 * 60_000)).toBe(15 * 60_000);
  });

  it("una scadenza passata dà 0, mai un numero negativo", () => {
    const pc = Date.parse("2026-10-23T11:00:00Z");
    expect(millisecondiResidui("2026-10-23T10:30:00Z", 0, pc)).toBe(0);
  });

  it("formatta mm:ss e h:mm:ss oltre l'ora", () => {
    expect(formattaResiduo(65_000)).toBe("01:05");
    expect(formattaResiduo(3_725_000)).toBe("1:02:05");
    expect(formattaResiduo(0)).toBe("00:00");
  });
});
