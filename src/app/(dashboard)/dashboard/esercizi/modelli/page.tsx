import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoModelli } from "@/lib/esercizi/batterie";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { ModelliClient } from "./modelli-client";
import { TeacherExercisesNav } from "../teacher-exercises-nav";
import { etichetteNav } from "../aree";
import { IntestazioneArea } from "../intestazione-area";

// Nuovo compito, Task 5: i modelli al posto dei "compiti preparati". Sono
// comuni a tutta la scuola (Decisioni, punto 1): l'elenco li mostra tutti,
// con l'autore e un filtro Miei/Tutti; "Elimina" c'è solo sui propri, o su
// tutti per un ADMIN — la rotta risponderebbe 404 a chiunque altro.
export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.modelli");
  const tUi = await getTranslations("teacherExercisesUi");

  const chi = utenteDaSessione(session);
  const modelli = await elencoModelli(chi);

  return (
    <div className="space-y-4">
      <TeacherExercisesNav labels={etichetteNav(tUi)} />
      <IntestazioneArea area="modelli" titolo={t("titolo")} descrizione={t("descrizione")} />

      {modelli.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunModello")}</p>
      ) : (
        <ModelliClient
          modelli={modelli.map((m) => ({
            id: m.id,
            nome: m.nome,
            mio: m.mio,
            autoreLabel: m.autoreNome ? t("di", { autore: m.autoreNome }) : null,
            blocchiLabel: m.blocchi.map((b) => t("blocco", { quanti: b.quanti, etichetta: b.etichetta })),
            usatoLabel: t("usato", { n: m.usato }),
            eliminabile: m.mio || chi.admin,
          }))}
          testi={{
            filtro: t("filtro"),
            filtroTutti: t("filtroTutti"),
            filtroMiei: t("filtroMiei"),
            usa: t("usa"),
            elimina: t("elimina"),
            eliminaConfermaTitolo: t("eliminaConfermaTitolo"),
            eliminaConfermaTesto: t("eliminaConfermaTesto"),
            eliminaConferma: t("eliminaConferma"),
            annulla: t("annulla"),
            nessunoMio: t("nessunoMio"),
            erroreGenerico: t("erroreGenerico"),
          }}
        />
      )}
    </div>
  );
}
