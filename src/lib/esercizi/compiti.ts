import { prisma } from "@/lib/db/client";
import { rifiutoRegole, scriviBatteria } from "./batterie";
import {
  baciniDeiBlocchi,
  regolaDaBlocco,
  riepilogoEstrazione,
  ultimeVersioniIds,
  versioniConContenuto,
  type Blocco,
  type Riepilogo,
} from "./estrazione";
import {
  estrazioneDaBaciniCongelati,
  estrazioneDelloStudente,
  estrazioniDegliStudenti,
  eserciziPerStudente,
  versioniDiTuttiGliStudenti,
  type BacinoCongelato,
} from "./versioni-compito";
import { comeDocente, type Utente } from "./accesso";

type MotivoDate = "scadenza_prima_apertura" | "scadenza_nel_passato";

/** Le regole sulle date di un compito, condivise da `assegnaCompito` e da
 * `modificaDateCompito`: una sola copia, perché una finestra rifiutata
 * all'assegnazione non deve poter entrare dalla porta della modifica.
 *
 * Una scadenza prima dell'apertura non ha senso (la finestra sarebbe già
 * chiusa quando si apre), e una scadenza già nel passato produce un compito
 * "scaduto all'arrivo" — probabilmente un anno digitato male — senza che
 * nessuno, dominio, rotta o form, se ne accorga.
 *
 * `scadenzaNuova` dice se `dueAt` è una scelta fatta ADESSO: il controllo
 * "nel passato" vale solo per quella. In una modifica, una scadenza già
 * salvata e lasciata com'è può essere passata da tempo (il compito è
 * scaduto, il docente ne sposta solo l'apertura): rifiutarla obbligherebbe
 * a inventare una scadenza nuova per correggere tutt'altro. */
function motivoDateNonValide(
  opensAt: Date | null,
  dueAt: Date | null,
  scadenzaNuova: boolean,
): MotivoDate | null {
  if (opensAt && dueAt && dueAt < opensAt) return "scadenza_prima_apertura";
  if (scadenzaNuova && dueAt && dueAt < new Date()) return "scadenza_nel_passato";
  return null;
}

/** Ciò che la pagina "Nuovo compito" manda per assegnare (Task 3). `seme`
 * è il seme dell'estrazione che il docente ha visto nel riepilogo (zona 3);
 * `versioniViste` (solo modo CLASSE) gli id versione di quell'estrazione,
 * nell'ordine in cui li ha visti. `salvaModello` crea anche un modello con
 * gli stessi blocchi; `modelloId` dice da quale modello esistente si è
 * partiti ("Usa questo modello"). */
export type InputAssegna = {
  classeId: string;
  teacherId: string;
  blocchi: Blocco[];
  modo: "CLASSE" | "STUDENTE";
  seme: string;
  versioniViste?: string[];
  opensAt?: Date;
  dueAt?: Date;
  salvaModello?: { nome: string };
  modelloId?: string;
};

export type MotivoAssegnaCompito =
  | "classe_non_trovata"
  | "non_insegni_questa_classe"
  | "esercizi_insufficienti"
  | "estrazione_cambiata"
  | "date_non_valide"
  | "modello_non_trovato"
  | "blocchi_non_validi";

/** L'esito di `assegnaCompito`. `riepilogo` accompagna `esercizi_insufficienti`
 * ed `estrazione_cambiata`: è ciò che la pagina deve mostrare al posto di
 * quello che aveva (i numeri per blocco, o la nuova estrazione in
 * anteprima). `dettaglio` accompagna solo `date_non_valide` e dice quale
 * delle due regole di `motivoDateNonValide` è stata violata — lo stesso
 * motivo che le rotte di oggi restituiscono come `error`. */
export type EsitoAssegnaCompito =
  | { ok: true; compitoId: string }
  | { ok: false; motivo: MotivoAssegnaCompito; riepilogo?: Riepilogo; dettaglio?: MotivoDate };

/** Il nome della batteria automatica di un compito: ciò che il docente
 * legge come titolo nell'elenco dei compiti, quindi parole sue — le
 * etichette dei blocchi (argomento, nome della raccolta, "Esercizi scelti")
 * con quanti esercizi ciascuno, in ordine: "Equazioni (3) + Percentuali
 * (2)". Le etichette sono quelle del riepilogo, quindi una raccolta che chi
 * assegna non vede resta "Raccolta non disponibile" anche qui. Tagliato a
 * una lunghezza ragionevole: con molti blocchi il titolo diventerebbe un
 * paragrafo. */
const NOME_MAX = 120;
function nomeDelCompito(r: Riepilogo): string {
  const nome = r.blocchi.map((b) => `${b.etichetta} (${b.richiesti})`).join(" + ");
  return nome.length <= NOME_MAX ? nome : `${nome.slice(0, NOME_MAX - 1).trimEnd()}…`;
}

