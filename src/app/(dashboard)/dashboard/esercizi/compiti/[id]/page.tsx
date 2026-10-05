import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { consegneDelCompito } from "@/lib/esercizi/compiti";
import { statisticheDelCompito } from "@/lib/esercizi/statistiche";
import { prisma } from "@/lib/db/client";
import { TeacherExercisesNav } from "../../teacher-exercises-nav";
import { GestioneCompito } from "./gestione-compito";

// La data nel formato del campo `type="date"`, in UTC: il modulo di
// assegnazione la manda come `new Date("AAAA-MM-GG")`, cioè mezzanotte UTC,
// e leggerla in un altro fuso la sposterebbe di un giorno nel campo.
const perCampoData = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

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
  // Un compito ritirato (soft delete) esiste ancora come riga: questa
  // lettura per id lo troverebbe, quindi lo si esclude qui esplicitamente —
  // `consegneDelCompito` lo tratta già come inesistente.
  if (!compito || compito.ritiratoAt != null) notFound();

  // Le statistiche per esercizio riverificano da sé il titolo del docente
  // (stessa regola delle consegne): un compito ritirato fra le due letture
  // risponde "non trovato", e la pagina si comporta come per un id che non
  // c'è.
  const statistiche = await statisticheDelCompito(id, session.user.id);
  if (!statistiche.ok) notFound();

  const consegne = esito.righe;
  const tUi = await getTranslations("teacherExercisesUi");
  const tE = await getTranslations("esercizi");

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes") }} />
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

      <GestioneCompito compitoId={compito.id} opensAt={perCampoData(compito.opensAt)} dueAt={perCampoData(compito.dueAt)} />

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
                  {r.totali === 0 ? tUi("tasks.progressToDo") : `${r.fatti}/${r.totali}`}
                </td>
                <td className="p-2">
                  {r.massimo === 0 ? tUi("tasks.noScore") : `${r.punteggio}/${r.massimo}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Senza iscritti ogni riga direbbe "0 su 0": niente da leggere. */}
      {statistiche.iscritti > 0 && statistiche.righe.length > 0 && (
        <section className="space-y-2">
          <h2 id="per-esercizio" className="text-lg font-semibold">{tE("statistiche.perEsercizioTitolo")}</h2>
          <p className="text-sm text-muted-foreground">{tE("statistiche.perEsercizioDescrizione")}</p>
          <table aria-labelledby="per-esercizio" className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-2 font-medium">{tE("statistiche.esercizioCol")}</th>
                <th className="p-2 font-medium">{tE("statistiche.argomentoCol")}</th>
                <th className="p-2 font-medium">{tE("statistiche.completatiCol")}</th>
                <th className="p-2 font-medium">{tE("statistiche.iniziatiCol")}</th>
                <th className="p-2 font-medium">{tE("statistiche.mediaCol")}</th>
              </tr>
            </thead>
            <tbody>
              {statistiche.righe.map((r, i) => {
                // "Meno della metà" in senso stretto: 2 su 4 non è segnalato.
                // Il segnale è un testo (non solo il colore della riga): si
                // legge anche senza distinguere i colori e da uno screen reader.
                const sottoMeta = r.completati * 2 < statistiche.iscritti;
                return (
                  <tr key={`${r.esercizioId}-${i}`} className={`border-b ${sottoMeta ? "bg-brand-orange/10" : ""}`}>
                    <td className="p-2">{r.titolo}</td>
                    <td className="p-2">{r.argomento}</td>
                    <td className="p-2">
                      <span>{tE("statistiche.completatiValore", { completati: r.completati, iscritti: statistiche.iscritti })}</span>
                      {sottoMeta && (
                        <span className="ml-2 rounded bg-brand-orange/20 px-1.5 py-0.5 text-xs font-medium">
                          {tE("statistiche.sottoMeta")}
                        </span>
                      )}
                    </td>
                    <td className="p-2">{r.iniziati}</td>
                    <td className="p-2">
                      {r.mediaPercentuale == null
                        ? tE("statistiche.nessunaMedia")
                        : tE("statistiche.percentuale", { valore: r.mediaPercentuale })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
