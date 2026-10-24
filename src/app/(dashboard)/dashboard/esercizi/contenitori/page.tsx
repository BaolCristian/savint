import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { ContenitoriClient } from "./contenitori-client";
import { TeacherExercisesNav } from "../teacher-exercises-nav";
import { etichetteNav } from "../aree";
import { IntestazioneArea } from "../intestazione-area";

export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.contenitori");
  const tUi = await getTranslations("teacherExercisesUi");

  // Solo le raccolte su cui il docente ha un ruolo; eliminarla spetta al
  // proprietario (la rotta risponderebbe 403 a chiunque altro).
  const contenitori = await elencoContenitori(utenteDaSessione(session));

  return (
    <div className="space-y-4">
      <TeacherExercisesNav labels={etichetteNav(tUi)} />
      {/* Nuovo compito, Task 7: le raccolte sono solo cartelle per tenere
          in ordine gli esercizi. Niente piu' "Prepara un compito" qui: si
          assegna dalla pagina di una raccolta ("Assegna questa raccolta"). */}
      <IntestazioneArea area="raccolte" titolo={t("titolo")} descrizione={t("descrizione")} />

      <ContenitoriClient
        contenitori={contenitori.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          eserciziLabel: t("eserciziCount", { n: c.esercizi }),
          eliminabile: c.ruolo === "PROPRIETARIO",
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
