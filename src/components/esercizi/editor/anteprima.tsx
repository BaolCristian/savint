"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { versoNumbas } from "@/lib/esercizi/editor/verso-numbas";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";
import { ValoriSorteggiati } from "@/components/esercizi/editor/valori-sorteggiati";
import type { NumbasQuestionJSON } from "@savint/engine";

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
  /** Il seme su cui la verifica a venti semi (o il salvataggio, che corre la
   * stessa verifica) ha rifiutato l'esercizio, quando un rifiuto è ancora in
   * vista — Item I6 dell'onda di correzioni: "Seme: 14" da solo non è
   * azionabile, perché questa anteprima genera sempre semi casuali e non
   * offre modo di inserirne uno. Quando presente, sostituisce il PRIMO dei
   * tre semi (non un quarto sorteggio aggiunto: il rapporto della revisione
   * chiede "uno dei" tre) — il docente vede così con i propri occhi il
   * sorteggio che ha rotto l'esercizio, invece di dover portare un numero a
   * uno sviluppatore. Resta ancorato a questo seme finché il rifiuto resta
   * in vista: "Nuovi numeri" rigenera solo gli altri due, non questo —
   * altrimenti un clic sul pulsante lo farebbe sparire proprio mentre serve
   * di più, mentre si prova una correzione. */
  semeRifiuto?: number;
}

/** L'anteprima: lo stesso `player-esercizio` dello studente, dietro tre
 * linguette con tre semi diversi — non una riproduzione, perché solo il
 * componente vero garantisce che quello che il docente vede sia davvero
 * quello che vedrà lo studente. Tre, perché uno solo non mostra che
 * qualcosa è casuale (vedi il brief del Task 7); una linguetta per volta,
 * non tre riquadri affiancati, perché la colonna che le ospita è larga
 * quanto una colonna di editor, non quanto tre player.
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
 * bottone rigenera i tre semi; il player resta comunque montato una volta
 * sola per (seme, contenuto) — cambiarne uno dei due (cambio di linguetta o
 * modifica dell'esercizio) lo rimonta da capo, perché il player carica la
 * domanda una volta sola al montaggio (vedi il commento gemello in
 * player-esercizio.tsx). */
