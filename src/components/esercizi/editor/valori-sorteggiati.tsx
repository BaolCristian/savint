"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { jme, loadQuestion, variables, type NumbasQuestionJSON, type Question } from "@savint/engine";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ValoriSorteggiatiProps {
  content: NumbasQuestionJSON;
  semi: string[];
}

/** Lo stesso segnaposto "nessun valore" già in uso nel resto della
 * piattaforma (vedi ad es. `practice-view.tsx`), non una chiave di
 * traduzione: è punteggiatura, non una frase. */
const TRATTINO = "—";

/** I nomi di variabile dichiarati da `content.variables`: la stessa fonte
 * autorevole che usa il motore stesso, e la stessa che legge
 * `verifica.ts` (`nomiDichiarati`) — non le chiavi dell'oggetto, perché
 * un'assegnazione multipla ("a,b") vive sotto una sola chiave ma dichiara
 * due nomi. Ordine di prima apparizione, senza duplicati: due definizioni
 * che dichiarassero lo stesso nome due volte non devono raddoppiare la
 * riga. */
function nomiVariabili(content: NumbasQuestionJSON): string[] {
  const nomi: string[] = [];
  const visti = new Set<string>();
  for (const def of Object.values(content.variables ?? {})) {
    for (const nome of variables.splitVariableNames(def.name ?? "")) {
      if (!visti.has(nome)) {
        visti.add(nome);
        nomi.push(nome);
      }
    }
  }
  return nomi;
}

/** La sola parte del contenuto da cui dipende questa tabella: le
 * definizioni delle variabili, la condizione che le rigenera, le funzioni
 * che le definizioni possono chiamare e i ruleset che il loro scope porta.
 *
 * Serve a due cose insieme, ed è la stessa cosa detta due volte: è la
 * CHIAVE della memoria qui sotto, ed è anche ciò che si passa a
 * `loadQuestion` — così il risultato è una funzione pura della chiave,
 * senza il rischio che la memoria tenga un valore calcolato su qualcosa
 * che la chiave non guarda.
 *
 * Enunciato, aiuto e parti restano fuori apposta. Non entrano nel valore
 * di nessuna variabile (`Question` genera le variabili PRIMA di sostituire
 * l'enunciato e prima di costruire le parti), ma cambiano a ogni tasto
 * premuto dal docente mentre scrive il testo o una risposta attesa: con
 * loro nella chiave, ogni tasto ricomprava tre `loadQuestion` sincroni
 * dentro il render — 7 ms misurati su una macchina veloce con due sole
 * variabili, moltiplicati per 3-5 su un portatile scolastico.
 *
 * Il prezzo, dichiarato: un enunciato rotto (un `\simplify{}` che non
 * compila) faceva lanciare `loadQuestion` e quindi spariva la tabella
 * intera. Ora non la fa più sparire — e i valori che mostra restano quelli
 * giusti, perché le variabili non sono cambiate. Il guasto dell'enunciato
 * si vede dove è già mostrato, cioè nell'anteprima sopra questa tabella. */
function parteCheDecide(content: NumbasQuestionJSON): NumbasQuestionJSON {
  return {
    ...content,
    statement: "",
    advice: "",
    parts: [],
  };
}

/** I valori delle variabili date, per un seme, o `undefined` se il
 * caricamento per QUEL seme lancia — un esercizio in corso di scrittura è
 * quasi sempre rotto (vedi il brief del Task 3): la colonna diventa un
 * trattino per ogni riga, non un componente che sparisce e non un errore
 * in console — l'anteprima sopra questa tabella mostra già il guasto. */
function valoriDelSeme(content: NumbasQuestionJSON, seme: string, nomi: string[]): string[] | undefined {
  let caricata: Question;
  try {
    caricata = loadQuestion(content, { seed: seme, locale: "it" });
  } catch {
    return undefined;
  }
  return nomi.map((nome) => {
    const token = caricata.scope.getVariable(nome);
    return token === undefined ? TRATTINO : jme.tokenToDisplayString(token, caricata.scope);
  });
}

/** La tabella dei valori sorteggiati: una riga per variabile, una colonna
 * per seme — quello che tre linguette da sfogliare una alla volta non
 * mostrano, cioè che l'esercizio è una FAMIGLIA e non un esercizio singolo.
 * `semi` deve essere `semiVisibili` (non lo stato `semi` grezzo
 * dell'anteprima): è responsabilità di chi monta questo componente, non
 * di questo componente, vedi il commento in `anteprima.tsx`. */
export function ValoriSorteggiati({ content, semi }: ValoriSorteggiatiProps) {
  const t = useTranslations("esercizi.redazione.valoriSorteggiati");

  // La chiave è il CONTENUTO della parte che decide questa tabella, più i
  // semi correnti: tre `loadQuestion` sincroni dentro il render sono un
  // costo da pagare quando le variabili cambiano, non a ogni tasto premuto
  // nell'enunciato (vedi `parteCheDecide`). `semiVisibili`, a differenza di
  // `semi`, è ricreato a ogni render di `Anteprima` (non è un `useState`),
  // quindi la sua IDENTITÀ non è una chiave utilizzabile: solo il suo
  // contenuto lo è — e lo stesso vale per `content`, che `Anteprima`
  // ricostruisce con `versoNumbas` a ogni modifica del modello.
  const chiaveDecisiva = useMemo(() => JSON.stringify(parteCheDecide(content)), [content]);
  const semiKey = semi.join("|");

  const { nomi, colonne } = useMemo(() => {
    const decisivo = parteCheDecide(content);
    const nomiCorrenti = nomiVariabili(decisivo);
    const colonneCorrenti = semi.map((seme) => valoriDelSeme(decisivo, seme, nomiCorrenti));
    return { nomi: nomiCorrenti, colonne: colonneCorrenti };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveDecisiva, semiKey]);

  const tutteFallite = colonne.every((colonna) => colonna === undefined);
  if (nomi.length === 0 || tutteFallite) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">{t("titolo")}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("variabile")}</TableHead>
            {semi.map((seme, indice) => (
              <TableHead key={seme + indice}>{t("sorteggio", { numero: indice + 1 })}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {nomi.map((nome, rigaIndice) => (
            <TableRow key={nome}>
              <TableCell className="font-medium">{nome}</TableCell>
              {colonne.map((colonna, colonnaIndice) => (
                <TableCell key={colonnaIndice}>{colonna === undefined ? TRATTINO : colonna[rigaIndice]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
