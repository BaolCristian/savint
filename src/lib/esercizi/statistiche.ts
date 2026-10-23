import { prisma } from "@/lib/db/client";
import { haTitoloSulCompito } from "./compiti";
import { verificaInsegnaClasse } from "./classi";
import { estrazioniDegliStudenti, type BacinoCongelato } from "./versioni-compito";

/** Statistiche per il docente: quali esercizi di un compito mettono in
 * difficoltà la classe, e come va la classe argomento per argomento.
 *
 * Nessuna tabella nuova: tutto si ricava dai `Tentativo` già scritti,
 * leggendoli con le STESSE regole di `consegneDelCompito` (compiti.ts) —
 * queste pagine sono un'altra vista delle stesse consegne, e se contassero
 * diversamente il docente vedrebbe due verità sullo stesso compito:
 *
 * - contano solo gli studenti iscritti ADESSO alla classe (chi è uscito
 *   sparisce, i suoi tentativi restano nel database ma non pesano);
 * - un tentativo conta per un compito solo se porta il suo `compitoId` E
 *   riguarda una versione che l'assegnazione ha davvero pescato PER QUELLO
 *   STUDENTE (`drawnVersionIds` nel modo CLASSE, la sua `EstrazioneStudente`
 *   nel modo STUDENTE, via `estrazioniDegliStudenti`): senza l'intersezione, righe con un `compitoId` vero
 *   su un esercizio mai assegnato tornerebbero a contare — il difetto del
 *   "5/3" descritto in `consegneDelCompito`;
 * - uno studente vale UNA volta per esercizio: rifare un esercizio già
 *   consegnato apre un tentativo nuovo (`avviaORiprendi` non riprende mai un
 *   COMPLETED), e conta il migliore fra i completati, con `score` e
 *   `maxScore` presi dallo stesso tentativo;
 * - un compito ritirato è inesistente, e così una verifica (le sue prove
 *   hanno pagine proprie: non entrano nelle statistiche dei compiti).
 *
 * Le percentuali sono intere (arrotondate): servono a confrontare esercizi e
 * argomenti a colpo d'occhio, non a dare un voto. */

/** L'esito di uno studente su un esercizio di un compito. */
type EsitoStudente = { completato: boolean; percentuale: number | null };

/** Quanto è andata una coppia (compito, esercizio pescato) fra gli iscritti. */
type EsitoCoppia = { completati: number; iniziati: number; percentuali: number[] };

const chiave = (compitoId: string, versioneId: string) => `${compitoId}|${versioneId}`;

/** Senza iscritti nessuna coppia ha un esito: la riga c'è lo stesso, a zero. */
const nessunEsito = (): EsitoCoppia => ({ completati: 0, iniziati: 0, percentuali: [] });

const media = (valori: number[]) =>
  valori.length === 0 ? null : Math.round(valori.reduce((a, b) => a + b, 0) / valori.length);

/** Le versioni pescate di un compito, studente per studente (solo gli
 * iscritti attuali, che sono le chiavi). */
type VersioniDelCompito = { id: string; perStudente: Map<string, string[]> };

/** Le versioni di un compito estratte ad almeno uno studente, ognuna una
 * volta, e a quanti studenti ciascuna. L'ordine: nel modo CLASSE quello di
 * `drawnVersionIds`; nel modo STUDENTE quello dei blocchi congelati
 * (`bacini`), così le righe seguono il compito come il docente l'ha
 * costruito e non l'ordine casuale di uno studente. */
function versioniEstratte(
  compito: { modo: string; bacini: unknown; drawnVersionIds: string[] },
  perStudente: Map<string, string[]>,
): { versioneId: string; assegnatoA: number }[] {
  const quanti = new Map<string, number>();
  for (const v of perStudente.values()) for (const id of v) quanti.set(id, (quanti.get(id) ?? 0) + 1);
  if (compito.modo !== "STUDENTE") {
    return compito.drawnVersionIds.map((versioneId) => ({ versioneId, assegnatoA: perStudente.size }));
  }
  const bacini = Array.isArray(compito.bacini) ? (compito.bacini as BacinoCongelato[]) : [];
  const ordine = new Set([...bacini.flatMap((b) => b.versionIds), ...quanti.keys()]);
  return [...ordine].filter((v) => quanti.has(v)).map((versioneId) => ({ versioneId, assegnatoA: quanti.get(versioneId)! }));
}