/** Il bacino congelato di un compito "diverse per studente" (Decisioni,
 * punto 4): per ogni blocco, le ULTIME versioni dei suoi candidati e quanti
 * pescarne, e quanti ne restano a ciascun blocco NEL CASO PEGGIORE.
 *
 * - Blocco scelti: i suoi esercizi nell'ordine del docente (`scelti: true`),
 *   tolti quelli già scelti in un blocco scelti precedente — come in
 *   `estraiConDettaglio`. Disponibili = quanti ne restano.
 * - Blocco casuale: TUTTI i suoi candidati, tolti solo gli scelti a mano
 *   (che vincono sempre). I bacini casuali possono SOVRAPPORSI: una raccolta
 *   e un argomento con gli stessi esercizi congelano entrambi tutto.
 *   L'esclusione dei già presi la fa poi ogni estrazione di studente
 *   (`estraiDaBacini` salta ciò che i blocchi precedenti hanno preso).
 *
 * Sufficienza, nel caso peggiore: le estrazioni degli studenti avvengono
 * anche molto dopo, ciascuna col proprio seme, e nessuno studente deve mai
 * restare con meno esercizi. Un blocco casuale k può perdere, per ciascun
 * blocco casuale precedente j, al più `min(count_j, |bacino_j ∩ bacino_k|)`
 * esercizi: j non ne prende più di quanti ne chiede, né più di quanti dei
 * suoi stanno anche nel bacino di k. Quindi gli restano almeno
 * `|bacino_k| − Σ min(count_j, |bacino_j ∩ bacino_k|)` (j precedente,
 * casuale; un bacino disgiunto non toglie niente), qualunque seme. Se questo numero è ≥ `count_k` per ogni blocco,
 * l'estrazione di ogni studente è piena. È più severo della sufficienza di
 * una classe (dove un blocco perde solo ciò che i precedenti hanno DAVVERO
 * preso con quel seme) e la implica: per questo nel modo STUDENTE il
 * riepilogo non ha bisogno dell'estrazione di classe.
 *
 * Gli id delle ultime versioni con una query leggera (`ultimeVersioniIds`,
 * senza contenuto). Un esercizio la cui versione è sparita fra le due
 * query resta fuori, e il conteggio lo vede come mancante. */
async function congelaBacini(
  risolti: Awaited<ReturnType<typeof baciniDeiBlocchi>>,
): Promise<{ bacini: BacinoCongelato[]; disponibili: number[] }> {
  const riservati = new Set(risolti.filter((b) => b.scelti).flatMap((b) => b.candidati));
  const giaScelti = new Set<string>();
  const perBlocco = risolti.map((b) => {
    const unici = [...new Set(b.candidati)];
    if (b.scelti) {
      const propri = unici.filter((id) => !giaScelti.has(id));
      for (const id of propri) giaScelti.add(id);
      return propri;
    }
    // L'ordine dei casuali non conta (il sorteggio li ordina da sé):
    // ordinati solo perché il JSON salvato sia stabile.
    return unici.filter((id) => !riservati.has(id)).sort();
  });
  const versioni = await ultimeVersioniIds([...new Set(perBlocco.flat())]);
  const bacini: BacinoCongelato[] = risolti.map((b, i) => ({
    count: b.richiesti,
    versionIds: perBlocco[i]!.flatMap((id) => {
      const v = versioni.get(id);
      return v ? [v] : [];
    }),
    ...(b.scelti ? { scelti: true as const } : {}),
  }));
  const disponibili = bacini.map((b, k) => {
    if (b.scelti) return b.versionIds.length;
    const mio = new Set(b.versionIds);
    const toltiAlPiu = bacini
      .slice(0, k)
      .filter((j) => !j.scelti)
      .reduce((s, j) => s + Math.min(j.count, j.versionIds.filter((v) => mio.has(v)).length), 0);
    return Math.max(0, b.versionIds.length - toltiAlPiu);
  });
  return { bacini, disponibili };
}

/** Il riepilogo della zona 3 NEL MODO scelto: l'unico calcolo, usato sia
 * dalla rotta `compiti/estrai` sia da `assegnaCompito`, così che il
 * riepilogo non dia mai per assegnabile ciò che l'assegnazione rifiuta.
 *
 * CLASSE: `riepilogoEstrazione` (l'estrazione vera, con quel seme).
 *
 * STUDENTE: i bacini congelati (`congelaBacini`) e i loro numeri del caso
 * peggiore come `disponibili` per blocco; `sufficiente` se ogni blocco ne
 * ha almeno quanti ne chiede. `duplicatiTolti` è 0: nel modo classe conta
 * gli esercizi davvero tolti perché già presi con QUEL seme, mentre qui
 * ogni studente pesca col suo e i già presi cambiano da uno all'altro — un
 * numero "che avrebbero potuto prendere" sotto lo stesso nome direbbe
 * un'altra cosa. `esercizi` è un ESEMPIO (la spec: nel modo diverse per
 * studente l'anteprima è un esempio), estratto dai bacini congelati con il
 * seme della pagina; con `anteprima: false` non si carica (chi assegna non
 * ne fa niente) e resta vuoto. `bacini` è ciò che il compito salverà. */
