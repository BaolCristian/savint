import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/auth/require-role", () => ({ redirectUnlessTeacher: vi.fn() }));
vi.mock("@/lib/esercizi/verifiche", () => ({ monitoraggioVerifica: vi.fn(), misureDellaVerifica: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/esercizi/verifiche/v1",
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (chiave: string) => chiave),
}));
// Il client ha i suoi test: qui conta solo che cosa la pagina gli passa.
vi.mock("../[id]/verifica-docente-client", () => ({
  VerificaDocenteClient: (props: { compitoId: string; iniziale: { oraServer: unknown }; misureIniziali: unknown }) => (
    <pre data-testid="client">{JSON.stringify(props)}</pre>
  ),
}));

import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { misureDellaVerifica, monitoraggioVerifica } from "@/lib/esercizi/verifiche";
import { notFound } from "next/navigation";
import Page from "../[id]/page";

const monitoraggio = (stato: string) => ({
  verifica: { compitoId: "v1", stato, avviataAt: null },
  titolo: "Equazioni",
  classe: "2B",
  oraServer: new Date("2026-10-23T09:00:00.000Z"),
  conTempoResiduo: 0,
  recuperiAperti: 0,
  righe: [],
});

beforeEach(() => {
  vi.mocked(redirectUnlessTeacher).mockReset().mockResolvedValue({ user: { id: "doc1" } } as never);
  vi.mocked(monitoraggioVerifica).mockReset();
  vi.mocked(misureDellaVerifica).mockReset().mockResolvedValue([]);
  vi.mocked(notFound).mockClear();
});

const rendi = async (id = "v1") => render(await Page({ params: Promise.resolve({ id }) }));

describe("pagina della verifica per il docente", () => {
  it("un docente senza titolo (o una verifica che non c'è) riceve 404", async () => {
    vi.mocked(monitoraggioVerifica).mockResolvedValue(null);
    await expect(rendi()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(monitoraggioVerifica).toHaveBeenCalledWith("v1", "doc1");
    expect(misureDellaVerifica).not.toHaveBeenCalled();
  });

  it("passa al client il monitoraggio con le date come stringhe, e le misure in PREPARATA", async () => {
    vi.mocked(monitoraggioVerifica).mockResolvedValue(monitoraggio("PREPARATA") as never);
    vi.mocked(misureDellaVerifica).mockResolvedValue([{ studentId: "s1" }] as never);
    await rendi();
    const props = JSON.parse(screen.getByTestId("client").textContent!);
    expect(props.compitoId).toBe("v1");
    expect(props.iniziale.oraServer).toBe("2026-10-23T09:00:00.000Z");
    expect(props.misureIniziali).toEqual([{ studentId: "s1" }]);
    expect(misureDellaVerifica).toHaveBeenCalledWith("v1", "doc1");
  });

  it("dopo l'avvio non legge le misure", async () => {
    vi.mocked(monitoraggioVerifica).mockResolvedValue(monitoraggio("IN_CORSO") as never);
    await rendi();
    const props = JSON.parse(screen.getByTestId("client").textContent!);
    expect(props.misureIniziali).toBeNull();
    expect(misureDellaVerifica).not.toHaveBeenCalled();
  });
});
