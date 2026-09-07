import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { elencoBatterie } from "@/lib/esercizi/batterie";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { CompitoForm } from "./compito-form";

export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.compiti");

  const [classi, batterie] = await Promise.all([
    classiDelDocente(session.user.id),
    elencoBatterie(),
  ]);

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

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
        <p className="text-sm text-muted-foreground">{t("descrizione")}</p>
      </div>

      {classi.length === 0 || batterie.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {classi.length === 0 ? t("nessunaClasseInsegnata") : t("nessunaBatteriaDisponibile")}
        </p>
      ) : (
        <CompitoForm
          batterie={batterie.map((b) => ({ id: b.id, label: b.name }))}
          classi={classi.map((c) => ({ id: c.id, label: c.name }))}
        />
      )}

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("elencoTitolo")}</h2>
        {compiti.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nessunCompito")}</p>
        ) : (
          <ul className="grid gap-2">
            {compiti.map((c) => (
              <li key={c.id} className="rounded-lg border border-input p-3 text-sm">
                <Link href={`/dashboard/esercizi/compiti/${c.id}`} className="font-medium text-brand-blue hover:underline">
                  {c.batteria} — {c.classe}
                </Link>
                <p className="text-muted-foreground">
                  {c.dueAt ? t("compitoScadenza", { quando: c.dueAt.toLocaleDateString("it-IT") }) : t("nessunaScadenza")}
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
