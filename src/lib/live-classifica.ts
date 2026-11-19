/** Ogni quante domande la lavagna mostra la classifica generale. */
export const OGNI_QUANTE_DOMANDE = 3;

/**
 * Se dopo la domanda `numero` (contata da 1) di una partita di `totale`
 * domande la lavagna mostra la classifica generale: ogni tre domande, ma
 * mai nelle ultime tre, perché il podio finale resti una sorpresa.
 */
export function classificaGeneraleDopo(numero: number, totale: number): boolean {
  return numero % OGNI_QUANTE_DOMANDE === 0 && numero <= totale - OGNI_QUANTE_DOMANDE;
}