/** Per ogni coppia (compito, versione pescata) l'esito fra gli iscritti
 * (le chiavi di `perStudente`). Una sola query sui tentativi per tutti i
 * compiti (la pagina per argomento ne legge molti), poi l'intersezione con
 * le versioni di QUELLO studente in QUEL compito: il filtro
 * `esercizioVersioneId in (unione)` della query restringe soltanto, non
 * basta da solo — una versione pescata da un ALTRO compito della stessa
 * classe, o a un ALTRO studente dello stesso compito, passerebbe. */
async function esitiDeiCompiti(compiti: VersioniDelCompito[]): Promise<Map<string, EsitoCoppia>> {
  const esiti = new Map<string, EsitoCoppia>();
  const pescate = new Map<string, Set<string>>();
  for (const c of compiti) {
    for (const [studentId, versioni] of c.perStudente) {
      pescate.set(chiave(c.id, studentId), new Set(versioni));
      for (const v of versioni) {
        if (!esiti.has(chiave(c.id, v))) esiti.set(chiave(c.id, v), { completati: 0, iniziati: 0, percentuali: [] });
      }
    }
  }
  const studentIds = [...new Set(compiti.flatMap((c) => [...c.perStudente.keys()]))];
  if (compiti.length === 0 || studentIds.length === 0) return esiti;

  const tentativi = await prisma.tentativo.findMany({
    where: {
      compitoId: { in: compiti.map((c) => c.id) },
      studentId: { in: studentIds },
      esercizioVersioneId: { in: [...new Set(compiti.flatMap((c) => [...c.perStudente.values()].flat()))] },
    },
    select: { compitoId: true, studentId: true, esercizioVersioneId: true, status: true, score: true, maxScore: true },
  });

  // compito|versione → studente → esito: un rappresentante per studente.
  const perStudente = new Map<string, Map<string, EsitoStudente & { score: number }>>();
  for (const t of tentativi) {
    if (!t.compitoId || !pescate.get(chiave(t.compitoId, t.studentId))?.has(t.esercizioVersioneId)) continue;
    const k = chiave(t.compitoId, t.esercizioVersioneId);
    let studenti = perStudente.get(k);
    if (!studenti) perStudente.set(k, (studenti = new Map()));
    const attuale = studenti.get(t.studentId);
    if (t.status !== "COMPLETED") {
      // Iniziato (in corso o abbandonato): basta a dire "c'ha lavorato", non
      // sostituisce mai un completamento già trovato.
      if (!attuale) studenti.set(t.studentId, { completato: false, percentuale: null, score: -Infinity });
      continue;
    }
    // Il migliore per `score`, come `consegneDelCompito`; la percentuale
    // viene dallo stesso tentativo. Un massimo zero non dice nulla sulla
    // riuscita: il completamento conta, la media no.
    if (!attuale || !attuale.completato || t.score > attuale.score) {
      studenti.set(t.studentId, {
        completato: true,
        percentuale: t.maxScore > 0 ? (t.score / t.maxScore) * 100 : null,
        score: t.score,
      });
    }
  }

  for (const [k, studenti] of perStudente) {
    const esito = esiti.get(k)!;
    for (const s of studenti.values()) {
      if (!s.completato) {
        esito.iniziati++;
        continue;
      }
      esito.completati++;
      if (s.percentuale != null) esito.percentuali.push(s.percentuale);
    }
  }
  return esiti;
}

/** Le versioni pescate che esistono ancora, con l'esercizio: stesso criterio
 * del totale in `consegneDelCompito` (una versione sparita non si conta). */
async function versioniPescate(ids: string[]) {
  const versioni = await prisma.esercizioVersione.findMany({
    where: { id: { in: ids } },
    select: { id: true, esercizio: { select: { id: true, title: true, topic: true } } },
  });
  return new Map(versioni.map((v) => [v.id, v.esercizio]));
}

async function iscrittiAttuali(classeId: string): Promise<string[]> {
  const righe = await prisma.classeStudente.findMany({ where: { classeId }, select: { studentId: true } });
  return righe.map((r) => r.studentId);
}

