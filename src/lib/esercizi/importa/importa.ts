/** Controllo e import in blocco degli esercizi generati con l'IA.
 *
 * Solo server: usa prisma e redazione.ts. Il server rifà sempre tutto da
 * capo (normalizzazione, schema, verifica, doppioni) e non si fida di
 * quello che l'anteprima nel browser ha già controllato. */
import { prisma } from "@/lib/db/client";
import { esercizioEditorSchema, type EsercizioEditor } from "../editor/modello";
import { versoNumbas } from "../editor/verso-numbas";
import { creaEsercizio, verificaEsercizio } from "../redazione";
import { hashContenuto } from "../format/schema";
import { normalizza } from "./estrai";
import type { EsitoControllo, EsitoImport, Problema } from "./tipi";

/** Il titolo da mostrare per un elemento che lo schema rifiuta: quello
 * scritto nel JSON se è una stringa, altrimenti nessuno. */
function titoloGrezzo(elemento: unknown): string | null {
  if (typeof elemento !== "object" || elemento === null) return null;
  const meta = (elemento as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return null;
  const titolo = (meta as { titolo?: unknown }).titolo;
  return typeof titolo === "string" ? titolo : null;
}

/** Il testo di una risposta JME senza le parti fra graffe (anche
 * annidate): lì dentro le variabili sono già sostituite col loro valore. */
function fuoriDalleGraffe(risposta: string): string {
  let profondita = 0;
  let fuori = "";
  for (const c of risposta) {
    if (c === "{") profondita++;
    else if (c === "}") profondita = Math.max(0, profondita - 1);
    // Uno spazio al posto di ciò che si toglie: `{a}b` non deve diventare
    // la parola `b` attaccata a ciò che precede.
    fuori += profondita === 0 && c !== "}" ? c : " ";
  }
  return fuori;
}

/** Rete di sicurezza per le parti "espressione": una variabile dichiarata
 * scritta nella risposta SENZA graffe (`a*x + b` invece di `{a}*x + {b}`).
 *
 * Provato col motore vero (Task 2 del piano): `verificaEsercizio` passa lo
 * stesso, ma Numbas tratta il nome nudo come una variabile libera
 * dell'espressione, non come la variabile casuale — e uno studente che
 * scrive l'espressione giusta prende 0. È esattamente l'errore che un'IA
 * fa più spesso, quindi lo si rifiuta qui, prima della verifica, con un
 * messaggio che dice come correggerlo.
 *
 * I nomi JME non distinguono maiuscole e minuscole, quindi `B` è la
 * variabile `b`. Si confrontano parole intere: `ab` non è `a`, e un nome
 * di funzione come `sqrt` non è una variabile (a meno che non sia stato
 * dichiarato come tale). */
export function variabiliSenzaGraffe(input: EsercizioEditor): Problema[] {
  const dichiarate = new Map(input.variabili.map((v) => [v.nome.toLowerCase(), v.nome]));
  if (dichiarate.size === 0) return [];
  const problemi: Problema[] = [];
  input.parti.forEach((parte, i) => {
    if (parte.tipo !== "espressione") return;
    const trovate = new Set<string>();
    for (const [parola] of fuoriDalleGraffe(parte.risposta).matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) {
      const nome = dichiarate.get(parola.toLowerCase());
      if (nome === undefined || trovate.has(nome)) continue;
      trovate.add(nome);
      problemi.push({
        percorso: `parti.${i}.risposta`,
        messaggio: `la variabile "${nome}" va scritta fra graffe, come {${nome}}: senza graffe è una lettera libera e la risposta giusta dello studente vale 0`,
      });
    }
  });
  return problemi;
}

type Controllato = { esito: EsitoControllo; input?: EsercizioEditor };

async function controlla(elementi: unknown[]): Promise<Controllato[]> {
  const risultati: Controllato[] = elementi.map((grezzo, indice) => {
    const analisi = esercizioEditorSchema.safeParse(normalizza(grezzo));
    if (!analisi.success) {
      return {
        esito: {
          indice,
          stato: "invalido",
          titolo: titoloGrezzo(grezzo),
          problemi: analisi.error.issues.map((i) => ({ percorso: i.path.join("."), messaggio: i.message })),
        },
      };
    }
    const input = analisi.data;
    const titolo = input.meta.titolo;

    const senzaGraffe = variabiliSenzaGraffe(input);
    if (senzaGraffe.length > 0) {
      return { esito: { indice, stato: "invalido", titolo, problemi: senzaGraffe } };
    }

    const verifica = verificaEsercizio(input);
    if (!verifica.ok) {
      const { seme, fase, messaggio } = verifica;
      return { esito: { indice, stato: "verifica_fallita", titolo, dettaglio: { seme, fase, messaggio } } };
    }
    return { esito: { indice, stato: "ok", titolo, content: versoNumbas(input) }, input };
  });

  // Doppioni: una sola query per tutti gli hash, contro OGNI versione
  // salvata (anche quelle vecchie di un esercizio poi corretto).
  const hashPerIndice = new Map<number, string>();
  for (const { esito } of risultati) {
    if (esito.stato === "ok") hashPerIndice.set(esito.indice, hashContenuto(esito.content));
  }
  if (hashPerIndice.size === 0) return risultati;

  const esistenti = await prisma.esercizioVersione.findMany({
    where: { hash: { in: [...new Set(hashPerIndice.values())] } },
    select: { hash: true, esercizio: { select: { title: true } } },
  });
  const titoloPerHash = new Map(esistenti.map((v) => [v.hash, v.esercizio.title]));

  // Dentro lo stesso import, il primo vince e i successivi sono doppioni.
  return risultati.map((r) => {
    const hash = hashPerIndice.get(r.esito.indice);
    if (hash === undefined || r.esito.stato !== "ok") return r;
    const titoloEsistente = titoloPerHash.get(hash);
    if (titoloEsistente !== undefined) {
      return { esito: { indice: r.esito.indice, stato: "gia_presente", titolo: r.esito.titolo, titoloEsistente } };
    }
    titoloPerHash.set(hash, r.esito.titolo);
    return r;
  });
}

/** Controlla ogni elemento senza scrivere nulla: è l'anteprima dell'import.
 * Un elemento rotto non ferma gli altri. */
export async function controllaImport(elementi: unknown[]): Promise<EsitoControllo[]> {
  return (await controlla(elementi)).map((r) => r.esito);
}

/** Importa gli elementi che passano il controllo, uno dopo l'altro, con
 * `authorId` come autore. Gli altri restano nel risultato col loro esito.
 * Se `creaEsercizio` rifiuta (la verifica sui semi è casuale e potrebbe
 * cogliere un seme che il controllo non aveva visto), l'esito diventa
 * `verifica_fallita` col suo dettaglio. */
export async function importaEsercizi(elementi: unknown[], authorId: string): Promise<EsitoImport[]> {
  const controllati = await controlla(elementi);
  const esiti: EsitoImport[] = [];
  for (const { esito, input } of controllati) {
    if (esito.stato !== "ok") {
      esiti.push(esito);
      continue;
    }
    if (input === undefined) throw new Error("esito ok senza input: non dovrebbe succedere");
    const creato = await creaEsercizio(input, authorId);
    if (creato.ok) {
      esiti.push({ indice: esito.indice, stato: "creato", titolo: esito.titolo, esercizioId: creato.esercizioId });
      continue;
    }
    const d = creato.dettaglio as { seme?: number; fase?: string; messaggio?: string } | undefined;
    esiti.push({
      indice: esito.indice,
      stato: "verifica_fallita",
      titolo: esito.titolo,
      dettaglio: { seme: d?.seme ?? 0, fase: d?.fase ?? creato.motivo, messaggio: d?.messaggio ?? String(creato.dettaglio) },
    });
  }
  return esiti;
}