export async function riepilogoPerModo(
  blocchi: Blocco[],
  chi: Utente,
  seme: string,
  modo: "CLASSE" | "STUDENTE",
  opzioni: { anteprima?: boolean } = {},
): Promise<{ riepilogo: Riepilogo; bacini?: BacinoCongelato[] }> {
  if (modo === "CLASSE") return { riepilogo: await riepilogoEstrazione(blocchi, chi, seme) };

  const risolti = await baciniDeiBlocchi(blocchi, chi);
  const { bacini, disponibili } = await congelaBacini(risolti);
  let sufficiente = bacini.every((b, k) => disponibili[k]! >= b.count);

  let esercizi: Riepilogo["esercizi"] = [];
  if (sufficiente && opzioni.anteprima !== false) {
    const ids = estrazioneDaBaciniCongelati(bacini, seme);
    const righe = await versioniConContenuto(ids);
    esercizi = ids.flatMap((v) => {
      const r = righe.get(v);
      return r ? [r] : [];
    });
    // Una versione sparita fra le query (esercizio eliminato in quel
    // momento): come in `riepilogoEstrazione`, non si mostra un compito
    // più corto del totale.
    if (esercizi.length !== ids.length) {
      sufficiente = false;
      esercizi = [];
    }
  }

  return {
    riepilogo: {
      blocchi: risolti.map((b, k) => ({
        etichetta: b.etichetta,
        richiesti: b.richiesti,
        disponibili: disponibili[k]!,
        nonDisponibili: b.nonDisponibili,
      })),
      duplicatiTolti: 0,
      totale: risolti.reduce((s, b) => s + b.richiesti, 0),
      sufficiente,
      esercizi,
    },
    bacini,
  };
}

/** Assegnare un compito dal "Nuovo compito" (spec 2026-10-22): i blocchi, il
 * modo, il seme. L'unica strada di assegnazione: il Task 7 ha tolto le
 * vecchie (`assegnaCompito` per un compito preparato, `assegnaDiretto` per la
 * scorciatoia della Panoramica).
 *
 * Tutti i controlli prima di qualunque scrittura, nell'ordine: date
 * (`motivoDateNonValide`, le stesse della modifica); blocchi (almeno uno,
 * e ciascuno valido per `rifiutoRegole`, la STESSA convalida di
 * `creaBatteria` — un "scelti" vuoto o con doppioni, un `quanti` non
 * positivo ⇒ `blocchi_non_validi`); classe (esistente, non archiviata,
 * insegnata da chi assegna); modello indicato
 * (deve esistere ed essere un modello, cioè non automatico); estrazione.
 *
 * L'estrazione è sempre COME DOCENTE (`comeDocente`): un ADMIN che insegna
 * pesca fra ciò che vedrebbe da docente.
 *
 * **Modo CLASSE — si assegna ciò che si è visto.** Si rifà il riepilogo con
 * lo stesso `seme`: stessi bacini e stesso seme danno la stessa estrazione
 * (`estraiConDettaglio` è deterministica). Se il docente ha mandato le
 * versioni viste e non coincidono — stesso ordine compreso: l'ordine è
 * quello del compito — vuol dire che il bacino è cambiato nel frattempo (un
 * collega ha reso privato un esercizio, ne è uscita una versione nuova) e
 * si risponde `estrazione_cambiata` con il riepilogo nuovo, senza scrivere
 * niente: il docente deve vedere ciò che assegna. Senza `versioniViste`
 * (non ha mai aperto l'anteprima) si assegna l'estrazione del riepilogo.
 * `drawSeed` = il seme, `drawnVersionIds` = le versioni estratte.
 *
 * **Modo STUDENTE — diverse per studente.** Il riepilogo è quello del modo
 * (`riepilogoPerModo`, lo stesso che la pagina ha ricevuto da
 * `compiti/estrai`): bacini congelati e sufficienza nel caso peggiore, così
 * nessuno studente può restare corto; insufficiente ⇒
 * `esercizi_insufficienti` con quel riepilogo. Nessuna estrazione di classe
 * e nessun contenuto caricato (`anteprima: false`).
 * `drawnVersionIds` resta vuoto, `bacini` è il bacino congelato, e ogni
 * studente iscritto ORA riceve subito la sua `EstrazioneStudente` (seme
 * `${seme}:${studentId}`, `estrazioneDaBaciniCongelati`: lo stesso calcolo
 * che `estrazioneDelloStudente` farà per chi si iscrive dopo).
 *
 * **Scritture, tutte in una transazione** (Decisioni, punto 2): la batteria
 * automatica, copia dei blocchi, propria del compito; con `salvaModello`
 * anche un modello nuovo (batteria non automatica, stessi blocchi), che
 * diventa il `modelloId` del compito — vince su un `modelloId` passato
 * insieme, perché i blocchi assegnati sono quelli del modello nuovo; il
 * compito; le estrazioni degli iscritti. Un fallimento a metà non lascia
 * niente: è la ragione per cui la scrittura di `creaBatteria` è stata
 * staccata in `scriviBatteria`: nessuna batteria da cancellare a mano dopo
 * un rifiuto.
 *
 * Un blocco "argomento" senza `anno` pesca fra tutti gli anni: è la rotta a
 * riempire l'anno con quello della classe (`blocchiConAnno`). */
