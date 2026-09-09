import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string, valori?: Record<string, unknown>) =>
    valori ? `${chiave}:${JSON.stringify(valori)}` : chiave),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import Page from "../page";

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
});

async function rendi() {
  return render(await Page());
}

// Task 4: la pagina d'ingresso smette di essere cinque riquadri pari.
// L'azione di assegnare viene prima, sola e più grande; sotto, più piccolo,
// il resto. "Batterie" sparisce del tutto dalla navigazione del docente
// (resta raggiungibile solo per chi ne conosce già l'indirizzo — non è
// questa pagina a doverlo dire).
describe("hub della sezione esercizi del docente", () => {
  it("chiama redirectUnlessTeacher", async () => {
    await rendi();
    expect(redirectUnlessTeacher).toHaveBeenCalled();
  });

  it("mostra il blocco per assegnare come intestazione propria, non come link di navigazione — il modulo vero arriva nel prossimo task", async () => {
    await rendi();
    // getTranslations è mockato per restituire la CHIAVE: "assegnaTitolo" e
    // "assegnaDescrizione" sono le chiavi nuove che questo task introduce.
    const titolo = screen.getByText("assegnaTitolo");
    expect(titolo.closest("a")).toBeNull();
    expect(screen.getByText("assegnaDescrizione")).toBeInTheDocument();
  });

  it("collega classi, raccolte (contenitori), compiti assegnati e i miei esercizi (redazione)", async () => {
    await rendi();
    expect(screen.getByRole("link", { name: "navClassi" })).toHaveAttribute(
      "href", "/dashboard/esercizi/classi",
    );
    expect(screen.getByRole("link", { name: "navContenitori" })).toHaveAttribute(
      "href", "/dashboard/esercizi/contenitori",
    );
    expect(screen.getByRole("link", { name: "navCompiti" })).toHaveAttribute(
      "href", "/dashboard/esercizi/compiti",
    );
    expect(screen.getByRole("link", { name: "navRedazione" })).toHaveAttribute(
      "href", "/dashboard/esercizi/redazione",
    );
  });

  it("non collega più batterie da questa pagina", async () => {
    await rendi();
    expect(screen.queryByRole("link", { name: /batterie/i })).toBeNull();
    expect(screen.queryByText("navBatterie")).toBeNull();
    expect(screen.queryByRole("link", { name: "navBatterie" })).toBeNull();
  });

  it("il blocco per assegnare precede, nel documento, le quattro sezioni secondarie", async () => {
    const { container } = await rendi();
    const testo = container.textContent ?? "";
    const posizioneAssegna = testo.indexOf("assegnaTitolo");
    const secondarie = ["navRedazione", "navClassi", "navContenitori", "navCompiti"];

    expect(posizioneAssegna).toBeGreaterThanOrEqual(0);
    for (const chiave of secondarie) {
      const posizione = testo.indexOf(chiave);
      expect(posizione).toBeGreaterThan(posizioneAssegna);
    }
  });

  it("le sezioni secondarie seguono l'ordine del brief: i miei esercizi, le mie classi, le raccolte, i compiti assegnati", async () => {
    const { container } = await rendi();
    const testo = container.textContent ?? "";
    const ordine = ["navRedazione", "navClassi", "navContenitori", "navCompiti"].map((k) => testo.indexOf(k));

    expect(ordine.every((p) => p >= 0)).toBe(true);
    expect(ordine).toEqual([...ordine].sort((a, b) => a - b));
  });
});