export type StatisticaEsercizio = {
  esercizioId: string;
  titolo: string;
  argomento: string;
  /** A quanti iscritti è stato assegnato: tutti nel modo CLASSE, quelli
   * che l'hanno nella loro estrazione nel modo STUDENTE. È il "su quanti"
   * di `completati`. */
  assegnatoA: number;
  /** Iscritti che l'hanno completato almeno una volta. */
  completati: number;
  /** Iscritti che l'hanno aperto ma non ancora completato. */
  iniziati: number;
  /** Media, fra chi l'ha completato, del migliore tentativo in % del
   * massimo; `null` se nessuno l'ha completato (non uno 0 che sembri un
   * voto). */
  mediaPercentuale: number | null;
};

/** Esercizio per esercizio, come è andato un compito fra gli iscritti
 * attuali, nell'ordine in cui l'assegnazione li ha pescati. Chi non compare
 * né fra i completati né fra gli iniziati non l'ha aperto: il conto è
 * `assegnatoA - completati - iniziati`. Nel modo STUDENTE una riga per ogni
 * versione estratta ad almeno uno studente (`versioniEstratte`).
 *
 * Autorizzazione: `haTitoloSulCompito`, la stessa regola di
 * `consegneDelCompito` (insegna la classe OPPURE l'ha assegnato). Un solo
 * motivo per "non esiste", "è ritirato" e "non è tuo", come
 * `EsitoGestioneCompito`: le pagine lo traducono in 404. */
export async function statisticheDelCompito(
  compitoId: string,
  teacherId: string,
): Promise<
  | { ok: true; iscritti: number; righe: StatisticaEsercizio[] }
  | { ok: false; motivo: "compito_non_trovato" }
> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  if (!compito || compito.ritiratoAt != null || compito.tipo === "VERIFICA") return { ok: false, motivo: "compito_non_trovato" };
  if (!(await haTitoloSulCompito(compito, teacherId))) return { ok: false, motivo: "compito_non_trovato" };

  const studenti = await iscrittiAttuali(compito.classeId);
  const perStudente = (await estrazioniDegliStudenti([compito], studenti)).get(compito.id)!;
  const estratte = versioniEstratte(compito, perStudente);
  const [esercizi, esiti] = await Promise.all([
    versioniPescate(estratte.map((x) => x.versioneId)),
    esitiDeiCompiti([{ id: compito.id, perStudente }]),
  ]);

  const righe: StatisticaEsercizio[] = [];
  for (const { versioneId, assegnatoA } of estratte) {
    const esercizio = esercizi.get(versioneId);
    if (!esercizio) continue;
    const esito = esiti.get(chiave(compito.id, versioneId)) ?? nessunEsito();
    righe.push({
      esercizioId: esercizio.id,
      titolo: esercizio.title,
      argomento: esercizio.topic,
      assegnatoA,
      completati: esito.completati,
      iniziati: esito.iniziati,
      mediaPercentuale: media(esito.percentuali),
    });
  }
  return { ok: true, iscritti: studenti.length, righe };
}

export type AndamentoArgomento = {
  argomento: string;
  /** Esercizi assegnati con questo argomento, sommati sui compiti: lo
   * stesso esercizio in due compiti conta due volte, perché sono due
   * consegne distinte che la classe deve fare. */
  esercizi: number;
  /** Coppie studente×esercizio completate, su quelle attese (le coppie
   * davvero assegnate: iscritti attuali × esercizi nel modo CLASSE, la
   * somma degli `assegnatoA` nel modo STUDENTE). */
  completate: number;
  attese: number;
  /** `completate / attese` in %; `null` senza iscritti. */
  percentualeCompletamento: number | null;
  /** Media dei migliori tentativi completati, in % del massimo. */
  mediaPercentuale: number | null;
};

/** L'andamento di una classe per argomento, su TUTTI i suoi compiti non
 * ritirati, dall'argomento più debole: prima il completamento più basso,
 * a parità la media più bassa (nessuna media conta come la più bassa: lì
 * nessuno ha ancora finito niente), infine l'ordine alfabetico, per una
 * pagina stabile.
 *
 * Autorizzazione: `verificaInsegnaClasse` (classi.ts), cioè solo chi
 * insegna OGGI la classe — è una vista sulla classe, non su un compito,
 * quindi aver assegnato uno dei suoi compiti non basta (quello dà accesso
 * al dettaglio di quel compito, non a tutto il resto). "Non esiste" e "non
 * la insegni" diventano un solo motivo, per la stessa ragione del 404 delle
 * pagine. */