export function Anteprima({ editor, locale, semeRifiuto }: AnteprimaProps) {
  const t = useTranslations("esercizi.redazione.anteprima");
  const idBase = useId();
  const [semi, setSemi] = useState<string[]>(nuoviSemi);
  const [selezionato, setSelezionato] = useState(0);

  // Aggiustamento di stato durante il render (il pattern che React
  // documenta per derivare uno stato da un cambio di prop, non un effetto:
  // niente `useEffect` qui, quindi nessuna violazione del vincolo che vieta
  // `setState` dentro `useEffect` su questa superficie) — giro di
  // correzioni 1, C1/B2. `<Anteprima>` è montata una volta sola;
  // `semeRifiuto` le arriva come cambio di prop quando il docente preme
  // "Controlla" mentre sta guardando una linguetta qualunque. Senza questo
  // aggiustamento, `selezionato` resterebbe fermo dov'era: la prima
  // linguetta diventerebbe rossa ma il player continuerebbe a mostrare il
  // sorteggio che il docente stava già guardando — il seme che ha rotto
  // l'esercizio non gli verrebbe mai messo davanti agli occhi, che è l'unica
  // ragione per cui questo meccanismo esiste. Con tre riquadri affiancati
  // (prima di questo task) non poteva succedere: erano tutti visibili
  // insieme. Il confronto scatta solo quando `semeRifiuto` CAMBIA, non a
  // ogni render: dopo essere tornato sulla prima linguetta, il docente può
  // comunque spostarsi liberamente su un'altra.
  const [semeRifiutoPrecedente, setSemeRifiutoPrecedente] = useState(semeRifiuto);
  if (semeRifiuto !== semeRifiutoPrecedente) {
    setSemeRifiutoPrecedente(semeRifiuto);
    if (semeRifiuto !== undefined) {
      setSelezionato(0);
    }
  }

  const tabRef = useRef<Array<HTMLButtonElement | null>>([]);
  const content = useMemo(() => versoNumbas(editor), [editor]);
  const contentKey = useMemo(() => JSON.stringify(content), [content]);

  // Il seme del rifiuto è lo stesso che `verificaSuSemi` passa al motore
  // (`seed: String(seme)`, vedi verifica.ts): riusarlo qui com'è, non un
  // valore derivato, è ciò che garantisce che la linguetta riproduca
  // ESATTAMENTE lo stesso sorteggio che ha rotto l'esercizio.
  const semiVisibili = semeRifiuto === undefined ? semi : [String(semeRifiuto), ...semi.slice(1)];
  const semeAttivo = semiVisibili[selezionato]!;
  const rifiutoAttivo = semeRifiuto !== undefined && selezionato === 0;

  const idTitolo = `${idBase}-titolo`;
  const idPannello = `${idBase}-pannello`;
  const idTab = (indice: number) => `${idBase}-tab-${indice}`;

  function seleziona(indice: number) {
    setSelezionato(indice);
  }

  // Freccia sinistra/destra (con giro) e Home/End spostano insieme fuoco e
  // selezione (roving tabindex, attivazione automatica): il pattern ARIA
  // "tabs" per intero, non solo la parte minima.
  function alTastoGiu(evento: React.KeyboardEvent<HTMLDivElement>) {
    const totale = semiVisibili.length;
    let prossimo: number | null = null;
    if (evento.key === "ArrowRight") {
      prossimo = (selezionato + 1) % totale;
    } else if (evento.key === "ArrowLeft") {
      prossimo = (selezionato - 1 + totale) % totale;
    } else if (evento.key === "Home") {
      prossimo = 0;
    } else if (evento.key === "End") {
      prossimo = totale - 1;
    }
    if (prossimo === null) return;
    evento.preventDefault();
    seleziona(prossimo);
    tabRef.current[prossimo]?.focus();
  }

  return (
    <section className="space-y-3" aria-label={t("titolo")}>
      <h2 id={idTitolo} className="text-lg font-semibold">
        {t("titolo")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("spiegazione")}</p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-labelledby={idTitolo} className="flex gap-1" onKeyDown={alTastoGiu}>
          {semiVisibili.map((seme, indice) => {
            const rifiuto = semeRifiuto !== undefined && indice === 0;
            const attiva = indice === selezionato;
            return (
              <button
                key={indice}
                ref={(elemento) => {
                  tabRef.current[indice] = elemento;
                }}
                type="button"
                role="tab"
                id={idTab(indice)}
                aria-selected={attiva}
                aria-controls={idPannello}
                tabIndex={attiva ? 0 : -1}
                data-seme-rifiuto={rifiuto ? "" : undefined}
                onClick={() => seleziona(indice)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  attiva
                    ? "border-foreground/30 bg-muted text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                  rifiuto && "border-destructive text-destructive hover:text-destructive",
                )}
              >
                {/* Il colore da solo non basta a segnalare la linguetta del
                    rifiuto — chi non distingue il rosso, o usa un lettore di
                    schermo, non lo percepirebbe: l'icona è un secondo
                    segnale visivo, il nome accessibile diverso ("… —
                    rifiutato") un terzo, testuale. Giro di correzioni 1,
                    C5/B5. */}
                {rifiuto && <TriangleAlert aria-hidden="true" className="size-3.5" />}
                {rifiuto ? t("sorteggioRifiuto", { numero: indice + 1 }) : t("sorteggio", { numero: indice + 1 })}
              </button>
            );
          })}
        </div>
        <Button type="button" variant="outline" onClick={() => setSemi(nuoviSemi())}>
          {t("rigenera")}
        </Button>
      </div>

      {/* Niente `tabIndex` qui: il pannello contiene già un elemento
          focalizzabile (il player) — renderlo focalizzabile a sua volta lo
          duplicherebbe inutilmente nell'ordine di tabulazione (giro di
          correzioni 1, C6/B8). */}
      <div
        role="tabpanel"
        id={idPannello}
        aria-labelledby={idTab(selezionato)}
        className={cn("rounded-lg border p-3", rifiutoAttivo && "border-destructive")}
      >
        <PlayerEsercizioLazy
          key={`${semeAttivo}-${contentKey}`}
          tentativoId={`anteprima-${semeAttivo}`}
          esercizioId="anteprima"
          seed={semeAttivo}
          content={content}
          statoIniziale={null}
          lastActivityAt={new Date()}
          locale={locale}
          soloLocale
        />
        <p className={cn("mt-2 text-xs font-medium", rifiutoAttivo ? "text-destructive" : "text-muted-foreground")}>
          {rifiutoAttivo ? t("semeRifiuto", { seme: semeAttivo }) : t("seme", { seme: semeAttivo })}
        </p>
      </div>

      {/* `semiVisibili`, non `semi`: sono gli stessi tre semi che le
          linguette mostrano davvero, col primo sostituito dal seme del
          rifiuto quando ce n'è uno in vista. Passare `semi` qui farebbe
          vedere alla colonna 1 numeri diversi da quelli che il player
          mostra nella linguetta 1 — due verità contraddittorie sulla stessa
          schermata, proprio mentre il docente cerca di capire cosa ha rotto
          l'esercizio. */}
      <ValoriSorteggiati content={content as NumbasQuestionJSON} semi={semiVisibili} />
    </section>
  );
}
