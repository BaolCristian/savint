"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Formula } from "@/components/esercizi/player/formula";
import { TastieraSimboli, useTastieraSimboli } from "@/components/esercizi/tastiera-simboli";
import { versoJme, type EsitoConversione } from "@/lib/esercizi/editor/ascii-jme";
import { ecoDi } from "./eco-jme";
import { FinestraFormula } from "./finestra-formula";

type RifiutoConversione = Extract<EsitoConversione, { ok: false }>;

export interface CampoJmeProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** Il tastierino compare solo dove serve davvero: non sotto ogni campo. */
  tastierino?: boolean;
  aiuto?: string;
  /** Il campo è sbagliato per una ragione che il chiamante conosce e l'eco
   * no — una definizione vuota accanto a un nome compilato, per esempio: per
   * `ecoDi` è solo un campo vuoto, per il pannello è un errore. Segna il
   * campo come `aria-invalid`, che è anche ciò che gli dà il bordo rosso
   * (`input.tsx`). L'eco d'errore ha già il suo canale, sotto: i due non si
   * sovrappongono mai (dove l'eco parla, il campo non è vuoto). */
  invalido?: boolean;
  /** L'assistente per disegnare la formula invece di batterla, e i nomi
   * delle variabili dichiarate nell'esercizio.
   *
   * È una prop sola e non due (un interruttore più un elenco) perché le due
   * cose non hanno senso separate: senza i nomi dichiarati il cancello di
   * `versoJme` non può distinguere una variabile vera da un nome inventato
   * dalla giustapposizione, e rifiuterebbe ogni formula del docente. Con un
   * interruttore a parte quello stato sbagliato si potrebbe scrivere; così
   * no.
   *
   * E non è legata a `tastierino`, benché oggi i due compaiano insieme: il
   * tastierino è la tastiera dello studente, questo è uno strumento da
   * scrivania del docente, e legarli vorrebbe dire che spegnerne uno
   * spegne l'altro. La regola di *dove* compaiono è però la stessa —
   * dove si scrive matematica (la risposta attesa, il valore atteso), non
   * sulle istruzioni, non sulla condizione, non sulla definizione di una
   * variabile (`random(-9..9 except 0)` non è una formula) e non sul
   * margine di tolleranza (è un decimale). */
  assistenteFormula?: { nomiNoti: string[] };
}

/** Un campo JME: l'etichetta, il campo di testo, opzionalmente la tastiera
 * di simboli dello studente (`tastierino`) e l'assistente per disegnare una
 * formula (`assistenteFormula`), ed **sempre** l'eco del motore — come il
 * motore ha capito ciò che è scritto, calcolata con `ecoDi` (vedi
 * `eco-jme.tsx`).
 *
 * L'assistente apre la stessa finestra del campo di testo, ma quel che ne
 * esce non entra tale e quale: passa dal cancello di `versoJme`
 * (`lib/esercizi/editor/ascii-jme.ts`), che converte l'ASCIIMath verso JME
 * solo quando la conversione è sicura e rifiuta quando non lo è. Rifiutare
 * costa poco proprio qui: la finestra è un assistente, non l'unico ingresso
 * — chi vuole una formula che il cancello non lascia passare continua a
 * batterla nel campo, come ha sempre fatto.
 *
 * L'eco in stato d'errore non è mai rossa e allarmante mentre si scrive:
 * quasi ogni prefisso di un'espressione valida non lo è a sua volta
 * (`"12*x^"` non compila, ma è solo a metà), quindi uno stato d'errore
 * mentre il campo ha ancora il fuoco è la norma, non l'eccezione. Resta
 * discreta (`text-muted-foreground`) finché il campo scrive; diventa un
 * avviso (`text-destructive`) solo dopo che ha perso il fuoco — il momento
 * in cui il docente ha finito, e un'espressione ancora sgrammaticata è
 * davvero un problema da vedere. Nello stesso momento, e per la stessa
 * ragione, il campo diventa `aria-invalid`: il bordo rosso e l'avviso sono
 * lo stesso fatto detto due volte, e devono accendersi insieme.
 *
 * L'eco è legata al campo con `aria-describedby`, non annunciata da sola:
 * cambia a ogni tasto premuto, e un `aria-live` la farebbe leggere a voce
 * dopo ogni lettera, coprendo ciò che il docente sta scrivendo. Come
 * descrizione del campo resta invece disponibile quando serve, cioè quando
 * ci si ferma sopra. */
