import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { datiStampaEsercitazione, leggiFonte, leggiSceltaSoluzioni } from "@/lib/esercizi/stampa-esercitazione";
import { VerificaStampabileLazy } from "@/components/esercizi/stampa/verifica-stampabile-lazy";

type Parametri = { argomento?: string; anno?: string; raccolta?: string; soluzioni?: string };

export async function generateMetadata() {
  const t = await getTranslations("esercizi.stampaEsercitazione");
  return { title: t("titoloPagina") };
}

/** Un'esercitazione da consegnare in classe: tutti gli esercizi di un
 * argomento (`?argomento=…&anno=…`) o di una raccolta (`?raccolta=…`). Il
 * docente sceglie se volere anche le soluzioni, in fondo o in un PDF a parte. */
export default async function Page({ searchParams }: { searchParams: Promise<Parametri> }) {
  const session = await redirectUnlessTeacher();
  const query = await searchParams;
  const fonte = leggiFonte(query);
  if (!fonte) notFound();
  const dati = await datiStampaEsercitazione(fonte, utenteDaSessione(session));
  if (!dati) notFound();

  const t = await getTranslations("esercizi.stampaEsercitazione");
  const locale = (await getLocale()) === "en" ? "en" : "it";
  const soluzioni = leggiSceltaSoluzioni(query.soluzioni);
  const titolo = fonte.tipo === "argomento" && fonte.anno ? t("titoloConClasse", { titolo: dati.titolo, anno: fonte.anno }) : dati.titolo;

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border bg-slate-50 p-4 print:hidden">
        <Link href={dati.indietro} className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <h1 className="text-xl font-semibold">{t("titoloPagina")}</h1>
        <p className="text-sm text-slate-700">{t("quanti", { n: dati.esercizi.length, titolo })}</p>
        <form method="get" className="flex flex-wrap items-end gap-4">
          {fonte.tipo === "raccolta" ? (
            <input type="hidden" name="raccolta" value={fonte.id} />
          ) : (
            <>
              <input type="hidden" name="argomento" value={fonte.argomento} />
              {fonte.anno && <input type="hidden" name="anno" value={fonte.anno} />}
            </>
          )}
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("soluzioni")}</span>
            <select name="soluzioni" defaultValue={soluzioni} className="h-9 rounded-lg border bg-white px-2">
              <option value="no">{t("soluzioniNo")}</option>
              <option value="fondo">{t("soluzioniFondo")}</option>
              <option value="sole">{t("soluzioniSole")}</option>
            </select>
          </label>
          <button type="submit" className="h-9 rounded-lg border bg-white px-4 text-sm font-medium hover:bg-slate-100">
            {t("aggiorna")}
          </button>
        </form>
        <p className="text-sm text-slate-600">{t("aiuto")}</p>
      </div>

      {dati.esercizi.length === 0 ? (
        <p>{t("nessunEsercizio")}</p>
      ) : (
        <VerificaStampabileLazy
          titolo={titolo}
          classe=""
          esercizi={dati.esercizi}
          fogli={[dati.foglio]}
          conSoluzioni={soluzioni === "fondo"}
          soloSoluzioni={soluzioni === "sole"}
          locale={locale}
        />
      )}
    </div>
  );
}
