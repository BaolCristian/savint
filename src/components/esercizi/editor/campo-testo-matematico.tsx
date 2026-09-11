"use client";

import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { ContenutoHtml } from "@/components/esercizi/player/contenuto-html";
import { escapaTesto } from "@/lib/esercizi/editor/verso-numbas";
import { useTastieraSimboli, type InserimentoNelCampo } from "@/components/esercizi/tastiera-simboli";

/** I quattro inserimenti LaTeX della barra: il cursore finisce nel primo
 * argomento (`offsetCaret` conta dall'inizio del testo inserito), perché
 * dopo aver chiesto una frazione si scrive il numeratore, non si torna
 * indietro col mouse. Sostituiscono la selezione, come fa la digitazione. */
const INSERIMENTI: ReadonlyArray<InserimentoNelCampo & { id: string; glifo: string; chiave: string }> = [
  { id: "frazione", glifo: "a/b", chiave: "frazione", inserisci: "\\frac{}{}", offsetCaret: 6 },
  { id: "radice", glifo: "√", chiave: "radice", inserisci: "\\sqrt{}", offsetCaret: 6 },
  { id: "potenza", glifo: "x²", chiave: "potenza", inserisci: "^{}", offsetCaret: 2 },
  { id: "indice", glifo: "x₁", chiave: "indice", inserisci: "_{}", offsetCaret: 2 },
];

const CLASSE_TASTO =
  "flex min-h-11 min-w-11 items-center justify-center rounded-md border border-input px-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50";

/** `\var{nome}` è una sostituzione del motore, non un comando LaTeX: KaTeX
 * lancia su «Undefined control sequence: \var», e `Formula` — che non
 * lancia mai — ripiegherebbe in silenzio sul sorgente grezzo in un riquadro
 * `<code>`. Nell'eco il nome si mostra dunque in corsivo, che è come lo
 * disegnerà il motore quando al suo posto ci sarà un valore.
 *
 * È deliberatamente la stessa traduzione che l'editor di formule
 * registrerà come macro (`var: "\\mathit{#1}"`): le due superfici devono
 * disegnare `\var{a}` allo stesso modo, o l'eco mentirebbe sull'altra.
 *
 * Un solo livello di graffe, come la macro: `\var{a}`, `\var{r1}`,
 * `\var{a+b}`. Un contenuto con graffe annidate non viene tradotto e
 * ricade, corretto, nel riquadro col sorgente — mostrare *come si scrive*
 * resta vero anche lì. */
function varInCorsivo(testo: string): string {
  return testo.replace(/\\var\{([^{}]*)\}/g, (_, nome: string) => `\\mathit{${nome}}`);
}

export interface CampoTestoMatematicoProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** I nomi dichiarati nel pannello variabili, per il menu «Inserisci variabile». */
  variabili: string[];
  /** L'altezza iniziale del campo, in righe. La `Textarea` del design system
   * cresce già da sé col contenuto (`field-sizing: content`): serve solo a
   * chi vuole un riquadro alto prima ancora che ci sia qualcosa dentro —
   * nessuno dei due campi della redazione, per ora. */
  righe?: number;
}

/** Il campo con cui il docente scrive il testo di un esercizio: una
 * `Textarea` di sempre, una barra di inserimenti LaTeX, e sotto l'eco di
 * come quel testo verrà reso.
 *
 * L'eco non è una riproduzione: è lo stesso `ContenutoHtml` che vedrà lo
 * studente, alimentato con la stessa forma che `versoNumbas` produrrà al
 * salvataggio (`<p>` più `escapaTesto`). Le zone `\( \)` passano da
 * `Formula`, il resto resta testo, e `x < 0` resta `x < 0` invece di
 * sparire come un tag sconosciuto — tutto senza una seconda regola che
 * potrebbe divergere da quella vera.
 *
 * Quel che l'eco NON fa è calcolare: `\var{a}` si vede come `a` in corsivo
 * e `\simplify{...}` come il proprio sorgente, perché il valore dipende dal
 * seme. Quella è l'anteprima, che sta nella colonna accanto; questa è l'eco
 * di *come si scrive*. */
