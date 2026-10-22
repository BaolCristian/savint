import { getTranslations } from "next-intl/server";
import type { TestiCondivisione } from "./condividi-dialog";

/** I testi della finestra "Condividi", letti lato server da ogni pagina che
 * la mostra. Quelli con un segnaposto lo ricevono come valore di se stesso
 * (`{ nome: "{nome}" }`): così il messaggio ICU resta valido e la finestra
 * lo riempie con i dati che legge solo lei (`riempi`, condividi-dialog.tsx). */
export async function testiCondivisione(): Promise<TestiCondivisione> {
  const t = await getTranslations("esercizi.condivisione");
  const titolo = { titolo: "{titolo}" };
  const nome = { nome: "{nome}" };
  const indiretto = { nome: "{nome}", dettaglio: "{dettaglio}" };
  return {
    condividi: t("condividi"),
    condividiArgomento: t("condividiArgomento"),
    titolo: t("titolo", titolo),
    titoloArgomento: t("titoloArgomento", titolo),
    spiegazioneArgomento: t("spiegazioneArgomento"),
    spiegazioneRaccolta: t("spiegazioneRaccolta"),
    caricamento: t("caricamento"),
    erroreCaricamento: t("erroreCaricamento"),
    aggiungiColleghi: t("aggiungiColleghi"),
    cercaCollega: t("cercaCollega"),
    nessunCollega: t("nessunCollega"),
    personeConAccesso: t("personeConAccesso"),
    proprietario: t("proprietario"),
    senzaProprietario: t("senzaProprietario"),
    nessunaPersona: t("nessunaPersona"),
    ruoloDi: t("ruoloDi", nome),
    rimuoviPersona: t("rimuoviPersona", nome),
    accessoGenerale: t("accessoGenerale"),
    soloPersone: t("soloPersone"),
    tuttaLaScuola: t("tuttaLaScuola"),
    ruoloScuola: t("ruoloScuola"),
    spiegazioneSolo: t("spiegazioneSolo"),
    spiegazioneScuola: t("spiegazioneScuola"),
    visualizzatore: t("visualizzatore"),
    commentatore: t("commentatore"),
    editor: t("editor"),
    altriAccessi: t("altriAccessi"),
    indirettoRaccolta: t("indirettoRaccolta", indiretto),
    indirettoArgomento: t("indirettoArgomento", indiretto),
    indirettiSpiegazione: t("indirettiSpiegazione"),
    nuovoProprietario: t("nuovoProprietario"),
    nonCambiare: t("nonCambiare"),
    notaTrasferimento: t("notaTrasferimento"),
    notaTrasferimentoRaccolta: t("notaTrasferimentoRaccolta"),
    annulla: t("annulla"),
    salva: t("salva"),
    salvataggio: t("salvataggio"),
    erroreNonTrovato: t("erroreNonTrovato"),
    erroreDestinatario: t("erroreDestinatario"),
    erroreGenerico: t("erroreGenerico"),
  };
}
