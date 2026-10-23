// Il tempo di una verifica si conta sull'orologio del server, mai su quello
// del PC dello studente (che può essere avanti o indietro di minuti): ogni
// risposta del server porta la sua ora, da cui si ricava lo scarto.

/** Di quanto l'ora del server è avanti (positivo) o indietro rispetto a
 * quella del PC, in millisecondi. */
export function scarto(oraServerIso: string, oraLocale: number): number {
  return Date.parse(oraServerIso) - oraLocale;
}

/** Il tempo che resta prima della scadenza, letto sull'ora del server
 * stimata (ora del PC + scarto). Mai negativo. */
export function millisecondiResidui(scadenzaIso: string, scartoMs: number, oraLocale: number): number {
  return Math.max(0, Date.parse(scadenzaIso) - (oraLocale + scartoMs));
}

const due = (n: number) => String(n).padStart(2, "0");

/** «mm:ss», oppure «h:mm:ss» da un'ora in su. I secondi si arrotondano per
 * eccesso: «00:00» compare solo quando il tempo è davvero finito. */
export function formattaResiduo(ms: number): string {
  const secondi = Math.max(0, Math.ceil(ms / 1000));
  const ore = Math.floor(secondi / 3600);
  const minuti = Math.floor((secondi % 3600) / 60);
  const s = secondi % 60;
  return ore > 0 ? `${ore}:${due(minuti)}:${due(s)}` : `${due(minuti)}:${due(s)}`;
}
