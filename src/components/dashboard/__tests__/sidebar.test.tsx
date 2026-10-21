import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messaggiIt from "@/messages/it.json";
import messaggiEn from "@/messages/en.json";

vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard/esercizi/prompt-ia" }));
vi.mock("@/components/dashboard/theme-provider", () => ({ useTheme: () => ({ theme: "light", toggle: vi.fn() }) }));
vi.mock("@/components/locale-switcher", () => ({ LocaleSwitcher: () => null }));

import { DashboardSidebar } from "../sidebar";

const t = messaggiIt.sidebar;

function monta(ruolo = "TEACHER") {
  return render(
    <NextIntlClientProvider locale="it" messages={messaggiIt}>
      <DashboardSidebar user={{ name: "Prof", email: "p@x.it", role: ruolo }} />
    </NextIntlClientProvider>,
  );
}

/** La sezione del menu che ha per titolo `titolo`. */
function sezione(titolo: string) {
  return screen.getByRole("group", { name: titolo });
}

function hrefDi(contenitore: HTMLElement) {
  return within(contenitore).getAllByRole("link").map((a) => a.getAttribute("href"));
}

describe("menu laterale", () => {
  it("la sezione Quiz raccoglie le voci dei quiz, con il prompt dei quiz", () => {
    monta();
    expect(hrefDi(sezione(t.sectionQuiz))).toEqual([
      "/dashboard/quiz", "/dashboard/sessions", "/dashboard/stats",
      "/dashboard/share", "/dashboard/library", "/dashboard/ai-prompts",
    ]);
    expect(within(sezione(t.sectionQuiz)).getByRole("link", { name: t.createQuizWithAI })).toBeInTheDocument();
  });

  it("la sezione Esercizi ha prompt e import accanto alle pagine degli esercizi", () => {
    monta();
    expect(hrefDi(sezione(t.sectionExercises))).toEqual([
      "/dashboard/esercizi", "/dashboard/esercizi/redazione", "/dashboard/esercizi/prompt-ia",
      "/dashboard/esercizi/redazione/importa", "/dashboard/esercizi/compiti", "/dashboard/esercizi/classi",
    ]);
  });

  it("Home resta fuori dalle sezioni", () => {
    monta();
    const home = screen.getByRole("link", { name: "Home" });
    expect(home.closest('[role="group"]')).toBeNull();
  });

  it("la voce della pagina aperta è segnata come corrente, e solo quella", () => {
    monta();
    const correnti = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(correnti.map((a) => a.getAttribute("href"))).toEqual(["/dashboard/esercizi/prompt-ia"]);
  });

  it("Admin compare solo per l'amministratore", () => {
    monta("TEACHER");
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("le voci nuove hanno le stesse chiavi in italiano e in inglese", () => {
    expect(Object.keys(messaggiEn.sidebar).sort()).toEqual(Object.keys(messaggiIt.sidebar).sort());
  });
});