export async function assegnaCompito(i: InputAssegna): Promise<EsitoAssegnaCompito> {
  const date = motivoDateNonValide(i.opensAt ?? null, i.dueAt ?? null, true);
  if (date) return { ok: false, motivo: "date_non_valide", dettaglio: date };

  // Nessun blocco = nessun esercizio: un compito vuoto non è apribile da
  // nessuno (lo stesso difetto che `conteggio_non_valido` chiude in
  // `creaBatteria`). Ogni blocco valido chiede almeno un esercizio, quindi
  // "almeno un blocco" basta perché il totale sia positivo.
  if (i.blocchi.length === 0) return { ok: false, motivo: "blocchi_non_validi" };
  const regole = i.blocchi.map(regolaDaBlocco);
  const chi = comeDocente(i.teacherId);

  const classe = await prisma.classe.findUnique({ where: { id: i.classeId } });
  if (!classe) return { ok: false, motivo: "classe_non_trovata" };
  if (classe.archivedAt != null) return { ok: false, motivo: "non_insegni_questa_classe" };
  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId: i.classeId, teacherId: i.teacherId } },
  });
  if (!insegna) return { ok: false, motivo: "non_insegni_questa_classe" };

  if (i.modelloId !== undefined && !i.salvaModello) {
    const modello = await prisma.batteria.findUnique({ where: { id: i.modelloId }, select: { automatica: true } });
    if (!modello || modello.automatica) return { ok: false, motivo: "modello_non_trovato" };
  }

  const rifiuto = await rifiutoRegole(i.teacherId, regole);
  if (rifiuto && rifiuto.motivo !== "contenitore_non_trovato") return { ok: false, motivo: "blocchi_non_validi" };

  // Una raccolta che chi assegna non vede (`contenitore_non_trovato` qui
  // sopra) ha bacino vuoto: il riepilogo la mostra come "Raccolta non
  // disponibile" con zero disponibili, che è la risposta più utile per il
  // docente — la stessa che la pagina gli mostrava già.
  // Nel modo STUDENTE senza anteprima: l'esempio non serve a chi assegna.
  const { riepilogo, bacini: congelati } = await riepilogoPerModo(i.blocchi, chi, i.seme, i.modo, { anteprima: false });
  if (!riepilogo.sufficiente || rifiuto) return { ok: false, motivo: "esercizi_insufficienti", riepilogo };

  let drawnVersionIds: string[] = [];
  let bacini: BacinoCongelato[] | null = null;
  if (i.modo === "CLASSE") {
    drawnVersionIds = riepilogo.esercizi.map((x) => x.versioneId);
    const viste = i.versioniViste;
    if (viste && (viste.length !== drawnVersionIds.length || viste.some((v, k) => v !== drawnVersionIds[k]))) {
      return { ok: false, motivo: "estrazione_cambiata", riepilogo };
    }
  } else {
    bacini = congelati!;
  }

  const nome = nomeDelCompito(riepilogo);
  const compitoId = await prisma.$transaction(async (tx) => {
    const batteriaId = await scriviBatteria(tx, i.teacherId, nome, regole, undefined, true);
    const modelloId = i.salvaModello
      ? await scriviBatteria(tx, i.teacherId, i.salvaModello.nome, regole, undefined, false)
      : i.modelloId ?? null;
    const compito = await tx.compito.create({
      data: {
        batteriaId,
        classeId: i.classeId,
        assignedById: i.teacherId,
        drawSeed: i.seme,
        drawnVersionIds,
        modo: i.modo,
        bacini: bacini ?? undefined,
        modelloId,
        opensAt: i.opensAt,
        dueAt: i.dueAt,
      },
    });
    if (bacini) {
      const congelati = bacini;
      const iscritti = await tx.classeStudente.findMany({ where: { classeId: i.classeId }, select: { studentId: true } });
      if (iscritti.length > 0) {
        await tx.estrazioneStudente.createMany({
          data: iscritti.map(({ studentId }) => ({
            compitoId: compito.id,
            studentId,
            versionIds: estrazioneDaBaciniCongelati(congelati, `${i.seme}:${studentId}`),
          })),
        });
      }
    }
    return compito.id;
  });

  return { ok: true, compitoId };
}

