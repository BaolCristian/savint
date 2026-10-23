"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";

/** Un sorteggio per i numeri dell'anteprima — stessa tecnica di
 * `nuovoSorteggio` in anteprima-docente-client.tsx: non un identificatore
 * univoco, solo un seme qualunque (lo studente avrà i suoi: i semi per
 * studente sono per tentativo). */
function nuovoSorteggio(): string {
  return Math.random().toString(36).slice(2, 10);
}

export type EsercizioInAnteprima = { esercizioId: string; titolo: string; content: unknown };

/** L'anteprima di un compito intero "come la vedono i ragazzi" (spec,
 * "Anteprima del compito"): gli esercizi uno dopo l'altro, "Esercizio 2 di
 * 7", avanti e indietro, nello STESSO player dello studente in modalità
 * locale (`soloLocale`: nessuna chiamata di rete, nessun `Tentativo` —
 * come `AnteprimaDocenteClient`, un docente che prova il compito non deve
 * comparire fra le consegne).
 *
 * Usata prima di assegnare (pagina Nuovo compito, sull'estrazione del
 * riepilogo) e dopo (pagina "anteprima" del compito assegnato). `avviso`
 * è la scritta del modo "diverse per studente" prima di assegnare
 * ("Esempio: ogni studente avrà la sua estrazione"): chi la usa decide se
 * serve, qui si mostra soltanto.
 *
 * Un solo seme per tutta l'anteprima, scelto al montaggio: chi cambia
 * l'estrazione rimonta il componente (`key`), e un esercizio rivisto con
 * "Indietro" ha gli stessi numeri di prima. */
export function AnteprimaCompito({
  esercizi,
  locale,
  avviso,
}: {
  esercizi: EsercizioInAnteprima[];
  locale: "it" | "en";
  avviso?: string;
}) {
  const t = useTranslations("esercizi.nuovoCompito.anteprimaCompito");
  const [indice, setIndice] = useState(0);
  const [sorteggio] = useState(nuovoSorteggio);

  if (esercizi.length === 0) return <p className="text-sm text-muted-foreground">{t("vuota")}</p>;

  // Un elenco più corto di prima (non dovrebbe capitare: chi cambia gli
  // esercizi rimonta il componente) non deve lasciare l'indice fuori.
  const i = Math.min(indice, esercizi.length - 1);
  const corrente = esercizi[i]!;

  return (
    <section className="space-y-3">
      {avviso && (
        <p className="rounded-lg bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-ink">{avviso}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground" aria-live="polite">
            {t("posizione", { i: i + 1, n: esercizi.length })}
          </p>
          <h3 className="text-lg font-semibold">{corrente.titolo}</h3>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setIndice(i - 1)} disabled={i === 0}>
            <ChevronLeft aria-hidden="true" />
            {t("precedente")}
          </Button>
          <Button type="button" variant="outline" onClick={() => setIndice(i + 1)} disabled={i === esercizi.length - 1}>
            {t("successivo")}
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>
      {/* `key`: il player carica la domanda una volta sola al montaggio
          (vedi player-esercizio.tsx), quindi un esercizio diverso deve
          rimontarlo da capo. */}
      <div key={`${i}-${corrente.esercizioId}`} className="rounded-lg border bg-background p-2 sm:p-3">
        <PlayerEsercizioLazy
          tentativoId={`anteprima-compito-${i}-${corrente.esercizioId}-${sorteggio}`}
          esercizioId={corrente.esercizioId}
          seed={`${sorteggio}-${i}`}
          content={corrente.content}
          statoIniziale={null}
          lastActivityAt={new Date()}
          locale={locale}
          soloLocale
        />
      </div>
    </section>
  );
}
