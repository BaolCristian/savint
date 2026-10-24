import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { buttonVariants } from "@/components/ui/button-variants";
import { TeacherExercisesNav } from "../teacher-exercises-nav";
import { etichetteNav } from "../aree";
import { IntestazioneArea } from "../intestazione-area";

export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.compiti");
  const tUi = await getTranslations("teacherExercisesUi");

  const classi = await classiDelDocente(session.user.id);

  // I compiti già assegnati alle classi del docente, una classe alla volta:
  // `compitiDellaClasse` lavora per classe, qui si accorpano con il nome
  // della classe per l'elenco della pagina.
  const compitiPerClasse = await Promise.all(
    classi.map(async (c) => {
      const compiti = await compitiDellaClasse(c.id);
      return compiti.map((compito) => ({ ...compito, classe: c.name }));
    }),
  );
  const compiti = compitiPerClasse.flat();
  // Una scadenza gia' passata si legge in rosso.
  const adesso = new Date();

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={etichetteNav(tUi)} />
      {/* Nuovo compito, Task 7: questa pagina e' lo STORICO, e in alto c'e'
          la sola strada per dare un compito nuovo. Il <details> "Assegna un
          compito preparato" (CompitoForm) non c'e' piu': un modello si usa
          dalla pagina Modelli, che apre lo stesso Nuovo compito. */}
      <IntestazioneArea
        area="compiti"
        titolo={t("titolo")}
        descrizione={t("descrizione")}
        azioni={
          <Link href="/dashboard/esercizi/compiti/nuovo" className={buttonVariants()}>
            {t("nuovo")}
          </Link>
        }
      />

      {classi.length === 0 && <p className="text-sm text-muted-foreground">{t("nessunaClasseInsegnata")}</p>}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("elencoTitolo")}</h2>
        {compiti.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nessunCompito")}</p>
        ) : (
          <ul className="grid gap-2">
            {compiti.map((c) => (
              <li
                key={c.id}
                className={`rounded-xl border border-border border-l-4 bg-card p-3 text-sm shadow-sm ${
                  c.tipo === "VERIFICA" ? "border-l-brand-magenta" : "border-l-brand-orange"
                }`}
              >
                {/* Una verifica ha la sua pagina (monitoraggio e risultati),
                    non quella delle consegne di un compito. */}
                {c.tipo === "VERIFICA" && (
                  <span className="mr-2 rounded bg-brand-magenta/10 px-1.5 py-0.5 text-xs font-medium text-brand-magenta">
                    {t("etichettaVerifica")}
                  </span>
                )}
                <Link
                  href={c.tipo === "VERIFICA" ? `/dashboard/esercizi/verifiche/${c.id}` : `/dashboard/esercizi/compiti/${c.id}`}
                  className="font-medium hover:underline"
                >
                  {c.batteria} — {c.classe}
                </Link>
                <p className="text-muted-foreground">
                  <span className={c.dueAt && c.dueAt < adesso ? "font-medium text-destructive" : undefined}>
                    {c.dueAt ? t("compitoScadenza", { quando: c.dueAt.toLocaleDateString("it-IT") }) : t("nessunaScadenza")}
                  </span>
                  {" · "}
                  {t("eserciziCount", { n: c.esercizi })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
