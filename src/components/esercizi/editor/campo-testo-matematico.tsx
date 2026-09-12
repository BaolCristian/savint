"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import {
  ContenutoHtml,
  trovaProssimaFormula,
  type FormulaTrovata,
} from "@/components/esercizi/player/contenuto-html";
import { MacroFormula } from "@/components/esercizi/player/formula";
import { escapaTesto } from "@/lib/esercizi/editor/verso-numbas";
import { useTastieraSimboli, type InserimentoNelCampo } from "@/components/esercizi/tastiera-simboli";
import { FinestraFormula } from "./finestra-formula";

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
 * lancia su «Undefined control sequence: \var», e `Formula` — che non lancia
 * mai — ripiega sul sorgente grezzo in un riquadro `<code>`. Nell'eco il nome
 * si mostra invece in corsivo, che è come lo disegnerà il motore quando al
 * suo posto ci sarà un valore.
 *
 * Si insegna il comando a KaTeX invece di riscrivere il testo prima di
 * darglielo. Riscriverlo falsificava l'unico posto in cui il docente rivede
 * ciò che ha battuto: quando la zona non si può rendere, il riquadro mostra
 * il sorgente — e quel sorgente sarebbe stato il nostro, non il suo. Chi
 * scriveva `\var{c}` leggeva `\mathit{c}`, e bastava un esponente non ancora
 * battuto (`\(\var{a}^\)`, stato normalissimo dopo il pulsante `\( \)`, che
 * la coppia la chiude da sé) perché succedesse anche senza `\simplify{}`.
 *
 * È deliberatamente la stessa traduzione che l'editor di formule registrerà
 * come macro (`var: "\mathit{#1}"`): le due superfici devono disegnare
 * `\var{a}` allo stesso modo, o l'eco mentirebbe sull'altra. E vale solo
 * qui: vedi il commento su `MacroFormula` per il motivo per cui lo studente
 * non deve averla. */
const MACRO_ECO: Readonly<Record<string, string>> = { "\\var": "\\mathit{#1}" };

/** Le zone matematiche del testo, nell'ordine, coi loro confini.
 *
 * La regola di divisione è quella di `ContenutoHtml` — importata da lì, non
 * riscritta: è la stessa che dividerà il testo quando lo vedrà lo studente,
 * e due copie divergerebbero sul caso che quella regola esiste per
 * risolvere (un `\)` dentro le graffe non è il terminatore della zona).
 *
 * Scandire prima dell'escaping HTML e non dopo dà gli stessi confini:
 * l'escaping tocca solo `&`, `<` e `>`, mai una graffa o una barra
 * rovesciata. */
function zoneMatematiche(testo: string): FormulaTrovata[] {
  const zone: FormulaTrovata[] = [];
  let da = 0;
  for (;;) {
    const trovata = trovaProssimaFormula(testo, da);
    if (!trovata) return zone;
    zone.push(trovata);
    da = trovata.fine;
  }
}

/** Il cursore sta dentro le graffe di un `\simplify{}`?
 *
 * È una domanda diversa da quella a cui risponde `haSimplify` più sotto —
 * «nel testo c'è un simplify?», che decide se mostrare la nota. Qui conta
 * *dove sta il cursore*, perché è lì che finirebbe la formula, e il
 * contenuto di un `\simplify{}` è JME: un editor di formule lo
 * distruggerebbe.
 *
 * Le graffe si contano invece di cercare la prima chiusura: dentro un
 * `\simplify{}` le sostituzioni di variabile (`{a}`) sono la regola, non
 * l'eccezione. E un `\simplify{` non ancora chiuso vale fino in fondo al
 * testo: mentre lo si scrive, tutto quel che segue è dentro. */
function dentroSimplify(testo: string, posizione: number): boolean {
  const APERTURA = "\\simplify{";
  for (let apre = testo.indexOf(APERTURA); apre !== -1; apre = testo.indexOf(APERTURA, apre + 1)) {
    const primaPosizione = apre + APERTURA.length;
    let profondita = 1;
    let i = primaPosizione;
    while (i < testo.length && profondita > 0) {
      if (testo[i] === "{") profondita += 1;
      else if (testo[i] === "}") profondita -= 1;
      i += 1;
    }
    // `i` è appena dopo la graffa che chiude: l'ultima posizione ancora
    // dentro è quella della graffa stessa.
    const ultimaPosizione = profondita === 0 ? i - 1 : testo.length;
    if (posizione >= primaPosizione && posizione <= ultimaPosizione) return true;
  }
  return false;
}

