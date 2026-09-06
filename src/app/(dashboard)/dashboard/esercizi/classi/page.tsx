import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDisponibili, classiDelDocente } from "@/lib/esercizi/classi";
import { ClassiForm } from "./classi-form";

/** Il docente dichiara quali classi insegna, scegliendo fra TUTTE quelle
 * esistenti (`classiDisponibili`, senza rotta HTTP: qui si legge il dominio
 * direttamente, come da nota della spec). Solo le classi selezionate
 * potranno poi ricevere un compito da lui (`assegna` rifiuta altrimenti). */
export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.classi");

  const [disponibili, insegnate] = await Promise.all([
    classiDisponibili(),
    classiDelDocente(session.user.id),
  ]);
  const insegnateIds = insegnate.map((c) => c.id);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
      <p className="text-sm text-muted-foreground">{t("descrizione")}</p>
      {disponibili.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunaClasse")}</p>
      ) : (
        <ClassiForm
          classi={disponibili}
          selezionateIniziali={insegnateIds}
          testi={{ salva: t("salva"), salvato: t("salvato"), errore: t("erroreSalvataggio") }}
        />
      )}
    </div>
  );
}
