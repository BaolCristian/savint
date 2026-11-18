/** I quattro ambiti di contenuto delle prove INVALSI di matematica. Sono
 * usati come ARGOMENTO degli esercizi INVALSI: gli argomenti della
 * piattaforma nascono dagli esercizi stessi (vedi `argomentiDisponibili`,
 * batterie.ts), quindi un compito o una batteria può pescare a caso da un
 * ambito. L'editor li propone come suggerimenti nel campo argomento, così
 * un refuso («Spazio e Figure») non crea un quinto ambito. */
export const AMBITI_INVALSI = ["Numeri", "Spazio e figure", "Relazioni e funzioni", "Dati e previsioni"] as const;

export type AmbitoInvalsi = (typeof AMBITI_INVALSI)[number];
