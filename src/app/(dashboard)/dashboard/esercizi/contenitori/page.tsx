import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { ContenitoriClient } from "./contenitori-client";
import { TeacherExercisesNav } from "../teacher-exercises-nav";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.contenitori");
  const tUi = await getTranslations("teacherExercisesUi");

  const contenitori = await elencoContenitori();

  return (
    <div className="space-y-4">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes") }} />
      <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
      <p className="text-sm text-muted-foreground">{t("descrizione")}</p>

      <section className="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3" aria-labelledby="prepara-compito">
        <div className="max-w-2xl">
          <h2 id="prepara-compito" className="font-medium">{tUi("collections.prepareTitle")}</h2>
          <p className="text-sm text-muted-foreground">{tUi("collections.prepareDescription")}</p>
        </div>
        <Link href="/dashboard/esercizi/batterie" className="text-sm font-medium text-brand-blue hover:underline">
          {tUi("collections.prepareAction")}
        </Link>
      </section>

      <ContenitoriClient
        contenitori={contenitori.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          eserciziLabel: t("eserciziCount", { n: c.esercizi }),
        }))}
        testi={{
          nome: t("nome"),
          descrizioneCampo: t("descrizioneCampo"),
          crea: t("crea"),
          elimina: t("elimina"),
          erroreInUso: t("erroreInUso"),
          erroreGenerico: t("erroreGenerico"),
        }}
      />
      {contenitori.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("nessunContenitore")}</p>
      )}
    </div>
  );
}