/** Controlla che un `compitoId` arrivato dalla query string (il link nella
 * home dello studente è letteralmente `?compitoId=...`, niente da
 * indovinare) sia davvero legittimo per QUESTO studente e QUESTO esercizio,
 * PRIMA che venga scritto su un `Tentativo` — l'unico punto che lo scrive è
 * `avviaORiprendi` (tentativo.ts), che chiama questa funzione e non fida mai
 * del valore ricevuto.
 *
 * Quattro condizioni, tutte necessarie: il compito esiste (e non è stato
 * ritirato); è già aperto
 * (`opensAt` assente o passato); lo studente è iscritto ORA alla sua classe;
 * l'esercizio che sta aprendo è fra quelli che l'assegnazione ha davvero
 * pescato PER LUI (`estrazioneDelloStudente`: `drawnVersionIds` nel modo
 * CLASSE, la sua `EstrazioneStudente` nel modo STUDENTE), non uno qualunque. Senza l'ultimo controllo
 * uno studente potrebbe abbinare un `compitoId` vero a un esercizio mai
 * assegnato da quel compito e farlo contare come consegna sua — la stessa
 * famiglia di scorciatoia che le funzioni sotto (Fix round finale) chiudono
 * dal lato della lettura.
 *
 * Stessa forma delle funzioni gemelle di questo file (`assegnaCompito`): tutti i
 * controlli avvengono qui, in un solo posto, prima di qualunque scrittura —
 * non sparsi fra chiamante e dominio.
 *
 * **Restituisce l'id della `EsercizioVersione` pescata da questo compito
 * per questo esercizio, non solo `true`/`false` (Onda di correzioni
 * finale, C2)**: prima di questa correzione la firma diceva solo SE un
 * `compitoId` fosse valido, mai QUALE versione l'assegnazione avesse
 * davvero pescato — il chiamante (`avviaORiprendi`) non aveva altra scelta
 * che aprire sempre l'ULTIMA versione dell'esercizio (`orderBy: {version:
 * "desc"}`), la stessa per un esercizio libero e per uno assegnato. Finché
 * solo il seed creava versioni "ultima" e "pescata" coincidevano sempre;
 * appena un docente corregge un esercizio già assegnato (questo task lo
 * rende possibile per la prima volta), non più — uno studente che riapre
 * il link del compito otteneva un tentativo NUOVO su un seme nuovo e una
 * versione MAI pescata da quel compito: lavoro in corso perso, e anche un
 * completamento successivo non contava come consegna (`consegneDelCompito`
 * filtra su `esercizioVersioneId: { in: drawnVersionIds }`). Il valore
 * `null` copre sia "non valido" sia "non trovato", esattamente come prima
 * il booleano `false` — il chiamante non ha bisogno di distinguerli. */
export async function compitoApribile(
  compitoId: string,
  studentId: string,
  esercizioId: string,
): Promise<string | null> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  // Un compito ritirato (soft delete, vedi `ritiraCompito`) esiste ancora
  // come riga, ma per lo studente non c'è più: un `compitoId` scritto a
  // mano nell'indirizzo non deve poter legargli un tentativo nuovo.
  if (!compito || compito.ritiratoAt != null) return null;
  if (compito.opensAt && compito.opensAt > new Date()) return null;

  const iscritto = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: compito.classeId, studentId } },
  });
  if (!iscritto) return null;

  // Solo DOPO l'iscrizione: nel modo STUDENTE la lettura può memorizzare
  // l'estrazione, e non va memorizzata per chi non è della classe.
  const versioni = await estrazioneDelloStudente(compito, studentId);
  if (versioni.length === 0) return null;

  const versionePescata = await prisma.esercizioVersione.findFirst({
    where: { id: { in: versioni }, esercizioId },
    select: { id: true },
  });
  return versionePescata?.id ?? null;
}

/** I compiti assegnati a una classe, per la vista del docente. `esercizi` è
 * quanti esercizi riceve ogni studente (`eserciziPerStudente`): nel modo
 * STUDENTE le versioni cambiano da studente a studente, il numero no. */
export async function compitiDellaClasse(
  classeId: string,
): Promise<{ id: string; batteria: string; dueAt: Date | null; esercizi: number }[]> {
  const righe = await prisma.compito.findMany({
    // I compiti ritirati spariscono dagli elenchi del docente (questa
    // funzione alimenta la pagina dei compiti, quella d'ingresso e la
    // conferma di rimozione di una classe): restano solo nel database.
    where: { classeId, ritiratoAt: null },
    include: { batteria: true },
    orderBy: { createdAt: "desc" },
  });
  return righe.map((c) => ({
    id: c.id,
    batteria: c.batteria.name,
    dueAt: c.dueAt,
    esercizi: eserciziPerStudente(c),
  }));
}

/** I compiti che uno studente vede, con i titoli degli esercizi pescati e
 * quanti ne ha completati. Guarda le classi CORRENTI dello studente, non uno
 * snapshot al momento dell'assegnazione: chi entra in classe dopo vede
 * comunque il compito. */
export async function compitiDelloStudente(studentId: string): Promise<
  { id: string; batteria: string; dueAt: Date | null; esercizi: { esercizioId: string; title: string }[]; fatti: number }[]
