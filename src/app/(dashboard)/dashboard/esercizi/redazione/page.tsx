import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoRedazione, caricaPerEditor } from "@/lib/esercizi/redazione";
import { Button } from "@/components/ui/button";
import { RedazioneElencoClient, type VoceElenco } from "./redazione-elenco-client";

/** L'elenco della redazione: solo due degli otto esercizi seminati sono
 * modificabili con questo editor — gli altri usano costrutti che non sa
 * ricostruire fedelmente, e il rifiuto di `daNumbas` porta con sé il
 * perché (vedi il brief del Task 8). `elencoRedazione` (redazione.ts) sa
 * solo che un esercizio non è modificabile, non con quale motivo — scarta
 * il `dettaglio` di `daNumbas`, che qui invece serve. Si rilegge quindi
 * `caricaPerEditor` per ognuno dei non modificabili: stesso controllo,
 * stesso esito, ma questa volta il motivo non va buttato via.
 *
 * Nessuna modifica a src/lib/esercizi/ è consentita da questo task: questo
 * doppio giro (invece di allargare `VoceRedazione` con un campo motivo) è
 * il modo di rispettare quel vincolo restando nel dominio così com'è.
 *
 * Item I5 dell'onda di correzioni finale (interfaccia) segnala che questo
 * doppio giro è esattamente il difetto da correggere — tre query in più
 * per ogni riga non modificabile (`caricaPerEditor` rilegge riga, versione
 * e autore), ~68 query e 864 ms misurati su 24 esercizi — e chiede di
 * "portare il motivo fuori da `elencoRedazione`" invece di riderivarlo.
 * Resta NON corretto qui: `elencoRedazione` vive in
 * src/lib/esercizi/redazione.ts, fuori dal perimetro di questo stesso
 * task (un secondo agente lavora in parallelo sui file di dominio). La
 * correzione minima, per chi ha il permesso di toccare quel file: in
 * `elencoRedazione`, `daNumbas(...)` viene già chiamato per ogni esercizio
 * per calcolare `modificabile` — basta conservarne anche il `dettaglio`
 * (quando `!ok`) in un campo nuovo `motivo: string | null` di
 * `VoceRedazione`, invece di scartarlo. Fatto quello, questa pagina si
 * riduce a `motivo: v.modificabile ? null : (v.motivo ?? t("motivoGenerico"))`,
 * senza più il secondo giro su `caricaPerEditor` sopra. Vedi il rapporto:
 * .superpowers/sdd/2026-09-07-esercizi-05-editor/onda-finale-interfaccia.md */
export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.redazione.elenco");
  const tBase = await getTranslations("esercizi");

  const elenco = await elencoRedazione();

  const nonModificabili = elenco.filter((v) => !v.modificabile);
  const coppieMotivo = await Promise.all(
    nonModificabili.map(async (v): Promise<readonly [string, string | null]> => {
      const esito = await caricaPerEditor(v.id);
      return [v.id, !esito.ok && esito.motivo === "non_rappresentabile" ? esito.dettaglio : null];
    }),
  );
  const motivi = new Map(coppieMotivo);

  const formattaData = (d: Date) => d.toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });

  const voci: VoceElenco[] = elenco.map((v) => ({
    id: v.id,
    titolo: v.titolo,
    sottotitolo: tBase("annoArgomento", { anno: v.anno, argomento: v.argomento }),
    modificabile: v.modificabile,
    motivo: v.modificabile ? null : (motivi.get(v.id) ?? t("motivoGenerico")),
    ultimaVersione: t("ultimaVersioneDa", {
      autore: v.autoreNome ?? t("autoreSconosciuto"),
      data: formattaData(v.aggiornatoIl),
    }),
  }));

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
          {/* La riga che la specifica impone: il rischio di due docenti che
              si sovrascrivono va reso visibile, non solo mitigato altrove. */}
          <p className="text-sm text-muted-foreground">{t("chiunquePuoModificare")}</p>
        </div>
        <Link href="/dashboard/esercizi/redazione/nuovo">
          <Button type="button">{t("nuovo")}</Button>
        </Link>
      </div>

      {voci.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunEsercizio")}</p>
      ) : (
        <RedazioneElencoClient
          voci={voci}
          testi={{
            modificabile: t("modificabile"),
            soloLettura: t("soloLettura"),
            apri: t("apri"),
            soloRepository: t("soloRepository"),
          }}
        />
      )}
    </div>
  );
}
