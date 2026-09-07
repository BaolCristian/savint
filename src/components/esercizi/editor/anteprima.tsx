"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { versoNumbas } from "@/lib/esercizi/editor/verso-numbas";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";

const NUMERO_SEMI = 3;

/** Un seme diverso a ogni rigenerazione — non un identificatore univoco
 * globale, per cui `crypto.randomUUID` sarebbe eccessivo (e non garantito
 * in ogni ambiente di test). */
function nuovoSeme(): string {
  return Math.random().toString(36).slice(2, 10);
}

function nuoviSemi(): string[] {
  return Array.from({ length: NUMERO_SEMI }, nuovoSeme);
}

export interface AnteprimaProps {
  editor: EsercizioEditor;
  locale: "it" | "en";
}

/** L'anteprima: lo stesso `player-esercizio` dello studente, tre volte
 * affiancato con tre semi diversi — non una riproduzione, perché solo il
 * componente vero garantisce che quello che il docente vede sia davvero
 * quello che vedrà lo studente. Tre, perché uno solo non mostra che
 * qualcosa è casuale (vedi il brief del Task 7).
 *
 * Inerte per costruzione: `soloLocale` (Task 7 su player-esercizio.tsx)
 * disattiva le sue chiamate di rete, quindi nessun tentativo viene creato e
 * nessuna riga scritta — un docente che prova il proprio esercizio non deve
 * comparire fra le consegne. La prova è in
 * player-esercizio.test.tsx ("modalità locale"), non ripetuta qui.
 *
 * Il contenuto si ricostruisce a ogni cambio dell'editor con la stessa
 * `versoNumbas` che il salvataggio userà (Task 1): l'anteprima mostra
 * sempre la bozza corrente, non uno scatto preso al primo montaggio. Il
 * bottone rigenera i tre semi; ogni player resta comunque montato una
 * volta sola per (seme, contenuto) — cambiarne uno dei due lo rimonta da
 * capo, perché il player carica la domanda una volta sola al montaggio
 * (vedi il commento gemello in player-esercizio.tsx). */
export function Anteprima({ editor, locale }: AnteprimaProps) {
  const t = useTranslations("esercizi.redazione.anteprima");
  const [semi, setSemi] = useState<string[]>(nuoviSemi);
  const content = useMemo(() => versoNumbas(editor), [editor]);
  const contentKey = useMemo(() => JSON.stringify(content), [content]);

  return (
    <section className="space-y-3" aria-label={t("titolo")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t("titolo")}</h2>
        <Button type="button" variant="outline" onClick={() => setSemi(nuoviSemi())}>
          {t("rigenera")}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("spiegazione")}</p>
      <div className="grid gap-4 md:grid-cols-3">
        {semi.map((seme, indice) => (
          <div key={`${seme}-${contentKey}`} className="rounded-lg border p-3" data-anteprima={indice}>
            <p className="mb-2 text-xs font-medium text-muted-foreground">{t("seme", { seme })}</p>
            <PlayerEsercizioLazy
              tentativoId={`anteprima-${seme}`}
              esercizioId="anteprima"
              seed={seme}
              content={content}
              statoIniziale={null}
              lastActivityAt={new Date()}
              locale={locale}
              soloLocale
            />
          </div>
        ))}
      </div>
    </section>
  );
}