> {
  const iscrizioni = await prisma.classeStudente.findMany({ where: { studentId }, select: { classeId: true } });
  const classeIds = iscrizioni.map((i) => i.classeId);
  if (classeIds.length === 0) return [];

  const compiti = await prisma.compito.findMany({
    // Un compito ritirato non è più "da fare": non compare, e non conta.
    where: { classeId: { in: classeIds }, ritiratoAt: null },
    include: { batteria: true },
    orderBy: { createdAt: "desc" },
  });

  // Le versioni di QUESTO studente per ogni compito, in un colpo solo: nel
  // modo STUDENTE ognuno ha le sue (`estrazioniDegliStudenti`), nel modo
  // CLASSE sono `drawnVersionIds`. Lo studente è iscritto alle classi di
  // questi compiti per costruzione (`iscrizioni` qui sopra).
  const estrazioni = await estrazioniDegliStudenti(compiti, [studentId]);

  const risultati: Awaited<ReturnType<typeof compitiDelloStudente>> = [];
  for (const c of compiti) {
    const pescate = estrazioni.get(c.id)!.get(studentId) ?? [];
    const versioni = await prisma.esercizioVersione.findMany({
      where: { id: { in: pescate } },
      include: { esercizio: true },
    });
    const perId = new Map(versioni.map((v) => [v.id, v]));
    const esercizi = pescate
      .map((vid) => perId.get(vid))
      .filter((v): v is NonNullable<typeof v> => v != null)
      .map((v) => ({ esercizioId: v.esercizioId, title: v.esercizio.title }));

    // `esercizioVersioneId: { in: c.drawnVersionIds }` (Fix round finale,
    // item 1) non è ridondante col filtro su `compitoId`: quest'ultimo da
    // solo si fida di qualunque valore scritto sul tentativo, compresi
    // quelli scritti PRIMA che `avviaORiprendi` validasse `compitoId in
    // ingresso (vedi `compitoApribile` più sopra) — righe già nel database
    // che portano un `compitoId` vero ma un esercizio mai pescato da
    // quell'assegnazione. Senza intersecare con `drawnVersionIds`, quelle
    // righe continuerebbero a contare come consegne di un compito a cui non
    // appartengono, anche dopo che l'ingresso è stato chiuso.
    //
    // `distinct: ["esercizioVersioneId"]` (Secondo giro, item 1): completare
    // un esercizio non ne consuma la possibilità di riaprirlo —
    // `avviaORiprendi` cerca solo un tentativo IN_PROGRESS da riprendere, mai
    // uno COMPLETED, quindi riaprire il link di un esercizio già consegnato
    // apre sempre un tentativo NUOVO. Completarlo una seconda volta scrive
    // una seconda riga COMPLETED per lo stesso esercizio — comportamento del
    // tutto ordinario, non un dato forgiato. Un `count` grezzo sulle righe
    // conterebbe entrambe: lo stesso esercizio due volte, `fatti` che supera
    // `totali`. Qui conta gli ESERCIZI distinti completati, non le righe.
    const completati = await prisma.tentativo.findMany({
      where: {
        studentId,
        compitoId: c.id,
        status: "COMPLETED",
        esercizioVersioneId: { in: pescate },
      },
      select: { esercizioVersioneId: true },
      distinct: ["esercizioVersioneId"],
    });
    const fatti = completati.length;

    risultati.push({ id: c.id, batteria: c.batteria.name, dueAt: c.dueAt, esercizi, fatti });
  }
  return risultati;
}

/** Le consegne di un compito: parte dagli iscritti ATTUALI alla classe, non
 * dai tentativi, così chi non ha ancora iniziato compare comunque con zero.
 * Chi è uscito dalla classe sparisce da qui, ma i suoi tentativi restano nel
 * database (il compito li referenzia comunque).
 *
 * `teacherId` è chi sta guardando: autorizzato se insegna OGGI la classe del
 * compito (`classeDocente`, lo stesso controllo che `assegnaCompito` fa già sulla
 * scrittura — Fix round 1) OPPURE se è stato lui ad assegnarlo
 * (`assignedById`, Fix round finale, item 2). La seconda clausola non
 * sostituisce la prima, la allarga: `dichiaraInsegnamento` è una
 * sostituzione integrale dell'elenco (vedi il dominio in classi.ts), e con
 * due schede aperte salvare quella vecchia fa sparire silenziosamente una
 * classe dall'elenco insegnato di un docente — il compito che ci aveva
 * assegnato resta, gli studenti continuano a vederlo e a lavorarci, ma senza
 * questa seconda clausola NESSUNO potrebbe più leggerne le consegne: non il
 * docente che l'ha creato (non insegna più quella classe secondo
 * `classeDocente`), non un altro docente (non l'ha mai insegnata), non un
 * admin (nessuna eccezione di ruolo qui, invariato dal Fix round 1). Chi ha
 * assegnato un compito deve sempre poter vedere come è andato.
 *
 * Nessuna eccezione per ADMIN: qui vale la stessa regola di `assegnaCompito`, per
 * chiunque guardi. */
export async function consegneDelCompito(
  compitoId: string,
  teacherId: string,
): Promise<
  | { ok: true; righe: { studentId: string; nome: string; fatti: number; totali: number; punteggio: number; massimo: number }[] }
  | { ok: false; motivo: "non_insegni_questa_classe" }
