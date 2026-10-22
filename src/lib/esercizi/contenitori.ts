import { prisma } from "@/lib/db/client";
import { puo, raccoltaRendeVisibile, ruoliContenitori, ruoliEsercizi, ruoloContenitore, type Ruolo, type Utente } from "./accesso";

/**
 * Le raccolte (il modello Prisma `Contenitore`) rispettano proprietà e
 * condivisione (spec "Il modello di accesso", "Regola delle raccolte"):
 * - vederla serve un ruolo qualunque; aggiungere o togliere esercizi serve
 *   `modificare` (EDITOR o PROPRIETARIO); eliminarla solo al PROPRIETARIO;
 * - una raccolta che `chi` non vede risponde `non_trovato`, identico a una
 *   che non esiste (mai un "esiste ma non è tua"); `sola_lettura` solo a chi
 *   la vede già ma non ha il ruolo per l'azione;
 * - dentro una raccolta ciascuno vede solo gli esercizi che vede comunque
 *   (`ruoliEsercizi`, che applica già la regola delle raccolte: trasmette
 *   solo ciò che l'autore stesso, contributore, ci ha messo).
 */

export type MotivoContenitore = "non_trovato" | "sola_lettura";

/** Crea un contenitore vuoto, di proprietà del docente che lo ha creato.
 * Nasce privato: `accessoScuola` resta al suo default null, nessuna
 * condivisione — la apre solo il proprietario, dalla finestra "Condividi". */
export async function creaContenitore(
  createdById: string,
  name: string,
  description?: string,
): Promise<{ id: string }> {
  const c = await prisma.contenitore.create({ data: { createdById, name, description } });
  return { id: c.id };
}

/** Le raccolte su cui `chi` ha un ruolo, ciascuna col suo ruolo e col
 * conteggio degli esercizi che `chi` ci vede davvero (non di tutti quelli
 * che contiene: il numero non deve rivelare gli esercizi altrui).
 *
 * Non espone `createdById`: nessun chiamante lo usa (l'interfaccia lato
 * client non ha nemmeno un campo per riceverlo, Fix round finale, item 6) —
 * un id utente grezzo che non serve a nulla qui non deve viaggiare oltre
 * questa funzione, per non diventare un'abitudine che il prossimo chiamante
 * copia senza chiedersi se serva davvero. Il ruolo dice già "è mia". */
export async function elencoContenitori(chi: Utente): Promise<
  { id: string; name: string; description: string | null; esercizi: number; ruolo: Ruolo }[]
> {
  const [ruoli, visibili] = await Promise.all([ruoliContenitori(chi), ruoliEsercizi(chi)]);
  if (ruoli.size === 0) return [];
  const righe = await prisma.contenitore.findMany({
    where: { id: { in: [...ruoli.keys()] } },
    orderBy: { name: "asc" },
    include: { esercizi: { select: { esercizioId: true } } },
  });
  return righe.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    esercizi: r.esercizi.filter((e) => visibili.has(e.esercizioId)).length,
    ruolo: ruoli.get(r.id)!,
  }));
}

/** Il contenuto di un contenitore, esercizi ordinati per anno e poi titolo:
 * solo quelli che `chi` vede. `null` se il contenitore non esiste o `chi`
 * non ha un ruolo su di esso (le due cose non si distinguono).
 *
 * `trasmette` dice se un esercizio di `chi`, messo qui da `chi`, diventerebbe
 * davvero visibile a qualcun altro (`raccoltaRendeVisibile`: `chi` deve
 * esserne contributore — proprietario o editor nominato — e la raccolta
 * aperta a qualcuno). Serve alla pagina per avvisare prima di metterci un
 * esercizio proprio e privato; un editor di scuola non contribuisce, quindi
 * per lui è sempre false.
 *
 * `visibili` è `ruoliEsercizi(chi)` già calcolata, per la pagina che la usa
 * anche per l'elenco degli esercizi da aggiungere (una volta per
 * richiesta: carica tutti gli esercizi). */
export async function contenutoContenitore(
  id: string,
  chi: Utente,
  visibili?: ReadonlyMap<string, Ruolo>,
): Promise<
  | {
      id: string;
      name: string;
      description: string | null;
      ruolo: Ruolo;
      trasmette: boolean;
      esercizi: { id: string; title: string; yearLevel: number; topic: string; difficulty: number }[];
    }
  | null
