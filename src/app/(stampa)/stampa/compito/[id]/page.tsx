import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { datiStampaCompito, fogliDiStampa, leggiSceltaVersioni, MAX_VERSIONI } from "@/lib/esercizi/stampa";
import { VerificaStampabileLazy } from "@/components/esercizi/stampa/verifica-stampabile-lazy";

type Parametri = { versioni?: string; soluzioni?: string; scelto?: string };

export async function generateMetadata() {
  const t = await getTranslations("esercizi.stampa");
  return { title: t("titoloPagina") };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Parametri> }) {
  const session = await redirectUnlessTeacher();
  const { id } = await params;
  const dati = await datiStampaCompito(id, session.user.id);
  if (!dati) notFound();

  const t = await getTranslations("esercizi.stampa");
  const locale = (await getLocale()) === "en" ? "en" : "it";
  const query = await searchParams;
  const scelta = leggiSceltaVersioni(query.versioni);
  // Una casella non spuntata non viaggia nel modulo: `scelto` dice che il
  // modulo è stato inviato, e solo allora l'assenza di `soluzioni` conta.
  const conSoluzioni = query.scelto ? query.soluzioni === "1" : true;
  const fogli = fogliDiStampa(dati, scelta);
  const valoreVersioni = scelta.tipo === "studenti" ? "studenti" : String(scelta.quante);

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-xl border bg-slate-50 p-4 print:hidden">
        <Link href={`/dashboard/esercizi/compiti/${dati.compitoId}`} className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <h1 className="text-xl font-semibold">{t("titoloPagina")}</h1>
        <form method="get" className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="scelto" value="1" />
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{t("versioni")}</span>
            <select name="versioni" defaultValue={valoreVersioni} className="h-9 rounded-lg border bg-white px-2">
              {Array.from({ length: MAX_VERSIONI }, (_, i) => (
                <option key={i} value={i + 1}>{t("versioniN", { n: i + 1 })}</option>
              ))}
              <option value="studenti">{t("unaPerStudente", { n: dati.studenti.length })}</option>
            </select>
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <input type="checkbox" name="soluzioni" value="1" defaultChecked={conSoluzioni} />
            {t("conSoluzioni")}
          </label>
          <button type="submit" className="h-9 rounded-lg border bg-white px-4 text-sm font-medium hover:bg-slate-100">
            {t("aggiorna")}
          </button>
        </form>
        <p className="text-sm text-slate-600">{t("aiuto")}</p>
      </div>

      {dati.esercizi.length === 0 ? (
        <p>{t("nessunEsercizio")}</p>
      ) : fogli.length === 0 ? (
        <p>{t("nessunoStudente")}</p>
      ) : (
        <VerificaStampabileLazy
          titolo={dati.titolo}
          classe={dati.classe}
          esercizi={dati.esercizi}
          fogli={fogli}
          conSoluzioni={conSoluzioni}
          locale={locale}
        />
      )}
    </div>
  );
}
