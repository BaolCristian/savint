import { getLocale } from "next-intl/server";
import { elencoCommenti } from "@/lib/esercizi/commenti";
import { puo, type Ruolo, type Utente } from "@/lib/esercizi/accesso";
import { CommentiEsercizio } from "./commenti-esercizio";
import { testiCommenti } from "./testi-commenti";

/** La sezione "Commenti" di un esercizio, per le pagine server (anteprima e
 * editor): legge i commenti e i testi qui, traduce il ruolo in permessi e
 * passa le date come stringhe ISO al client component. La pagina la mostra
 * solo dopo aver verificato che `chi` veda l'esercizio. */
export async function SezioneCommenti({
  esercizioId,
  chi,
  ruolo,
  richiudibile = false,
}: {
  esercizioId: string;
  chi: Utente;
  ruolo: Ruolo;
  /** Vedi `CommentiEsercizio`: per l'editor. */
  richiudibile?: boolean;
}) {
  const [commenti, testi, locale] = await Promise.all([elencoCommenti(esercizioId, chi), testiCommenti(), getLocale()]);
  const iso = <T extends { createdAt: Date }>(c: T) => ({ ...c, createdAt: c.createdAt.toISOString() });
  return (
    <CommentiEsercizio
      esercizioId={esercizioId}
      iniziali={(commenti ?? []).map((c) => ({ ...iso(c), risposte: c.risposte.map(iso) }))}
      permessi={{ commentare: puo(ruolo, "commentare"), risolvere: puo(ruolo, "risolvere"), eliminaTutti: puo(ruolo, "condividere") }}
      testi={testi}
      locale={locale === "en" ? "en" : "it"}
      richiudibile={richiudibile}
    />
  );
}