/** La formula dentro ciò che è selezionato.
 *
 * Selezionare la zona intera — delimitatori compresi — e chiedere l'editor
 * visuale è un gesto naturale: deve aprirlo su `x^2`, non su `\(x^2\)`,
 * che l'editor non saprebbe disegnare e che, riconfermato, si ritroverebbe
 * doppio nel testo. */
function formulaNellaSelezione(selezionato: string): string {
  if (selezionato.startsWith("\\(") && selezionato.endsWith("\\)")) {
    return selezionato.slice(2, -2);
  }
  return selezionato;
}

export interface CampoTestoMatematicoProps {
  id: string;
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  /** I nomi dichiarati nel pannello variabili, per il menu «Inserisci variabile». */
  variabili: string[];
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
}: CampoTestoMatematicoProps) {
  const t = useTranslations("esercizi.redazione.campoTesto");
  const { campoRef, inserisciNelCampo } = useTastieraSimboli<HTMLTextAreaElement>(valore, onChange);
  // Dove sta il cursore, per sapere se il pulsante della finestra va
  // spento. In stato e non letto dal DOM perché è il rendering a servirsene,
  // e il rendering il DOM non lo può interrogare.
  const [selezione, setSelezione] = useState({ inizio: 0, fine: 0 });
  // La formula da cui la finestra parte; `null` quando è chiusa.
  const [formulaAperta, setFormulaAperta] = useState<string | null>(null);
  // Acceso quando la conferma è stata rifiutata: la finestra resta aperta e
  // lo mostra. Stessa regola del gemello sui campi JME — il rifiuto non
  // richiude, perché richiudere butterebbe via il disegno.
  const [formulaRifiutata, setFormulaRifiutata] = useState(false);

  /** Ogni inserimento della barra passa di qui: inserisce con il
   * meccanismo di sempre (uno solo, nell'hook: qui non si rilegge né si
   * riscrive il cursore) e segna dove il cursore andrà a finire.
   *
   * Segnarlo serve perché quel movimento non è del docente: `onSelect`
   * scatta sui suoi gesti, non su un `setSelectionRange` fatto da noi, e
   * il pulsante della finestra resterebbe acceso proprio nell'istante
   * dopo il pulsante `\simplify{}` — che il cursore lo porta dentro le
   * graffe. */
  function inserisci(costruisci: (selezionato: string) => InserimentoNelCampo) {
    const inizio = campoRef.current?.selectionStart ?? valore.length;
    let caret = inizio;
    inserisciNelCampo((selezionato) => {
      const inserimento = costruisci(selezionato);
      caret = inizio + inserimento.offsetCaret;
      return inserimento;
    });
    setSelezione({ inizio: caret, fine: caret });
  }

  /** Avvolge ciò che è selezionato invece di sostituirlo: selezionare `x^2`
   * e chiedere una zona matematica deve dare `\(x^2\)`, non `\(\)`. Senza
   * selezione la coppia si apre vuota, col cursore fra i due delimitatori —
   * cioè dove si scriverà la formula. */
  function avvolgiSelezione(prima: string, dopo: string) {
    inserisci((selezionato) => ({
      inserisci: prima + selezionato + dopo,
      offsetCaret: selezionato ? prima.length + selezionato.length + dopo.length : prima.length,
    }));
  }

  /** Apre la finestra sulla formula selezionata (vuota, senza selezione).
   *
   * La selezione si legge dal campo e non da `selezione`: è la stessa
   * lettura che farà `inserisciNelCampo` quando la formula tornerà
   * indietro, e due letture diverse sostituirebbero un tratto di testo
   * diverso da quello che il docente ha visto nella finestra. */
  function apriFinestra() {
    const campo = campoRef.current;
    const inizio = campo?.selectionStart ?? valore.length;
    const fine = campo?.selectionEnd ?? valore.length;
    setFormulaRifiutata(false);
    setFormulaAperta(formulaNellaSelezione(valore.slice(inizio, fine)));
  }

  /** La formula confermata entra come zona matematica: dalla finestra esce
   * LaTeX nudo, e senza `\( \)` resterebbe prosa che il motore non
   * renderebbe mai. Il cursore va dopo la chiusura — si torna a scrivere
   * il testo, non a rifare la formula.
   *
   * Una finestra vuota non è una formula: inserirla darebbe `\(\)`, cioè
   * una zona matematica senza niente dentro — e, con una selezione attiva,
   * la selezione sostituita dal nulla, cioè cancellata. Si rifiuta e si
   * resta aperti, come fa il gemello sui campi JME. */
  function inserisciFormula(latex: string) {
    if (latex.trim() === "") {
      setFormulaRifiutata(true);
      return;
    }
    const zona = `\\(${latex}\\)`;
    inserisci(() => ({ inserisci: zona, offsetCaret: zona.length }));
    chiudiFinestraFormula();
  }

  function chiudiFinestraFormula() {
    setFormulaAperta(null);
    setFormulaRifiutata(false);
  }

  const idEco = `${id}-eco`;
  const haEco = valore.trim() !== "";
  const zone = zoneMatematiche(valore);
  // Un `\simplify{}` dentro una zona matematica fa lanciare KaTeX, e
  // `Formula` — che non lancia mai — ripiega sul riquadro grigio col
  // sorgente. Sotto la promessa «Come si vedrà:», quel riquadro si legge
  // come «hai sbagliato la sintassi»: non è vero, la sintassi è giusta ed è
  // l'eco a non poterla rendere, perché quel pezzo dipende dai numeri
  // sorteggiati. La nota lo dice a parole — ma solo quando quel riquadro
  // esiste davvero: un `\simplify{}` citato in mezzo a una frase resta
  // testo, e spiegare un riquadro che non c'è è rumore.
  const haSimplify = zone.some((zona) => zona.contenuto.includes("\\simplify{"));
  // I due capi della selezione, non solo il cursore: selezionare un tratto
  // che finisce dentro un `\simplify{}` e confermare una formula ne
  // cancellerebbe un pezzo.
  const cursoreInSimplify =
    dentroSimplify(valore, selezione.inizio) || dentroSimplify(valore, selezione.fine);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-base font-semibold">
        {etichetta}
      </label>

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("barra", { campo: etichetta })}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={apriFinestra}
          // Dentro un `\simplify{}` il contenuto è JME: la finestra
          // restituisce LaTeX, e inserirlo lì dentro romperebbe
          // l'espressione. Chi vuole comunque scriverla continua a
          // battere nel campo, come ha sempre fatto.
          disabled={cursoreInSimplify}
          className={CLASSE_TASTO}
        >
          {t("scriviFormula")}
        </button>

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
            onClick={() => inserisci(() => strumento)}
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
            const comando = `\\var{${nome}}`;
            inserisci(() => ({ inserisci: comando, offsetCaret: comando.length }));
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
        value={valore}
        // L'eco descrive il campo, ma non si annuncia da sola: cambia a ogni
        // tasto premuto, e un `aria-live` la farebbe leggere a voce dopo
        // ogni lettera (stessa scelta di `campo-jme.tsx`).
        aria-describedby={haEco ? idEco : undefined}
        onChange={(e) => onChange(e.target.value)}
        // Segue il cursore: è ciò che decide se il pulsante della finestra
        // è acceso. `onSelect` copre ogni gesto che lo sposta — frecce,
        // clic, battitura — e non solo le selezioni vere.
        onSelect={(e) =>
          setSelezione({
            inizio: e.currentTarget.selectionStart,
            fine: e.currentTarget.selectionEnd,
          })
        }
      />

      <FinestraFormula
        aperta={formulaAperta !== null}
        iniziale={formulaAperta ?? undefined}
        avviso={formulaRifiutata ? t("vuoto") : undefined}
        onChiudi={chiudiFinestraFormula}
        // L'ASCIIMath qui non serve: il testo dell'esercizio vuole LaTeX.
        onConferma={({ latex }) => inserisciFormula(latex)}
      />

      {haEco && (
        <div id={idEco} className="space-y-1 text-sm text-muted-foreground">
          <p>{t("comeSiVedra")}</p>
          {haSimplify && <p className="text-xs">{t("notaSimplify")}</p>}
          <div className="text-foreground">
            <MacroFormula.Provider value={MACRO_ECO}>
              <ContenutoHtml html={`<p>${escapaTesto(valore)}</p>`} />
            </MacroFormula.Provider>
          </div>
        </div>
      )}
    </div>
  );
}
