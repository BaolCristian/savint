import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoBatterie } from "@/lib/esercizi/batterie";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { BatterieClient } from "./batterie-client";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.batterie");

  const [batterie, contenitori] = await Promise.all([elencoBatterie(), elencoContenitori()]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
      <p className="text-sm text-muted-foreground">{t("descrizione")}</p>

      <BatterieClient
        batterie={batterie.map((b) => ({
          id: b.id,
          name: b.name,
          regoleLabel: b.regole.map((r) => t("regolaLabel", { count: r.count, contenitore: r.contenitore })).join(" · "),
          compitiLabel: t("compitiCount", { n: b.compiti }),
        }))}
        contenitori={contenitori.map((c) => ({ id: c.id, name: c.name }))}
        testi={{
          nome: t("nome"),
          contenitore: t("contenitore"),
          quantita: t("quantita"),
          aggiungiRegola: t("aggiungiRegola"),
          rimuoviRegola: t("rimuoviRegola"),
          crea: t("crea"),
          elimina: t("elimina"),
          erroreInUso: t("erroreInUso"),
          erroreGenerico: t("erroreGenerico"),
          necessitaContenitori: t("necessitaContenitori"),
        }}
      />
      {batterie.length === 0 && <p className="text-sm text-muted-foreground">{t("nessunaBatteria")}</p>}
    </div>
  );
}
