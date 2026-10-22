import { getTranslations } from "next-intl/server";
import type { TestiCommenti } from "./commenti-esercizio";

/** I testi della sezione "Commenti", letti lato server da ogni pagina che
 * la mostra. `risolti` riceve il segnaposto come valore di se stesso
 * (`{ n: "{n}" }`): lo riempie la sezione col numero che conosce solo lei. */
export async function testiCommenti(): Promise<TestiCommenti> {
  const t = await getTranslations("esercizi.commenti");
  return {
    titolo: t("titolo"),
    nessuno: t("nessuno"),
    scrivi: t("scrivi"),
    invia: t("invia"),
    invioInCorso: t("invioInCorso"),
    rispondi: t("rispondi"),
    scriviRisposta: t("scriviRisposta"),
    inviaRisposta: t("inviaRisposta"),
    annulla: t("annulla"),
    segnaRisolto: t("segnaRisolto"),
    riapri: t("riapri"),
    risolti: t("risolti", { n: "{n}" }),
    elimina: t("elimina"),
    confermaElimina: t("confermaElimina"),
    eliminaConRisposte: t("eliminaConRisposte"),
    tu: t("tu"),
    erroreTesto: t("erroreTesto"),
    erroreNonPermesso: t("erroreNonPermesso"),
    erroreNonTrovato: t("erroreNonTrovato"),
    erroreTroppi: t("erroreTroppi"),
    erroreGenerico: t("erroreGenerico"),
  };
}
