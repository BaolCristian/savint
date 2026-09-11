"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** Quel che la finestra restituisce quando il docente conferma.
 *
 * Sono due forme della stessa formula perché i due campi che aprono questa
 * finestra ne vogliono due diverse: il testo dell'esercizio vuole il
 * LaTeX, il campo delle risposte parte dall'ASCIIMath per convertire verso
 * JME. */
export interface RisultatoFormula {
  latex: string;
  asciiMath: string;
}

export interface FinestraFormulaProps {
  aperta: boolean;
  /** Il LaTeX di partenza, quando si modifica una formula esistente. */
  iniziale?: string;
  /** Perché l'ultima conferma non è stata accolta.
   *
   * La finestra non giudica la formula: a giudicarla è chi l'ha aperta —
   * il campo JME, che la converte e può rifiutare la conversione. Quando
   * rifiuta, NON richiude: il disegno resta dov'è, da correggere o da
   * annullare, e questa riga dice perché. Buttare via la formula appena
   * disegnata per dire che non va bene sarebbe il modo peggiore di dirlo. */
  avviso?: string;
  onChiudi: () => void;
  onConferma: (risultato: RisultatoFormula) => void;
}

/** Il contenuto vero della finestra, con dentro le 843 KB di MathLive:
 * arriva solo quando la finestra si apre, e non entra nel pacchetto della
 * pagina della redazione.
 *
 * `ssr: false` non è ammesso da un Server Component, da cui il `"use
 * client"` in cima a questo file — lo stesso motivo, e lo stesso schema,
 * di `player/player-esercizio-lazy.tsx`. */
const ContenutoFormula = dynamic(
  () => import("./finestra-formula-contenuto").then((m) => m.ContenutoFormula),
  { ssr: false, loading: () => <Caricamento /> },
);

function Caricamento() {
  const t = useTranslations("esercizi.redazione.finestraFormula");
  return <p className="text-sm text-muted-foreground">{t("caricamento")}</p>;
}

/** Toglie il fuoco a quel che ce l'ha dentro la finestra, prima che la
 * finestra sparisca.
 *
 * Serve perché MathLive tiene un riferimento globale al campo che ha il
 * fuoco e non lo libera quando quel campo viene distrutto: chiudere la
 * finestra mentre ci si scriveva dentro lascia quel riferimento appeso a
 * un campo morto, e il campo della finestra successiva lancia proprio
 * mentre prende il fuoco a sua volta. Non è un guaio di una volta sola:
 * finché la pagina resta aperta, quel riferimento appeso rompe **ogni**
 * apertura successiva.
 *
 * Quando il fuoco è su un pulsante, il campo l'ha già perso per conto suo
 * e questa chiamata non fa niente; togliere il fuoco a un pulsante che sta
 * per sparire non fa danno. */
function congeda() {
  const conIlFuoco = document.activeElement;
  if (conIlFuoco instanceof HTMLElement) conIlFuoco.blur();
}

/** La finestra in cui il docente scrive una formula come la vedrebbe sul
 * foglio, invece di batterne il LaTeX.
 *
 * Non inserisce niente da sé e non giudica niente: restituisce la formula a
 * chi l'ha aperta — il campo di testo la avvolge in `\( \)`, il campo delle
 * risposte la converte verso JME — e chi l'ha aperta la richiude, oppure la
 * lascia aperta con un `avviso` se quella formula non gli va bene. */
export function FinestraFormula({ aperta, iniziale, avviso, onChiudi, onConferma }: FinestraFormulaProps) {
  const t = useTranslations("esercizi.redazione.finestraFormula");

  // Le due strade per congedare il campo, e servono tutte e due.
  //
  // Questa copre l'uscita che non passa da nessun gesto della finestra:
  // se la redazione intera sparisse con la finestra aperta — una
  // navigazione — nessuno chiamerebbe `chiudi`. La pulizia di un effetto
  // di impaginazione **del genitore** gira mentre i nodi del figlio sono
  // ancora attaccati e il campo è ancora vivo; è la pulizia del figlio ad
  // arrivare quando React ha già staccato tutto (misurato: lì
  // `isConnected` è già `false` e MathLive ha già distrutto il campo, e un
  // `blur()` non fa più niente).
  //
  // Le chiamate qui sotto restano: su una chiusura normale il componente
  // NON si smonta — torna a rendere `null` — e questo effetto non si
  // pulisce affatto.
  useLayoutEffect(() => congeda, []);

  function chiudi() {
    congeda();
    onChiudi();
  }

  function conferma(risultato: RisultatoFormula) {
    congeda();
    onConferma(risultato);
  }

  // Chiusa non monta niente: è ciò che tiene MathLive fuori dal primo
  // caricamento della pagina.
  if (!aperta) return null;

  return (
    <Dialog
      open
      onOpenChange={(apertaOra) => {
        if (!apertaOra) chiudi();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogTitle>{t("titolo")}</DialogTitle>
        <DialogDescription>{t("descrizione")}</DialogDescription>
        {/* `role="alert"`: compare dopo un gesto del docente — la conferma
            rifiutata — e chi non guarda la finestra deve sentirselo dire,
            altrimenti il pulsante «Inserisci» sembrerebbe non aver fatto
            niente. */}
        {avviso && (
          <p role="alert" className="text-sm text-destructive">
            {avviso}
          </p>
        )}
        <ContenutoFormula iniziale={iniziale ?? ""} onChiudi={chiudi} onConferma={conferma} />
      </DialogContent>
    </Dialog>
  );
}