export async function andamentoDellaClasse(
  classeId: string,
  teacherId: string,
): Promise<
  | { ok: true; classe: { id: string; nome: string }; iscritti: number; compiti: number; righe: AndamentoArgomento[] }
  | { ok: false; motivo: "non_trovata" }
> {
  const autorizzato = await verificaInsegnaClasse(classeId, teacherId);
  if (!autorizzato.ok) return { ok: false, motivo: "non_trovata" };
  const classe = await prisma.classe.findUnique({ where: { id: classeId }, select: { id: true, name: true } });
  if (!classe) return { ok: false, motivo: "non_trovata" };

  const compiti = await prisma.compito.findMany({
    // Né i ritirati né quelli non ancora aperti: un compito che si apre fra
    // una settimana non l'ha visto nessuno, e contarlo abbasserebbe il
    // completamento di un argomento che la classe sta facendo bene. Le
    // verifiche non sono allenamento: restano fuori.
    where: { classeId, ritiratoAt: null, tipo: "COMPITO", OR: [{ opensAt: null }, { opensAt: { lte: new Date() } }] },
    select: { id: true, modo: true, drawSeed: true, bacini: true, drawnVersionIds: true },
  });
  const studenti = await iscrittiAttuali(classeId);
  // Le estrazioni di tutti i compiti per tutti gli iscritti, a lotti: una
  // query per quelle memorizzate, il calcolo solo per chi manca.
  const estrazioni = await estrazioniDegliStudenti(compiti, studenti);
  const conVersioni = compiti.map((c) => ({ id: c.id, perStudente: estrazioni.get(c.id)! }));
  const estratte = new Map(compiti.map((c) => [c.id, versioniEstratte(c, estrazioni.get(c.id)!)]));
  const [esercizi, esiti] = await Promise.all([
    versioniPescate([...new Set([...estratte.values()].flat().map((x) => x.versioneId))]),
    esitiDeiCompiti(conVersioni),
  ]);

  // `esercizi` conta le versioni assegnate ad almeno uno studente (nel modo
  // CLASSE: tutte quelle pescate); `attese` le coppie studente×esercizio
  // davvero assegnate, che nel modo CLASSE sono iscritti × esercizi.
  const perArgomento = new Map<string, { esercizi: number; attese: number; completate: number; percentuali: number[] }>();
  for (const c of compiti) {
    for (const { versioneId, assegnatoA } of estratte.get(c.id)!) {
      const esercizio = esercizi.get(versioneId);
      if (!esercizio) continue;
      const esito = esiti.get(chiave(c.id, versioneId)) ?? nessunEsito();
      let gruppo = perArgomento.get(esercizio.topic);
      if (!gruppo) perArgomento.set(esercizio.topic, (gruppo = { esercizi: 0, attese: 0, completate: 0, percentuali: [] }));
      gruppo.esercizi++;
      gruppo.attese += assegnatoA;
      gruppo.completate += esito.completati;
      gruppo.percentuali.push(...esito.percentuali);
    }
  }

  const righe: AndamentoArgomento[] = [...perArgomento].map(([argomento, g]) => {
    const attese = g.attese;
    return {
      argomento,
      esercizi: g.esercizi,
      completate: g.completate,
      attese,
      percentualeCompletamento: attese > 0 ? Math.round((g.completate / attese) * 100) : null,
      mediaPercentuale: media(g.percentuali),
    };
  });

  // Un valore assente è il più debole: -1 lo mette prima di ogni 0%.
  const peso = (n: number | null) => n ?? -1;
  righe.sort((a, b) =>
    peso(a.percentualeCompletamento) - peso(b.percentualeCompletamento)
    || peso(a.mediaPercentuale) - peso(b.mediaPercentuale)
    || a.argomento.localeCompare(b.argomento, "it"),
  );

  return { ok: true, classe: { id: classe.id, nome: classe.name }, iscritti: studenti.length, compiti: compiti.length, righe };
}