export function CampoTestoMatematico({
  id,
  etichetta,
  valore,
  onChange,
  variabili,
  righe,
}: CampoTestoMatematicoProps) {
  const t = useTranslations("esercizi.redazione.campoTesto");
  const { campoRef, inserisciNelCampo } = useTastieraSimboli<HTMLTextAreaElement>(valore, onChange);

  /** Avvolge ciò che è selezionato invece di sostituirlo: selezionare `x^2`
   * e chiedere una zona matematica deve dare `\(x^2\)`, non `\(\)`. Senza
   * selezione la coppia si apre vuota, col cursore fra i due delimitatori —
   * cioè dove si scriverà la formula. */
  function avvolgiSelezione(prima: string, dopo: string) {
    inserisciNelCampo((selezione) => ({
      inserisci: prima + selezione + dopo,
      offsetCaret: selezione ? prima.length + selezione.length + dopo.length : prima.length,
    }));
  }

  const idEco = `${id}-eco`;
  const haEco = valore.trim() !== "";

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold">
        {etichetta}
      </label>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("barra", { campo: etichetta })}>
        <button
          type="button"
          aria-label={t("zonaMatematica")}
          // Impedisce al tasto di rubare il focus dal campo: senza questo il
          // `mousedown` sposterebbe il focus prima ancora del `click`, e la
          // selezione da avvolgere non sarebbe più leggibile.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => avvolgiSelezione("\\(", "\\)")}
          className={CLASSE_TASTO}
        >
          \( \)
        </button>

        <button
          type="button"
          aria-label={t("semplifica")}
          onMouseDown={(e) => e.preventDefault()}
          // Il contenuto di `\simplify{}` resta JME, scritto a mano: questo
          // pulsante non apre nessun editor di formule.
          onClick={() => avvolgiSelezione("\\simplify{", "}")}
          className={CLASSE_TASTO}
        >
          {"\\simplify{}"}
        </button>

        {INSERIMENTI.map((strumento) => (
          <button
            key={strumento.id}
            type="button"
            aria-label={t(strumento.chiave)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => inserisciNelCampo(() => strumento)}
            className={CLASSE_TASTO}
          >
            {strumento.glifo}
          </button>
        ))}

        <select
          aria-label={t("inserisciVariabile")}
          // Il menu torna sempre sul segnaposto: è un comando, non una
          // scelta da ricordare — e la stessa variabile si inserisce due
          // volte di seguito senza doverne scegliere un'altra in mezzo.
          value=""
          disabled={variabili.length === 0}
          onChange={(e) => {
            const nome = e.target.value;
            if (!nome) return;
            const inserisci = `\\var{${nome}}`;
            inserisciNelCampo(() => ({ inserisci, offsetCaret: inserisci.length }));
          }}
          className="min-h-11 rounded-md border border-input bg-transparent px-2.5 text-sm transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
        >
          <option value="">{t("inserisciVariabile")}</option>
          {variabili.map((nome) => (
            <option key={nome} value={nome}>
              {nome}
            </option>
          ))}
        </select>
      </div>

      <Textarea
        id={id}
        ref={campoRef}
        rows={righe}
        value={valore}
        // L'eco descrive il campo, ma non si annuncia da sola: cambia a ogni
        // tasto premuto, e un `aria-live` la farebbe leggere a voce dopo
        // ogni lettera (stessa scelta di `campo-jme.tsx`).
        aria-describedby={haEco ? idEco : undefined}
        onChange={(e) => onChange(e.target.value)}
      />

      {haEco && (
        <div id={idEco} className="space-y-1 text-sm text-muted-foreground">
          <p>{t("comeSiVedra")}</p>
          <div className="text-foreground">
            <ContenutoHtml html={`<p>${escapaTesto(varInCorsivo(valore))}</p>`} />
          </div>
        </div>
      )}
    </div>
  );
}