> {
  const ruolo = await ruoloContenitore(chi, id);
  if (!ruolo) return null;

  const [c, vede] = await Promise.all([
    prisma.contenitore.findUnique({
      where: { id },
      include: {
        esercizi: { include: { esercizio: true } },
        condivisioni: { select: { userId: true, ruolo: true } },
      },
    }),
    visibili ?? ruoliEsercizi(chi),
  ]);
  if (!c) return null;

  const esercizi = c.esercizi
    .map((ce) => ce.esercizio)
    .filter((e) => vede.has(e.id))
    .sort((a, b) => a.yearLevel - b.yearLevel || a.title.localeCompare(b.title));

  return {
    id: c.id,
    name: c.name,
    description: c.description,
    ruolo,
    trasmette: raccoltaRendeVisibile(c, chi.id, chi.id),
    esercizi: esercizi.map((e) => ({
      id: e.id,
      title: e.title,
      yearLevel: e.yearLevel,
      topic: e.topic,
      difficulty: e.difficulty,
    })),
  };
}

/** Il controllo comune di chi modifica il contenuto di una raccolta:
 * `non_trovato` se non la vede, `sola_lettura` se la vede senza poterla
 * modificare, `null` se può procedere. */
async function rifiutoModifica(contenitoreId: string, chi: Utente): Promise<MotivoContenitore | null> {
  const ruolo = await ruoloContenitore(chi, contenitoreId);
  if (!ruolo) return "non_trovato";
  if (!puo(ruolo, "modificare")) return "sola_lettura";
  return null;
}

/** Aggiunge esercizi a un contenitore; chi c'è già non si duplica.
 * Restituisce quante righe sono state davvero create.
 *
 * Serve `modificare` sulla raccolta e `vedere` su OGNI esercizio: se anche
 * uno solo non è visibile a `chi` si rifiuta tutto con `non_trovato`, senza
 * scrivere niente (lo stesso rifiuto di un id che non esiste).
 *
 * Ogni legame nuovo ricorda chi l'ha creato (`addedById`): è ciò su cui si
 * regge la regola delle raccolte — l'esercizio passa ai membri solo se ce
 * l'ha messo il suo autore. Riaggiungere un esercizio già presente non
 * cambia chi l'aveva aggiunto (`skipDuplicates` lascia la riga com'è):
 * altrimenti un editor potrebbe "togliere" la condivisione di un collega
 * solo riaggiungendo il suo esercizio. */
export async function aggiungiEsercizi(
  contenitoreId: string,
  esercizioIds: string[],
  chi: Utente,
): Promise<{ ok: true; aggiunti: number } | { ok: false; motivo: MotivoContenitore }> {
  const rifiuto = await rifiutoModifica(contenitoreId, chi);
  if (rifiuto) return { ok: false, motivo: rifiuto };
  const ids = [...new Set(esercizioIds)];
  if (ids.length === 0) return { ok: true, aggiunti: 0 };

  const visibili = await ruoliEsercizi(chi);
  if (ids.some((id) => !puo(visibili.get(id), "vedere"))) return { ok: false, motivo: "non_trovato" };

  const r = await prisma.contenitoreEsercizio.createMany({
    data: ids.map((esercizioId) => ({ contenitoreId, esercizioId, addedById: chi.id })),
    skipDuplicates: true,
  });
  return { ok: true, aggiunti: r.count };
}

/** Toglie un esercizio da un contenitore. L'esercizio stesso (il bacino)
 * resta intatto: si toglie solo il legame. Serve `modificare` sulla
 * raccolta, come per aggiungere. */
export async function togliEsercizio(
  contenitoreId: string,
  esercizioId: string,
  chi: Utente,
): Promise<{ ok: true } | { ok: false; motivo: MotivoContenitore }> {
  const rifiuto = await rifiutoModifica(contenitoreId, chi);
  if (rifiuto) return { ok: false, motivo: rifiuto };
  await prisma.contenitoreEsercizio.deleteMany({ where: { contenitoreId, esercizioId } });
  return { ok: true };
}

/** Cancella un contenitore libero: solo il PROPRIETARIO (un editor la
 * modifica, non la elimina). Se una BatteriaRegola lo usa, rifiuta prima di
 * tentare — il vincolo onDelete: Restrict è solo la rete di sicurezza,
 * questo controllo è ciò che dà un messaggio al docente invece di un errore
 * del database. L'accesso si controlla PRIMA dell'uso: a chi non la vede
 * non si dice nemmeno che è in uso. */
export async function eliminaContenitore(
  id: string,
  chi: Utente,
): Promise<{ ok: true } | { ok: false; motivo: MotivoContenitore | "in_uso" }> {
  const ruolo = await ruoloContenitore(chi, id);
  if (!ruolo) return { ok: false, motivo: "non_trovato" };
  if (ruolo !== "PROPRIETARIO") return { ok: false, motivo: "sola_lettura" };
  const usi = await prisma.batteriaRegola.count({ where: { contenitoreId: id } });
  if (usi > 0) return { ok: false, motivo: "in_uso" };
  await prisma.contenitore.delete({ where: { id } });
  return { ok: true };
}