export function CampoJme({
  id,
  etichetta,
  valore,
  onChange,
  tastierino = false,
  aiuto,
  invalido = false,
  assistenteFormula,
}: CampoJmeProps) {
  const tCampo = useTranslations("esercizi.redazione.campoJme");
  const [haFocus, setHaFocus] = useState(false);
  const { campoRef, inserisciSimbolo, inserisciNelCampo } = useTastieraSimboli(valore, onChange);
  const [finestraAperta, setFinestraAperta] = useState(false);
  // Perché l'ultima conferma non è entrata nel campo. È lo stato che nasce
  // da un gesto — la conferma rifiutata — e la frase che il docente legge
  // si ricava da qui durante il render, senza un secondo stato da tenere
  // allineato.
  const [rifiuto, setRifiuto] = useState<RifiutoConversione | null>(null);

  /** La frase del rifiuto, nella lingua dell'interfaccia. `versoJme`
   * restituisce il DATO che la frase deve nominare — il segno ambiguo, il
   * nome sconosciuto, il messaggio del motore — non la frase: quella si
   * compone qui, dove il docente la legge. */
  function frasePerIlDocente(motivato: RifiutoConversione): string {
    switch (motivato.motivo) {
      case "ambiguo":
        return tCampo("ambiguo", { segno: motivato.dettaglio });
      case "nome_sconosciuto":
        return tCampo("nomeSconosciuto", { nome: motivato.dettaglio });
      case "non_compila":
        return tCampo("nonCompila", { dettaglio: motivato.dettaglio });
    }
  }

  function chiudiFinestra() {
    setFinestraAperta(false);
    setRifiuto(null);
  }

  /** La formula disegnata entra nel campo solo se la conversione è sicura.
   *
   * Si parte dall'ASCIIMath e non dal LaTeX: è la forma più vicina a JME
   * fra quelle che MathLive restituisce, e quella su cui il cancello di
   * `versoJme` è misurato. Il rifiuto NON richiude la finestra: il disegno
   * resta lì, da correggere o da annullare. */
  function confermaFormula(asciiMath: string, nomiNoti: string[]) {
    const convertita = versoJme(asciiMath, nomiNoti);
    if (!convertita.ok) {
      setRifiuto(convertita);
      return;
    }
    // Lo stesso meccanismo del tastierino, non una seconda copia: la
    // formula entra dove sta il cursore, non in fondo al campo.
    inserisciNelCampo(() => ({ inserisci: convertita.jme, offsetCaret: convertita.jme.length }));
    chiudiFinestra();
  }

  const esito = ecoDi(valore);
  const idEco = `${id}-eco`;
  const idAiuto = `${id}-aiuto`;
  const descrizioni = [aiuto ? idAiuto : null, esito.stato === "vuoto" ? null : idEco].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {etichetta}
      </label>

      {(tastierino || assistenteFormula) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tastierino && <TastieraSimboli onInserisci={inserisciSimbolo} />}
          {assistenteFormula && (
            <button
              type="button"
              // Impedisce al tasto di rubare il fuoco al campo: senza
              // questo il `mousedown` lo sposterebbe prima ancora del
              // `click`, e la formula confermata non saprebbe più dove
              // andare a finire.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setRifiuto(null);
                setFinestraAperta(true);
              }}
              className="flex min-h-11 items-center justify-center rounded-md border border-input px-2.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              {tCampo("scriviFormula")}
            </button>
          )}
        </div>
      )}

      <Input
        id={id}
        ref={campoRef}
        inputMode="text"
        autoComplete="off"
        value={valore}
        aria-invalid={invalido || (esito.stato === "errore" && !haFocus)}
        aria-describedby={descrizioni || undefined}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setHaFocus(true)}
        onBlur={() => setHaFocus(false)}
      />

      {assistenteFormula && (
        <FinestraFormula
          aperta={finestraAperta}
          // Nessun `iniziale`: questo campo contiene JME, e la finestra
          // parla LaTeX. Tradurre all'indietro sarebbe un secondo
          // traduttore da mantenere, per giunta su un testo che può non
          // essere JME affatto (`{a}` e le altre sostituzioni del motore).
          // L'assistente serve a scrivere una formula, non a rileggerla.
          avviso={rifiuto ? frasePerIlDocente(rifiuto) : undefined}
          onChiudi={chiudiFinestra}
          // L'ASCIIMath e non il LaTeX: è la forma su cui il cancello di
          // `versoJme` è misurato.
          onConferma={({ asciiMath }) => confermaFormula(asciiMath, assistenteFormula.nomiNoti)}
        />
      )}

      {aiuto && (
        <p id={idAiuto} className="text-xs text-muted-foreground">
          {aiuto}
        </p>
      )}

      {esito.stato === "reso" && (
        <div id={idEco} className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{tCampo("interpretatoCome")}</span>
          <Formula tex={esito.latex} />
        </div>
      )}

      {esito.stato === "errore" && (
        <p id={idEco} className={cn("text-xs", haFocus ? "text-muted-foreground" : "text-destructive")}>
          {esito.messaggio}
        </p>
      )}
    </div>
  );
}
