"use client";

/** La forma pubblica delle parti e la loro risposta attesa: le usano il
 * player e la stampa delle verifiche, che devono mostrare le stesse scelte,
 * nello stesso ordine, con le stesse risposte giuste. */
import { variables, type parts } from "@savint/engine";
import { ContenutoHtml } from "./contenuto-html";
import type { PartePubblica } from "./parti";

type PartBase = InstanceType<typeof parts.PartBase>;

/** Costruisce la forma pubblica di una parte per il player (Task 7:
 * `PartePubblica`). Il motore sostituisce già da sé `p.promptHtml` (e quello
 * dei gap): `Question`'s constructor chiama `substitutePartPrompts` su ogni
 * parte al caricamento, quindi la `sostituisci(p.promptHtml)` qui sotto è
 * ridondante — innocua, ma non è lei a salvare la situazione. Il varco che il
 * motore lascia davvero aperto è nelle IMPOSTAZIONI di tipo (`p.settings`),
 * mai toccate da quel passaggio: le scelte di `1_n_2`/`m_n_2` e le righe/
 * colonne di una griglia `m_n_x` (`choices` sono le righe, `answers` le
 * colonne — vedi il commento di `InputGriglia`) arrivano qui ancora col
 * markup autorale (`\var{r1}`). È per questi tre campi che la sostituzione
 * qui sotto è necessaria: senza, tre degli otto esercizi mostrerebbero allo
 * studente markup grezzo nelle scelte o nella griglia. */
export function costruisciParte(p: PartBase): PartePubblica {
  const scope = p.getScope();
  const sostituisci = (html: string) => variables.substituteHtml(html, scope);
  const impostazioni = p.settings as Record<string, unknown>;

  const parte: PartePubblica = {
    path: p.path,
    type: p.type,
    promptHtml: sostituisci(p.promptHtml),
    marks: p.marks,
  };

  if (p.type === "1_n_2" || p.type === "m_n_2") {
    parte.scelte = ((impostazioni.choices as string[] | undefined) ?? []).map(sostituisci);
    // L'ordine mescolato per questo studente: per le scelte singole e
    // multiple il motore lo tiene in `shuffleAnswers` (una permutazione degli
    // indici originali, seminata come tutto il resto della domanda).
    const ordine = (p as unknown as { shuffleAnswers?: number[] }).shuffleAnswers;
    if (Array.isArray(ordine) && ordine.length === parte.scelte.length) parte.ordine = [...ordine];
  } else if (p.type === "m_n_x") {
    parte.righe = ((impostazioni.choices as string[] | undefined) ?? []).map(sostituisci);
    parte.colonne = ((impostazioni.answers as string[] | undefined) ?? []).map(sostituisci);
  } else if (p.type === "gapfill") {
    parte.gaps = p.gaps.map(costruisciParte);
  }

  return parte;
}

/** Gli indici (0-based) delle celle vere in una colonna di matrice booleana,
 * `matrice[i][0]`: la forma che `correctAnswer()` restituisce SEMPRE per
 * `1_n_2` e `m_n_2` (`MultipleResponsePart#getCorrectAnswer`, `maxMatrix`
 * dopo il "flip" — una colonna sola, una riga per scelta), mai un indice
 * nudo. Per `1_n_2` un solo indice è vero; per `m_n_2` possono esserlo più
 * d'uno. */
function indiciSceltaCorretta(matrice: unknown): number[] {
  if (!Array.isArray(matrice)) return [];
  const indici: number[] = [];
  matrice.forEach((riga, i) => {
    const valore = Array.isArray(riga) ? riga[0] : riga;
    if (valore) indici.push(i);
  });
  return indici;
}

/** Le coppie riga→colonna vere di una griglia `m_n_x`: `correctAnswer()`
 * restituisce la matrice indicizzata `[colonna][riga]` (la stessa
 * convenzione di `ticks`, vedi il commento di `InputGriglia`), quindi va
 * letta `matrice[colonna][riga]`, mai `matrice[riga][colonna]`. */
