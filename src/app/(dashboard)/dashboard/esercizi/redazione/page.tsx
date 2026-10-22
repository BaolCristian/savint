import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoRedazione } from "@/lib/esercizi/redazione";
import { Button } from "@/components/ui/button";
import { TeacherExercisesNav } from "../teacher-exercises-nav";
import { RedazioneElencoClient, type VoceElenco } from "./redazione-elenco-client";

/** Un conteggio da `searchParams`: solo un intero non negativo, altrimenti
 * `null` (l'URL lo scrive chiunque, l'avviso non deve mostrare "NaN"). */
function conteggio(valore: string | undefined): number | null {
  if (valore === undefined || !/^\d+$/.test(valore)) return null;
  return Number(valore);
}

/** L'elenco della redazione: solo due degli otto esercizi seminati sono
 * modificabili con questo editor — gli altri usano costrutti che non sa
 * ricostruire fedelmente, e il rifiuto di `daNumbas` porta con sé il
 * perché (vedi il brief del Task 8). `elencoRedazione` (redazione.ts)
 * restituisce ora anche `motivo` insieme a `modificabile`: `daNumbas(...)`
 * viene chiamato UNA sola volta lì per calcolare entrambi, invece che una
 * volta qui (scartando il `dettaglio`) e una seconda in `caricaPerEditor`
 * per ogni riga non modificabile solo per riaverlo.
 *
 * Item I5 dell'onda di correzioni finale (interfaccia) aveva segnalato
 * esattamente il doppio giro che questo commento descriveva prima di
 * questa correzione — tre query in più per ogni riga non modificabile
 * (`caricaPerEditor` rilegge riga, versione e autore), ~68 query e 864 ms
 * misurati su 24 esercizi. Corretto qui, lato dominio (`VoceRedazione.motivo`,
 * redazione.ts) e qui, lato pagina (nessuna rilettura). Vedi il rapporto:
 * .superpowers/sdd/2026-09-07-esercizi-05-editor/onda-finale-interfaccia.md
 *
 * "Duplica" (`testi.duplica*`, sotto) è di nuovo offerto — solo sulle righe
 * già modificabili, non su quelle di sola lettura: vedi il commento in
 * `redazione-elenco-client.tsx`. */
export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ importati?: string; saltati?: string }>;
} = {}) {
  await redirectUnlessTeacher();
  // `?importati=N&saltati=M`: ci torna la pagina di import quando tutti gli
  // esercizi mandati sono stati salvati (importa/importa-client.tsx); se
  // qualcuno non lo è, la pagina di import resta aperta e lo elenca.
  const parametri = (await searchParams) ?? {};
  const importati = conteggio(parametri.importati);
  const saltati = conteggio(parametri.saltati) ?? 0;
  const t = await getTranslations("esercizi.redazione.elenco");
  const tBase = await getTranslations("esercizi");
  const tUi = await getTranslations("teacherExercisesUi");

  const elenco = await elencoRedazione();

  const formattaData = (d: Date) => d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

  const voci: VoceElenco[] = elenco.map((v) => ({
    id: v.id,
    titolo: v.titolo,
    sottotitolo: tBase("annoArgomento", { anno: v.anno, argomento: v.argomento }),
    classe: tUi("catalog.classe", { anno: v.anno }),
    anno: v.anno,
    argomento: v.argomento,
    modificabile: v.modificabile,
    motivo: v.modificabile ? null : (v.motivo ?? t("motivoGenerico")),
    ultimaVersione: t("ultimaVersioneDa", {
      autore: v.autoreNome ?? t("autoreSconosciuto"),
      data: formattaData(v.aggiornatoIl),
    }),
  }));

  return (
    <div className="space-y-4 p-6">
      <TeacherExercisesNav labels={{
        label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"),
        collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes"),
      }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
          {/* La riga che la specifica impone: il rischio di due docenti che
              si sovrascrivono va reso visibile, non solo mitigato altrove. */}
          <p className="text-sm text-muted-foreground">{t("chiunquePuoModificare")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/esercizi/redazione/importa">
            <Button type="button" variant="outline">{t("importa")}</Button>
          </Link>
          <Link href="/dashboard/esercizi/redazione/nuovo">
            <Button type="button">{t("nuovo")}</Button>
          </Link>
        </div>
      </div>

      {importati !== null && (
        <p role="status" className="rounded-lg border border-brand-green/40 bg-brand-green/10 p-3 text-sm">
          {t("importati", { importati, saltati })}
        </p>
      )}

      {voci.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunEsercizio")}</p>
      ) : (
        <RedazioneElencoClient
          voci={voci}
          testi={{
            modificabile: t("modificabile"),
            soloLettura: t("soloLettura"),
            apri: t("apri"),
            anteprima: t("anteprima"),
            duplica: t("duplica"),
            duplicaInCorso: t("duplicaInCorso"),
            duplicaErrore: t("duplicaErrore"),
            cerca: tUi("catalog.search"),
            anno: tUi("catalog.year"),
            argomento: tUi("catalog.topic"),
            modificabilita: tUi("catalog.editability"),
            tutti: tUi("catalog.all"),
            modificabili: tUi("catalog.editable"),
            solaLettura: tUi("catalog.readOnly"),
            diagnostica: tUi("catalog.diagnostics"),
            nessunRisultato: tUi("catalog.noResults"),
          }}
        />
      )}
    </div>
  );
}