> {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  // Ritirato = inesistente, anche qui: stessa risposta di un id che non c'è.
  if (!compito || compito.ritiratoAt != null) return { ok: true, righe: [] };

  if (!(await haTitoloSulCompito(compito, teacherId))) return { ok: false, motivo: "non_insegni_questa_classe" };

  const iscritti = await prisma.classeStudente.findMany({
    where: { classeId: compito.classeId },
    include: { studente: true },
    orderBy: { studente: { name: "asc" } },
  });

  // Autoritativo sul numero totale: quante delle versioni pescate esistono
  // ANCORA (Fix round finale, item 3), non quante ne furono pescate allora
  // (`drawnVersionIds.length`, crudo). `compitiDelloStudente` filtra già le
  // versioni risolvibili per costruire l'elenco esercizi dello studente; le
  // due letture devono concordare sullo stesso numero, non una contare 3 e
  // l'altra 2 per lo stesso compito — altrimenti lo studente resta bloccato
  // a "2 su 3" per sempre, senza modo di sapere che il terzo non esiste più.
  // Non raggiungibile oggi (niente cancella un Esercizio), ma corretto fin
  // da ora costa poco ed evita di doverci tornare quando l'editor degli
  // esercizi aprirà quella strada.
  //
  // Nel modo STUDENTE ognuno ha le sue versioni (`versioniDiTuttiGliStudenti`),
  // quindi `totali` si conta studente per studente, sulle SUE versioni; le
  // versioni ancora esistenti si leggono una volta sola per tutti.
  const perStudente = await versioniDiTuttiGliStudenti(compitoId);
  const esistenti = new Set(
    (await prisma.esercizioVersione.findMany({
      where: { id: { in: [...new Set([...perStudente.values()].flat())] } },
      select: { id: true },
    })).map((v) => v.id),
  );

  const righe = [];
  for (const i of iscritti) {
    const pescate = perStudente.get(i.studentId) ?? [];
    const totali = pescate.filter((v) => esistenti.has(v)).length;
    // `esercizioVersioneId: { in: pescate } }` (Fix round
    // finale, item 1): senza intersecare con ciò che l'assegnazione ha
    // DAVVERO pescato, questa query conta qualunque tentativo che porti
    // questo `compitoId` — compresi quelli scritti prima che
    // `avviaORiprendi` validasse l'ingresso (`compitoApribile`), su un
    // esercizio mai assegnato da questo compito. Il committente ha
    // dimostrato l'esito: uno studente che non aveva risolto NESSUNO degli
    // esercizi assegnati compariva come 5/3, sopra chi ne aveva fatto
    // davvero uno.
    const tentativi = await prisma.tentativo.findMany({
      where: { studentId: i.studentId, compitoId, esercizioVersioneId: { in: pescate } },
    });

    // Raggruppa per esercizio (Secondo giro, item 1): `avviaORiprendi` non
    // riprende mai un tentativo COMPLETED, solo uno IN_PROGRESS — riaprire
    // il link di un esercizio già consegnato apre sempre un tentativo
    // nuovo, con un seme nuovo. Comportamento ordinario, non un caso raro:
    // uno studente che torna sul compito già svolto. Sommare `score` e
    // `maxScore` di TUTTE le righe (come faceva prima) conta lo stesso
    // esercizio più volte — la stessa patologia del "5/3" dimostrato dal
    // committente, raggiunta qui senza nessun id forgiato. Un solo
    // rappresentante per esercizio, quindi: il migliore fra i tentativi
    // COMPLETED se ce n'è almeno uno (rifare un esercizio è pratica, non va
    // penalizzato — il punteggio più alto vince), altrimenti il tentativo
    // più recente (per mostrare comunque un progresso in corso). `score` e
    // `maxScore` vengono SEMPRE dallo stesso tentativo: `punteggio` non può
    // mai superare `massimo`, esercizio per esercizio e quindi in totale.
    const perEsercizio = new Map<string, typeof tentativi>();
    for (const t of tentativi) {
      const gruppo = perEsercizio.get(t.esercizioVersioneId);
      if (gruppo) gruppo.push(t);
      else perEsercizio.set(t.esercizioVersioneId, [t]);
    }

    let fatti = 0;
    let punteggio = 0;
    let massimo = 0;
    for (const gruppo of perEsercizio.values()) {
      const completati = gruppo.filter((t) => t.status === "COMPLETED");
      const rappresentante = completati.length > 0
        ? completati.reduce((migliore, t) => (t.score > migliore.score ? t : migliore))
        : gruppo.reduce((piuRecente, t) => (t.startedAt > piuRecente.startedAt ? t : piuRecente));
      if (completati.length > 0) fatti++;
      punteggio += rappresentante.score;
      massimo += rappresentante.maxScore;
    }

    righe.push({
      studentId: i.studentId,
      nome: i.studente.name ?? i.studente.email,
      fatti,
      totali,
      punteggio,
      massimo,
    });
  }
  return { ok: true, righe };
}

