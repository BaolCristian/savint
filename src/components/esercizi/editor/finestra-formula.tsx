"use client";

import dynamic from "next/dynamic";
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

/** La finestra in cui il docente scrive una formula come la vedrebbe sul
 * foglio, invece di batterne il LaTeX.
 *
 * Non inserisce niente da sé: restituisce la formula a chi l'ha aperta —
 * il campo di testo la avvolge in `\( \)`, il campo delle risposte la
 * converte verso JME — e chi l'ha aperta la richiude. */
export function FinestraFormula({ aperta, iniziale, onChiudi, onConferma }: FinestraFormulaProps) {
  const t = useTranslations("esercizi.redazione.finestraFormula");

  /** Toglie il fuoco a quel che ce l'ha dentro la finestra, prima che la
   * finestra sparisca.
   *
   * Serve perché MathLive tiene un riferimento globale al campo che ha il
   * fuoco e non lo libera quando quel campo viene distrutto: chiudere la
   * finestra mentre ci si scriveva dentro lasciava quel riferimento appeso
   * a un campo morto, e alla riapertura il campo nuovo lanciava proprio
   * mentre prendeva il fuoco — la finestra si apriva rotta dalla seconda
   * volta in poi. Il campo non può congedarsi da sé mentre sparisce:
   * quando React fa girare le pulizie degli effetti ha già staccato i nodi
   * e MathLive l'ha già distrutto.
   *
   * Passa di qui ogni uscita: i due pulsanti, il tasto Esc, lo sfondo, la
   * crocetta. Quando il fuoco è su un pulsante il campo l'ha già perso per
   * conto suo, e togliere il fuoco a un pulsante che sta per sparire non
   * fa danno. */
  function congeda() {
    const conIlFuoco = document.activeElement;
    if (conIlFuoco instanceof HTMLElement) conIlFuoco.blur();
  }

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
        <ContenutoFormula iniziale={iniziale ?? ""} onChiudi={chiudi} onConferma={conferma} />
      </DialogContent>
    </Dialog>
  );
}
