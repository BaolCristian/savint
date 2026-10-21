import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { TeacherExercisesNav } from "../../teacher-exercises-nav";
import { ImportaClient } from "./importa-client";

/** L'import di esercizi generati da un'IA: il docente incolla (o carica) il
 * JSON, lo controlla, vede l'anteprima di ciascun esercizio e importa i soli
 * validi. Tutto il lavoro è nel client; il server rifà comunque ogni
 * controllo nelle rotte (`/api/esercizi/redazione/importa*`). */
export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.redazione.importa");
  const tElenco = await getTranslations("esercizi.redazione.elenco");
  const tUi = await getTranslations("teacherExercisesUi");
  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <div className="space-y-4 p-6">
      <TeacherExercisesNav labels={{
        label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"),
        collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes"),
      }} />
      <Link href="/dashboard/esercizi/redazione" className="text-sm text-brand-blue hover:underline">
        {tElenco("torna")}
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
        <p className="text-sm text-muted-foreground">{t("spiegazione")}</p>
      </div>
      <ImportaClient locale={locale} />
    </div>
  );
}
