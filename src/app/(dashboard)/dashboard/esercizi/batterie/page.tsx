import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoBatterie } from "@/lib/esercizi/batterie";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { BatterieClient } from "./batterie-client";
import { TeacherExercisesNav } from "../teacher-exercises-nav";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.batterie");
  const tUi = await getTranslations("teacherExercisesUi");

  const [batterie, contenitori] = await Promise.all([elencoBatterie(), elencoContenitori()]);

  return (
    <div className="space-y-4">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes") }} />
      <h1 className="text-2xl font-semibold">{tUi("preparation.title")}</h1>
      <p className="text-sm text-muted-foreground">{tUi("preparation.description")}</p>
      <Link href="/dashboard/esercizi/compiti" className="inline-flex text-sm font-medium text-brand-blue hover:underline">
        {tUi("preparation.assignAction")}
      </Link>

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
          contenitore: tUi("preparation.sourceCollection"),
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
