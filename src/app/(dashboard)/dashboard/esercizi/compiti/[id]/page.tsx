import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { consegneDelCompito } from "@/lib/esercizi/compiti";
import { prisma } from "@/lib/db/client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.compiti");

  const { id } = await params;

  // `consegneDelCompito` è anche il controllo di autorizzazione (Fix round
  // 1: prima leggeva le consegne di QUALUNQUE compito, per QUALUNQUE docente
  // autenticato — lo stesso controllo che `assegna` fa già sulla scrittura,
  // qui mancava sulla lettura). Va chiamato PRIMA di toccare i metadati del
  // compito: un rifiuto deve fermare la pagina prima ancora di interrogare
  // nome della batteria/classe, non solo prima di mostrarli — altrimenti
  // un docente che sonda un id altrui imparerebbe comunque qualcosa dai
  // tempi/errori di una query in più. Il rifiuto si traduce in 404, non
  // 403: un 403 confermerebbe che quel compito esiste.
  const esito = await consegneDelCompito(id, session.user.id);
  if (!esito.ok) notFound();

  // `consegneDelCompito` non porta il nome della batteria o della classe
  // (non è nel suo contratto, guarda solo le consegne): li si legge qui,
  // solo per l'intestazione della pagina — e solo ora che l'autorizzazione
  // è già confermata.
  const compito = await prisma.compito.findUnique({
    where: { id },
    include: { classe: true, batteria: true },
  });
  if (!compito) notFound();

  const consegne = esito.righe;

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
