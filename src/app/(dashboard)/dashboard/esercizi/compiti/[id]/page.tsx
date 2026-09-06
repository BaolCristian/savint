import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { consegneDelCompito } from "@/lib/esercizi/compiti";
import { prisma } from "@/lib/db/client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.compiti");

  const { id } = await params;
  // `consegneDelCompito` non porta il nome della batteria o della classe
  // (non è nel suo contratto, guarda solo le consegne): li si legge qui,
  // solo per l'intestazione della pagina.
  const compito = await prisma.compito.findUnique({
    where: { id },
    include: { classe: true, batteria: true },
  });
  if (!compito) notFound();

  const consegne = await consegneDelCompito(id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/esercizi/compiti" className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <h1 className="text-2xl font-semibold">
          {t("titoloConsegne", { batteria: compito.batteria.name, classe: compito.classe.name })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {compito.dueAt ? t("compitoScadenza", { quando: compito.dueAt.toLocaleDateString("it-IT") }) : t("nessunaScadenza")}
        </p>
      </div>

      {consegne.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunoIscritto")}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2 font-medium">{t("nomeCol")}</th>
              <th className="p-2 font-medium">{t("fattiCol")}</th>
              <th className="p-2 font-medium">{t("punteggioCol")}</th>
            </tr>
          </thead>
          <tbody>
            {consegne.map((r) => (
              <tr key={r.studentId} className="border-b">
                <td className="p-2">{r.nome}</td>
                <td className="p-2">
                  {r.fatti}/{r.totali}
                </td>
                <td className="p-2">
                  {r.punteggio}/{r.massimo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
