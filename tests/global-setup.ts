import { PrismaClient } from "@prisma/client";

/** La suite parla col database di sviluppo vero, e non con uno suo: una
 * sessantina di file leggono e scrivono tabelle reali, pulendo per prefisso.
 * Finché gira una sola suite alla volta funziona; **due insieme si
 * distruggono i dati a vicenda** — misurato il 2026-09-12 su questa
 * macchina: due `npm run test:run` contemporanei danno 152 e 146 test
 * falliti, sparsi su 150 file, mentre una sola suite passa sei volte su sei.
 *
 * I fallimenti non somigliano alla loro causa: cadono file che non hanno
 * niente in comune, compresi test di componenti che il database non lo
 * toccano nemmeno, e chi guarda cerca il difetto nel codice che ha appena
 * scritto. Questo lucchetto trasforma quelle centocinquanta righe rosse in
 * una frase sola.
 *
 * Il lucchetto è consultivo (`pg_try_advisory_lock`): Postgres lo lega alla
 * connessione, quindi se una suite muore di colpo si libera da sé, senza
 * lasciare niente da ripulire a mano. */
const CHIAVE = 728411001;

/** Una connessione sola e dedicata: un lucchetto consultivo vive nella
 * connessione che l'ha preso, e il pool di Prisma potrebbe servire le query
 * successive da un'altra, perdendolo. */
function clientDedicato(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) return new PrismaClient();
  const separatore = url.includes("?") ? "&" : "?";
  return new PrismaClient({ datasources: { db: { url: `${url}${separatore}connection_limit=1` } } });
}

export default async function setup() {
  const prisma = clientDedicato();

  let preso: boolean;
  try {
    const righe = await prisma.$queryRaw<{ preso: boolean }[]>`SELECT pg_try_advisory_lock(${CHIAVE}::bigint) AS preso`;
    preso = righe[0]?.preso === true;
  } catch (e) {
    // Nessun database raggiungibile: non è il caso che questo lucchetto
    // esiste per prevenire, e non è questo il posto dove dirlo — saranno i
    // test che ne hanno bisogno a fallire, nominando la connessione. Una
    // suite che non tocca il database (la superficie dell'editor, per dire)
    // deve poter girare comunque.
    await prisma.$disconnect();
    console.warn(`[suite] database non raggiungibile, il lucchetto non è stato preso: ${String(e)}`);
    return;
  }

  if (!preso) {
    await prisma.$disconnect();
    throw new Error(
      "Un'altra esecuzione della suite sta già usando il database di sviluppo.\n" +
        "Due suite insieme si cancellano i dati a vicenda: la seconda non parte.\n" +
        "Aspetta che l'altra finisca — anche in un altro worktree o in un'altra sessione — e rilancia.",
    );
  }

  return async () => {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${CHIAVE}::bigint)`;
    await prisma.$disconnect();
  };
}
