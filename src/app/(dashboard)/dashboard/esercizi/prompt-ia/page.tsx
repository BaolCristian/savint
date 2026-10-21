import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { PromptEsercizi } from "@/components/esercizi/prompt-esercizi";
import { TeacherExercisesNav } from "../teacher-exercises-nav";

/** Il generatore del prompt per creare esercizi con un'IA esterna: la
 * gemella, per gli esercizi, della pagina "Crea quiz con l'IA". Il JSON che
 * l'IA restituisce si importa da `/dashboard/esercizi/redazione/importa`. */
export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("ai.esercizi");
  const tUi = await getTranslations("teacherExercisesUi");

  return (
    <div className="space-y-4 p-6">
      <TeacherExercisesNav labels={{
        label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"),
        collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes"),
      }} />
      <div className="max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">{t("titoloPagina")}</h1>
        <PromptEsercizi />
      </div>
    </div>
  );
}
