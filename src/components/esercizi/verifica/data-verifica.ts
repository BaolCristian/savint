// Il «quando» di una verifica (data e ora) come lo legge lo studente, uguale
// sul server (home) e nel browser (introduzione): sempre sull'ora italiana,
// non su quella della macchina — un server in UTC sposterebbe l'ora, e la
// pagina renderizzata sul server non coinciderebbe con quella del browser.
export function formattaQuando(quando: Date, locale: "it" | "en"): string {
  return quando.toLocaleString(locale === "en" ? "en-GB" : "it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Rome",
  });
}

/** Solo l'ora (con i secondi), sempre sull'ora italiana: l'ultimo
 * salvataggio di uno studente nel monitoraggio del docente. */
export function formattaOra(quando: Date, locale: "it" | "en"): string {
  return quando.toLocaleTimeString(locale === "en" ? "en-GB" : "it-IT", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Rome",
  });
}

/** Un numero di punti come si legge nella lingua di chi guarda (1,25 in
 * italiano), al massimo due decimali: risultati del docente e dello
 * studente. */
export function formattaPunti(n: number, locale: "it" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "it-IT", { maximumFractionDigits: 2 }).format(n);
}
