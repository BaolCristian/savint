"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";

/** Un sorteggio diverso a ogni rigenerazione — non un identificatore
 * univoco globale, per cui `crypto.randomUUID` sarebbe eccessivo (e non
 * garantito in ogni ambiente di test). Stessa tecnica di `nuovoSeme` in
 * editor/anteprima.tsx: qui non condivisa da un import, perché quel modulo
 * non la esporta e le due anteprime restano deliberatamente due componenti
 * distinti (tre semi affiancati là, uno solo qui — vedi sotto). */
function nuovoSorteggio(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface AnteprimaDocenteClientProps {
  esercizioId: string;
  content: unknown;
  locale: "it" | "en";
}

/** L'anteprima del docente su un esercizio qualunque del bacino — a
 * differenza di `Anteprima` (editor/anteprima.tsx), che affianca tre semi
 * per mostrare che l'esercizio È casuale, questa mostra UN solo sorteggio
 * alla volta: qui il docente non deve verificare la casualità, deve poter
 * risolvere l'esercizio per intero, come farebbe uno studente, prima di
 * assegnarlo a una classe. Un bottone rigenera il sorteggio.
 *
 * Monta lo stesso `PlayerEsercizioLazy` dello studente, con `soloLocale`:
 * nessuna chiamata di rete, quindi nessun `Tentativo` creato — un docente
 * che prova un esercizio non deve mai comparire fra le consegne dei suoi
 * studenti. La correzione resta comunque il vero motore Numbas (lo stesso
 * calcolo locale che il percorso normale usa come anteprima ottimistica
 * prima della conferma del server), qui trattato come definitivo: è la
 * stessa garanzia, e lo stesso componente, dell'anteprima dell'editor — la
 * prova che questa modalità non scrive è in player-esercizio.test.tsx
 * ("modalità locale"), non ripetuta qui. Qui si prova solo che QUESTO
 * componente passa `soloLocale` al player (`__tests__/anteprima-docente-client.test.tsx`):
 * il player è una prop sbagliata di distanza da quella scrittura.
 *
 * `content` arriva dal server (`caricaPerAnteprima`, redazione.ts) SEMPRE
 * grezzo, mai ricostruito da un editor: è quel che rende questa pagina
 * capace di mostrare anche i sei esercizi su otto che l'editor non sa
 * aprire. */
export function AnteprimaDocenteClient({ esercizioId, content, locale }: AnteprimaDocenteClientProps) {
  const t = useTranslations("esercizi.anteprimaDocente");
  const [sorteggio, setSorteggio] = useState<string>(nuovoSorteggio);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("seme", { seme: sorteggio })}</p>
        <Button type="button" variant="outline" onClick={() => setSorteggio(nuovoSorteggio())}>
          {t("rigenera")}
        </Button>
      </div>
      {/* `key`: un sorteggio nuovo deve rimontare il player da capo, perché
          carica la domanda una volta sola al montaggio (vedi il commento
          gemello in player-esercizio.tsx e in editor/anteprima.tsx). */}
      <div key={sorteggio} className="rounded-lg border p-3">
        <PlayerEsercizioLazy
          tentativoId={`anteprima-docente-${esercizioId}-${sorteggio}`}
          esercizioId={esercizioId}
          seed={sorteggio}
          content={content}
          statoIniziale={null}
          lastActivityAt={new Date()}
          locale={locale}
          soloLocale
        />
      </div>
    </section>
  );
}
