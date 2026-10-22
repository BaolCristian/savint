/** Dove porta il login quando la pagina non ne chiede un'altra. */
export const DESTINAZIONE_PREDEFINITA = "/dashboard";

/**
 * La pagina d'arrivo dopo il login, letta da `?callbackUrl=`. Accetta solo un
 * percorso interno all'app ("/studente"): un indirizzo esterno o "//altro.it"
 * farebbe del login un trampolino verso un sito qualsiasi.
 */
export function destinazioneLogin(valore: string | null | undefined): string {
  if (!valore || !/^\/(?![/\\])/.test(valore) || valore.includes("\\")) return DESTINAZIONE_PREDEFINITA;
  return valore;
}

/** Il login chiesto da una pagina dello studente si presenta allo studente. */
export function loginDaStudente(destinazione: string): boolean {
  return destinazione === "/studente" || destinazione.startsWith("/studente/");
}
