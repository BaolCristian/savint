import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { caricaPerAnteprima } from "@/lib/esercizi/redazione";
import { AnteprimaDocenteClient } from "./anteprima-docente-client";

/** L'anteprima del docente su QUALUNQUE esercizio del bacino, modificabile
 * o no: a differenza della pagina di modifica (`redazione/[id]/page.tsx`,
 * che chiama `caricaPerEditor` e rifiuta un esercizio non ricostruibile),
 * questa prende sempre il contenuto GREZZO dell'ultima versione
 * (`caricaPerAnteprima`, redazione.ts) — lo stesso che lo studente
 * riceverebbe da `avviaORiprendi`. È l'unico posto dove un docente può
 * vedere, coi propri occhi, sei degli otto esercizi seminati che l'editor
 * non sa aprire (vedi il brief del task): senza questa pagina un docente
 * costruisce contenitori e batterie dai soli titoli, e assegna alla classe
 * un lavoro che non ha mai visto.
 *
 * `non_trovato` resta un 404 vero (come nella pagina di modifica): un id
 * che non corrisponde a nessun esercizio non è un caso da spiegare in
 * pagina. `senza_versione` invece lo è — capita nel bacino seminato — e va
 * detto chiaramente, mai un player montato su un contenuto assente. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.anteprimaDocente");
  const { id } = await params;

  const esito = await caricaPerAnteprima(id);
  if (!esito.ok && esito.motivo === "non_trovato") notFound();

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <div className="space-y-4 p-6">
      <Link href="/dashboard/esercizi/redazione" className="text-sm text-brand-blue hover:underline">
        {t("torna")}
      </Link>

      {esito.ok ? (
        <>
          <div>
            <h1 className="text-2xl font-semibold">{esito.titolo}</h1>
            <p className="text-sm text-muted-foreground">{t("versione", { numero: esito.versione })}</p>
          </div>
          <p className="text-sm text-muted-foreground">{t("spiegazione")}</p>
          <AnteprimaDocenteClient esercizioId={id} content={esito.content} locale={locale} />
        </>
      ) : (
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">{t("senzaVersioneTitolo")}</h1>
          <p className="text-sm text-muted-foreground">{t("senzaVersioneTesto")}</p>
        </div>
      )}
    </div>
  );
}