/** Chi può agire su un compito già assegnato: chi insegna OGGI la sua classe
 * OPPURE chi l'ha assegnato. È la regola di `consegneDelCompito` (vedi il
 * suo commento per il perché della seconda clausola), scritta una volta sola
 * perché leggere le consegne, cambiare le date e ritirare il compito devono
 * rispondere allo stesso modo alla stessa domanda: un docente che vede le
 * consegne di un compito deve poterlo anche correggere, e viceversa.
 * Esportata per `statisticheDelCompito` (statistiche.ts): le statistiche
 * per esercizio sono un'altra lettura delle stesse consegne, e devono
 * rispondere alla stessa domanda allo stesso modo. */
export async function haTitoloSulCompito(
  compito: { classeId: string; assignedById: string },
  teacherId: string,
): Promise<boolean> {
  if (compito.assignedById === teacherId) return true;
  const insegna = await prisma.classeDocente.findUnique({
    where: { classeId_teacherId: { classeId: compito.classeId, teacherId } },
  });
  return insegna != null;
}

/** Un solo motivo per "non esiste", "è ritirato" e "non è tuo": le rotte lo
 * traducono in 404 e, distinguendo i tre casi nel corpo della risposta,
 * confermerebbero a chi sonda un id altrui che quel compito esiste — la
 * stessa ragione per cui il progetto risponde 404 e non 403. */
export type EsitoGestioneCompito =
  | { ok: true }
  | { ok: false; motivo: "compito_non_trovato" | MotivoDate };

/** Il compito, se `teacherId` può agire su di lui e non è già ritirato. */
async function compitoGestibile(compitoId: string, teacherId: string) {
  const compito = await prisma.compito.findUnique({ where: { id: compitoId } });
  if (!compito || compito.ritiratoAt != null) return null;
  if (!(await haTitoloSulCompito(compito, teacherId))) return null;
  return compito;
}

/** Cambia apertura e scadenza di un compito già assegnato (una scadenza
 * sbagliata non deve restare per sempre). `null` toglie la data.
 *
 * Gli esercizi pescati NON cambiano, ed è voluto: sono congelati in
 * `drawnVersionIds` (vedi `assegnaCompito`) e gli studenti possono averci già
 * lavorato — cambiare le date non deve cambiare cosa la classe ha ricevuto.
 *
 * Stesse regole di `assegnaCompito` sulle date (`motivoDateNonValide`), con
 * un'unica differenza, spiegata lì: una scadenza passata ma INVARIATA non è
 * un errore di battitura fatto adesso, quindi non si rifiuta.
 *
 * La scrittura è un `updateMany` condizionato a `ritiratoAt: null`, non un
 * `update` per id: un ritiro arrivato fra la lettura qui sopra e la
 * scrittura (un collega, un'altra scheda) non viene "resuscitato" da una
 * modifica di date che risponderebbe pure di successo. */
export async function modificaDateCompito(
  compitoId: string,
  teacherId: string,
  date: { opensAt: Date | null; dueAt: Date | null },
): Promise<EsitoGestioneCompito> {
  const compito = await compitoGestibile(compitoId, teacherId);
  if (!compito) return { ok: false, motivo: "compito_non_trovato" };

  const scadenzaNuova = date.dueAt?.getTime() !== compito.dueAt?.getTime();
  const motivo = motivoDateNonValide(date.opensAt, date.dueAt, scadenzaNuova);
  if (motivo) return { ok: false, motivo };

  const { count } = await prisma.compito.updateMany({
    where: { id: compitoId, ritiratoAt: null },
    data: { opensAt: date.opensAt, dueAt: date.dueAt },
  });
  if (count === 0) return { ok: false, motivo: "compito_non_trovato" };
  return { ok: true };
}

/** Ritira un compito (dato alla classe sbagliata, o per errore): sparisce
 * dalla pagina degli studenti, dagli elenchi del docente e da ogni via che
 * lo apre o lo conta — `compitiDellaClasse`, `compitiDelloStudente`,
 * `compitoApribile` (quindi `avviaORiprendi`), `consegneDelCompito`,
 * `percorsoCompitoStudente` lo trattano tutte come inesistente.
 *
 * Soft delete (`ritiratoAt`), non una cancellazione: i tentativi già svolti
 * restano nel database e restano legati al compito (`onDelete: SetNull` li
 * avrebbe staccati, perdendo di quale assegnazione erano consegna), e la
 * batteria resta "in uso" per `eliminaModello` (un vecchio compito
 * preparato si nasconde invece di cancellarsi), che il vincolo `Restrict`
 * obbligherebbe comunque.
 *
 * Ritirare un compito già ritirato risponde "non trovato" e non sposta la
 * data del primo ritiro: lo stesso `updateMany` condizionato di
 * `modificaDateCompito`, così due ritiri concorrenti ne registrano uno. */
export async function ritiraCompito(compitoId: string, teacherId: string): Promise<EsitoGestioneCompito> {
  const compito = await compitoGestibile(compitoId, teacherId);
  if (!compito) return { ok: false, motivo: "compito_non_trovato" };

  const { count } = await prisma.compito.updateMany({
    where: { id: compitoId, ritiratoAt: null },
    data: { ritiratoAt: new Date() },
  });
  if (count === 0) return { ok: false, motivo: "compito_non_trovato" };
  return { ok: true };
}
