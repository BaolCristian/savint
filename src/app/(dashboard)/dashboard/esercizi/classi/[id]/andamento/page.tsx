import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { andamentoDellaClasse } from "@/lib/esercizi/statistiche";
import { TeacherExercisesNav } from "../../../teacher-exercises-nav";

/** L'andamento di una classe per argomento, su tutti i suoi compiti non
 * ritirati: dove la classe è debole, prima di decidere cosa riassegnare.
 * Vive sotto "Classi" (la voce resta evidenziata nella navigazione) perché
 * è una vista sulla classe, non su un singolo compito. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await redirectUnlessTeacher();
  const { id } = await params;

  // Il dominio è anche il controllo di autorizzazione (solo chi insegna la
  // classe): un rifiuto diventa 404, non 403, che confermerebbe a chi
  // sonda un id altrui che quella classe esiste.
  const esito = await andamentoDellaClasse(id, session.user.id);
  if (!esito.ok) notFound();

  const t = await getTranslations("esercizi");
  const tUi = await getTranslations("teacherExercisesUi");

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes") }} />
      <div className="space-y-1">
        <Link href="/dashboard/esercizi/classi" className="text-sm text-brand-blue hover:underline">
          {t("statistiche.tornaClassi")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("statistiche.andamentoTitolo", { classe: esito.classe.nome })}</h1>
        <p className="text-sm text-muted-foreground">{t("statistiche.andamentoDescrizione")}</p>
        <p className="text-sm text-muted-foreground">
          {t("statistiche.andamentoRiepilogo", { compiti: esito.compiti, iscritti: esito.iscritti })}
        </p>
      </div>

      {esito.righe.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("statistiche.nessunCompito")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2 font-medium">{t("statistiche.argomentoCol")}</th>
              <th className="p-2 font-medium">{t("statistiche.eserciziCol")}</th>
              <th className="p-2 font-medium">{t("statistiche.completamentoCol")}</th>
              <th className="p-2 font-medium">{t("statistiche.mediaCol")}</th>
            </tr>
          </thead>
          <tbody>
            {esito.righe.map((r) => {
              // Stessa soglia del dettaglio di un compito: meno della metà
              // delle consegne attese, detta a parole e non solo col colore.
              const sottoMeta = r.attese > 0 && r.completate * 2 < r.attese;
              return (
                <tr key={r.argomento} className={`border-b ${sottoMeta ? "bg-brand-orange/10" : ""}`}>
                  <td className="p-2">{r.argomento}</td>
                  <td className="p-2">{r.esercizi}</td>
                  <td className="p-2">
                    {r.percentualeCompletamento == null ? (
                      t("statistiche.nessunaMedia")
                    ) : (
                      <span>
                        {t("statistiche.completamentoValore", {
                          percentuale: r.percentualeCompletamento,
                          completate: r.completate,
                          attese: r.attese,
                        })}
                      </span>
                    )}
                    {sottoMeta && (
                      <span className="ml-2 rounded bg-brand-orange/20 px-1.5 py-0.5 text-xs font-medium">
                        {t("statistiche.sottoMeta")}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.mediaPercentuale == null
                      ? t("statistiche.nessunaMedia")
                      : t("statistiche.percentuale", { valore: r.mediaPercentuale })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
