import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import { withBasePath } from "@/lib/base-path";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { MisurePdpDialog } from "../misure-pdp-dialog";

const T = messaggiIt.esercizi.misurePdp;
const ENDPOINT = "/api/esercizi/classi/c1/misure-pdp";
const VUOTE = { tempoExtraPct: 0, menoEsercizi: false, calcolatrice: false, formulario: false };

function finto(status = 200) {
  const f = vi.fn(async () => new Response(JSON.stringify(status === 200 ? { ok: true } : { error: "non_trovata" }), { status }));
  global.fetch = f as never;
  return f;
}

async function apri(iniziali = VUOTE) {
  render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <MisurePdpDialog studentId="s1" nome="Anna" iniziali={iniziali} endpoint={ENDPOINT} />
    </NextIntlClientProvider>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Misure PDP di Anna" }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  refresh.mockReset();
});

describe("MisurePdpDialog", () => {
  it("scegliere 30 % e Calcolatrice manda il PUT all'endpoint con basePath", async () => {
    const f = finto();
    const dialogo = await apri();

    await userEvent.click(within(dialogo).getByLabelText("30 %"));
    await userEvent.click(within(dialogo).getByLabelText(T.calcolatrice));
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));

    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const [url, opzioni] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(withBasePath(ENDPOINT));
    expect(opzioni.method).toBe("PUT");
    expect(JSON.parse(String(opzioni.body))).toEqual({
      studentId: "s1",
      misure: { tempoExtraPct: 30, menoEsercizi: false, calcolatrice: true, formulario: false },
    });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("«altro» con 120 mostra un errore e non manda niente", async () => {
    const f = finto();
    const dialogo = await apri();

    await userEvent.click(within(dialogo).getByLabelText(T.altro));
    const campo = within(dialogo).getByLabelText(T.altroEtichetta);
    await userEvent.clear(campo);
    await userEvent.type(campo, "120");
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));

    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(T.erroreTempo);
    expect(f).not.toHaveBeenCalled();
  });

  it("«altro» con 40 manda 40", async () => {
    const f = finto();
    const dialogo = await apri();

    await userEvent.click(within(dialogo).getByLabelText(T.altro));
    const campo = within(dialogo).getByLabelText(T.altroEtichetta);
    await userEvent.clear(campo);
    await userEvent.type(campo, "40");
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));

    await waitFor(() => expect(f).toHaveBeenCalledTimes(1));
    const [, opzioni] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(opzioni.body)).misure.tempoExtraPct).toBe(40);
  });

  it("parte dalle misure già salvate: un valore fuori dalle scelte apre «altro»", async () => {
    const dialogo = await apri({ tempoExtraPct: 40, menoEsercizi: true, calcolatrice: false, formulario: true });
    expect(within(dialogo).getByLabelText(T.altro)).toBeChecked();
    expect(within(dialogo).getByLabelText(T.altroEtichetta)).toHaveValue(40);
    expect(within(dialogo).getByLabelText(T.menoEsercizi)).toBeChecked();
    expect(within(dialogo).getByLabelText(T.formulario)).toBeChecked();
    expect(within(dialogo).getByLabelText(T.calcolatrice)).not.toBeChecked();
  });

  it("un rifiuto del server mostra l'errore e non chiude", async () => {
    finto(404);
    const dialogo = await apri();
    await userEvent.click(within(dialogo).getByLabelText(T.formulario));
    await userEvent.click(within(dialogo).getByRole("button", { name: T.salva }));
    expect(await within(dialogo).findByRole("alert")).toHaveTextContent(T.errore);
    expect(refresh).not.toHaveBeenCalled();
  });
});
