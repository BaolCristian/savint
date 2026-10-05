import { withBasePath } from "@/lib/base-path";

/** Il nome di un'immagine di esercizio: SOLO quelli che genera la rotta di
 * caricamento (un UUID più l'estensione di un tipo ammesso). È l'unica forma
 * che il testo di un esercizio può nominare, e l'unica che il player
 * trasforma in un `<img>`: niente indirizzi esterni, niente percorsi. */
export const NOME_FILE_IMMAGINE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|gif|webp)$/;

/** La sottocartella di `public/uploads` in cui vivono le immagini degli
 * esercizi (in Docker è nel volume persistente `savint-uploads`). */
export const CARTELLA_IMMAGINI = "esercizi";

/** L'indirizzo da cui il browser carica un'immagine. Il file salva solo il
 * nome: l'indirizzo si costruisce qui, col basePath dell'installazione
 * (savint.it, /demo, /savint), così lo stesso esercizio funziona ovunque. */
export function urlImmagine(file: string): string {
  return withBasePath(`/api/uploads/${CARTELLA_IMMAGINI}/${file}`);
}
