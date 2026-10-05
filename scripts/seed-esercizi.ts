import path from "path";
import { seedEsercizi } from "../src/lib/esercizi/seed";

// Per impostazione predefinita aggiunge SOLO gli esercizi che mancano e non
// tocca quelli già presenti: su un'installazione in uso un docente può averli
// corretti, e le versioni non dicono chi le ha scritte (vedi `OpzioniSeed`).
// `--aggiorna` riporta ogni esercizio al contenuto del suo file: da usare in
// sviluppo, o quando si è sicuri che nessuno li abbia modificati.
//
//   npx tsx scripts/seed-esercizi.ts              # solo i nuovi
//   npx tsx scripts/seed-esercizi.ts --aggiorna   # anche gli aggiornamenti
const aggiorna = process.argv.includes("--aggiorna");
const dir = path.resolve(process.cwd(), "content/esercizi");
seedEsercizi(dir, { soloNuovi: !aggiorna })
  .then((r) => {
    console.log(
      `esercizi: ${r.creati} creati, ${r.aggiornati} aggiornati, ${r.invariati} invariati` +
        (aggiorna ? "" : `, ${r.lasciati} già presenti lasciati com'erano (--aggiorna per aggiornarli)`),
    );
    process.exit(0);
  })
  .catch((e) => { console.error(e.message); process.exit(1); });