function coppieCorretteGriglia(
  matrice: unknown,
  numRighe: number,
  numColonne: number,
): Array<{ riga: number; colonna: number }> {
  if (!Array.isArray(matrice)) return [];
  const coppie: Array<{ riga: number; colonna: number }> = [];
  for (let riga = 0; riga < numRighe; riga++) {
    for (let colonna = 0; colonna < numColonne; colonna++) {
      if ((matrice[colonna] as boolean[] | undefined)?.[riga]) {
        coppie.push({ riga, colonna });
        break;
      }
    }
  }
  return coppie;
}

/** La risposta attesa di UNA parte semplice (mai un `gapfill`, che si
 * scompone gap per gap in `RispostaAttesa` sotto), letta da
 * `PartBase#correctAnswer()` e mai dal meccanismo di rivelazione del motore
 * (`getAdvice`/`revealAnswer`, vietati: mutano lo stato e rischiano di
 * perdere le risposte alla riserializzazione — vedi il dispaccio).
 *
 * La forma dipende dal tipo (part-base.ts, gapfill-part.ts,
 * multiple-response-part.ts): una stringa già pronta per `numberentry`,
 * `jme` e `patternmatch`; sempre una matrice booleana per le scelte
 * (`1_n_2`, `m_n_2`, `m_n_x`) — mostrarla così com'è sarebbe peggio che non
 * mostrare niente, quindi qui si traduce nella scelta o nelle coppie che
 * rappresenta. */
function RispostaAttesaValore({
  parteEngine,
  partePubblica,
}: {
  parteEngine: PartBase;
  partePubblica: PartePubblica;
}) {
  const risposta = parteEngine.correctAnswer();

  if (partePubblica.type === "1_n_2" || partePubblica.type === "m_n_2") {
    const scelte = partePubblica.scelte ?? [];
    const indici = indiciSceltaCorretta(risposta);
    if (indici.length === 0) return null;
    return (
      <ul className="list-disc space-y-1 pl-5">
        {indici.map((i) => (
          <li key={i}>
            <ContenutoHtml html={scelte[i] ?? ""} />
          </li>
        ))}
      </ul>
    );
  }

  if (partePubblica.type === "m_n_x") {
    const righe = partePubblica.righe ?? [];
    const colonne = partePubblica.colonne ?? [];
    const coppie = coppieCorretteGriglia(risposta, righe.length, colonne.length);
    return (
      <ul className="list-disc space-y-1 pl-5">
        {coppie.map(({ riga, colonna }) => (
          <li key={riga}>
            <ContenutoHtml html={righe[riga] ?? ""} /> → <ContenutoHtml html={colonne[colonna] ?? ""} />
          </li>
        ))}
      </ul>
    );
  }

  // numberentry, jme, patternmatch: `correctAnswer()` è già una stringa
  // pronta per lo studente (part-base.ts, ciascuna col proprio
  // `getCorrectAnswer`).
  return <ContenutoHtml html={risposta === null || risposta === undefined ? "" : String(risposta)} />;
}

/** La risposta attesa di una parte, gap per gap quando è un `gapfill`: la
 * risposta attesa appartiene alla PARTE (a differenza della soluzione
 * svolta, che appartiene alla domanda, vedi `SpiegazioneParte`), e per un
 * gapfill quella parte è ciascuno spazio — non l'array che
 * `GapFillPart#correctAnswer()` restituirebbe per l'intero gapfill. Ogni
 * spazio è etichettato col nome che il motore gli assegna già
 * (`PartBase#name`, "Spazio 0", "Spazio 1", …), lo stesso che compare nel
 * feedback del motore: nessuna nuova chiave i18n per numerarli. */
export function RispostaAttesa({ parteEngine, partePubblica }: { parteEngine: PartBase; partePubblica: PartePubblica }) {
  if (partePubblica.type === "gapfill") {
    const gaps = partePubblica.gaps ?? [];
    return (
      <ul className="space-y-1">
        {gaps.map((gapPubblico, i) => {
          const gapEngine = parteEngine.gaps[i];
          if (!gapEngine) return null;
          return (
            <li key={gapPubblico.path}>
              <strong>{gapEngine.name}</strong>: <RispostaAttesaValore parteEngine={gapEngine} partePubblica={gapPubblico} />
            </li>
          );
        })}
      </ul>
    );
  }
  return <RispostaAttesaValore parteEngine={parteEngine} partePubblica={partePubblica} />;
}
