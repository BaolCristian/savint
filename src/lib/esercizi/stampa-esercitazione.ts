/**
 * La stampa di un'esercitazione: tutti gli esercizi di un argomento o di una
 * raccolta su un foglio da consegnare in classe, con le soluzioni a parte per
 * il docente. Riusa il foglio della verifica stampabile (un foglio solo, senza
 * versioni): il seme è fisso, quindi ristampare dà gli stessi numeri.
 */
import { prisma } from "@/lib/db/client";
import { ruoliEsercizi, type Utente } from "./accesso";
import { contenutoContenitore } from "./contenitori";
import type { EsercizioStampa, FoglioStampa } from "./stampa";

/** Che cosa si stampa: gli esercizi di un argomento (eventualmente di una
 * sola classe) oppure quelli di una raccolta. */
export type FonteEsercitazione = { tipo: "argomento"; argomento: string; anno: number | null } | { tipo: "raccolta"; id: string };

/** Le soluzioni: niente, in fondo ai fogli, oppure da sole (il PDF del docente). */
export type SceltaSoluzioni = "no" | "fondo" | "sole";

export type DatiEsercitazione = {
  titolo: string;
  /** Dove tornare dalla pagina di stampa. */
  indietro: string;
  esercizi: EsercizioStampa[];
  foglio: FoglioStampa;
};

/** `?soluzioni=`: "fondo" se manca o non vale (il docente le ha comunque, in un'ultima pagina). */
export function leggiSceltaSoluzioni(valore: string | undefined): SceltaSoluzioni {
  return valore === "no" || valore === "sole" ? valore : "fondo";
}

/** La fonte dai parametri della pagina, oppure null se non ce n'è una valida. */
export function leggiFonte(query: { argomento?: string; anno?: string; raccolta?: string }): FonteEsercitazione | null {
  if (query.raccolta) return { tipo: "raccolta", id: query.raccolta };
  const argomento = query.argomento?.trim();
  if (!argomento) return null;
  const anno = Number(query.anno);
  return { tipo: "argomento", argomento, anno: Number.isInteger(anno) && anno > 0 ? anno : null };
}

/** "INVALSI 2015 · D2" prima di "INVALSI 2015 · D10": i numeri nei titoli contano come numeri. */
const perTitolo = (a: { title: string }, b: { title: string }) =>
  a.title.localeCompare(b.title, "it", { numeric: true, sensitivity: "base" });

/** "analisi logica" → "Analisi logica". */
const maiuscola = (s: string) => s.charAt(0).toLocaleUpperCase("it") + s.slice(1);

/** L'ultima versione di ciascun esercizio, nell'ordine dato; chi non ne ha
 * ancora una (mai salvato) non si stampa. */
async function ultimeVersioni(esercizi: { id: string; title: string }[]): Promise<EsercizioStampa[]> {
  if (esercizi.length === 0) return [];
  const versioni = await prisma.esercizioVersione.findMany({
    where: { esercizioId: { in: esercizi.map((e) => e.id) } },
    orderBy: { version: "desc" },
    select: { esercizioId: true, content: true },
  });
  const ultima = new Map<string, unknown>();
  for (const v of versioni) if (!ultima.has(v.esercizioId)) ultima.set(v.esercizioId, v.content);
  return esercizi.flatMap((e) => (ultima.has(e.id) ? [{ titolo: e.title, content: ultima.get(e.id) }] : []));
}

/** Gli esercizi da stampare, solo fra quelli che il docente vede; null se la
 * raccolta non c'è o non la vede (come la sua pagina: un 404). Un argomento
 * si confronta come lo raggruppa l'elenco degli esercizi: senza badare a
 * maiuscole e spazi ai lati. */
export async function datiStampaEsercitazione(fonte: FonteEsercitazione, chi: Utente): Promise<DatiEsercitazione | null> {
  const visibili = await ruoliEsercizi(chi);

  if (fonte.tipo === "raccolta") {
    const raccolta = await contenutoContenitore(fonte.id, chi, visibili);
    if (!raccolta) return null;
    return {
      titolo: raccolta.name,
      indietro: `/dashboard/esercizi/contenitori/${raccolta.id}`,
      esercizi: await ultimeVersioni([...raccolta.esercizi].sort(perTitolo)),
      foglio: { etichetta: "", nominativo: false, seme: `esercitazione:raccolta:${raccolta.id}` },
    };
  }

  const chiave = fonte.argomento.toLocaleLowerCase();
  const tutti = visibili.size
    ? await prisma.esercizio.findMany({
        where: { id: { in: [...visibili.keys()] }, ...(fonte.anno ? { yearLevel: fonte.anno } : {}) },
        select: { id: true, title: true, topic: true },
      })
    : [];
  const scelti = tutti.filter((e) => e.topic.trim().toLocaleLowerCase() === chiave).sort(perTitolo);
  return {
    titolo: maiuscola(fonte.argomento),
    indietro: "/dashboard/esercizi/redazione",
    esercizi: await ultimeVersioni(scelti),
    foglio: { etichetta: "", nominativo: false, seme: `esercitazione:argomento:${chiave}:${fonte.anno ?? ""}` },
  };
}
