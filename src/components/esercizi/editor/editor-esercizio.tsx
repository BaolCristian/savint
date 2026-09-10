"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EsercizioEditor, ParteEditor } from "@/lib/esercizi/editor/modello";
import { PannelloVariabili } from "./pannello-variabili";
import { ParteNumerica } from "./parte-numerica";
import { ParteScelta, NESSUNA_RISPOSTA_CORRETTA } from "./parte-scelta";
import { ParteEspressione } from "./parte-espressione";
import { Anteprima } from "./anteprima";
import { ImpaginazioneEditor } from "./impaginazione";
import { SchedaCatalogo } from "./scheda-catalogo";

/** Un esercizio nuovo, vuoto: `parti: []` non è ancora valido per lo schema
 * del dominio (`esercizioEditorSchema.parti.min(1)`) — non deve esserlo qui,
 * è solo lo stato iniziale del modulo prima che il docente scriva qualcosa. */
export const ESERCIZIO_VUOTO: EsercizioEditor = {
  meta: { titolo: "", descrizione: "", anno: 1, argomento: "", tag: [], difficolta: 1 },
  testo: "",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [],
};

type TipoParte = ParteEditor["tipo"];
const TIPI_PARTE: TipoParte[] = ["numerica", "scelta", "espressione"];

function parteVuota(tipo: TipoParte): ParteEditor {
  switch (tipo) {
    case "numerica":
      return { tipo: "numerica", consegna: "", punti: 1, valore: "", tolleranza: { tipo: "esatta" } };
    case "scelta":
      return { tipo: "scelta", consegna: "", punti: 1, risposte: ["", ""], indiceGiusta: 0 };
    case "espressione":
      return { tipo: "espressione", consegna: "", punti: 1, risposta: "" };
  }
}

/** Il corpo di un rifiuto delle rotte di redazione, così com'è definito lì
 * (vedi src/app/api/esercizi/redazione/*): `error` è il `motivo` di
 * `EsitoRedazione`, `dettaglio` è l'`EsitoVerifica` per `verifica_fallita`
 * (seme, fase, messaggio) o una stringa per ogni altro motivo. */
interface CorpoRifiuto {
  error?: string;
  dettaglio?: unknown;
}

function eDettaglioVerifica(v: unknown): v is { seme: number; fase: string; messaggio: string } {
  return typeof v === "object" && v !== null && "seme" in v && "fase" in v && "messaggio" in v;
}

/** Il dettaglio di un rifiuto, mostrato per intero: quando è la verifica a
 * venti semi a rifiutare, il seme è la sola informazione che permette a un
 * docente di riprodurre il difetto — appiattirla su un messaggio generico
 * sarebbe sprecare l'unica cosa preziosa che il sistema sa (vedi il brief).
 * Ogni altro rifiuto ha invece un messaggio dedicato, tradotto: mai il testo
 * grezzo che arriva dal server (in italiano fisso, vedi `redazione.ts`),
 * che romperebbe la localizzazione della pagina in inglese. */
function DettaglioRifiuto({ corpo }: { corpo: CorpoRifiuto }) {
  const t = useTranslations("esercizi.redazione");

  if (corpo.error === "verifica_fallita" && eDettaglioVerifica(corpo.dettaglio)) {
    const { seme, fase, messaggio } = corpo.dettaglio;
    const faseTradotta =
      fase === "testo" ? t("erroreVerifica.faseTesto")
      : fase === "caricamento" ? t("erroreVerifica.faseCaricamento")
      : fase === "risposta" ? t("erroreVerifica.faseRisposta")
      : fase;
    return (
      <div role="alert" className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
        <p className="font-medium text-destructive">{t("erroreVerifica.titolo")}</p>
        <p>
          <strong>{t("erroreVerifica.seme")}:</strong> <span data-seme>{seme}</span> —{" "}
          <strong>{t("erroreVerifica.fase")}:</strong> <span data-fase>{faseTradotta}</span>
        </p>
        <p>{messaggio}</p>
      </div>
    );
  }

  const messaggio =
    corpo.error === "non_trovato" ? t("erroreSalvataggio.nonTrovato")
    : corpo.error === "non_rappresentabile" ? t("erroreSalvataggio.nonRappresentabile")
    : corpo.error === "versione_in_conflitto" ? t("erroreSalvataggio.versioneInConflitto")
    : t("erroreSalvataggio.generico");
  return (
    <p role="alert" className="text-sm text-destructive">
      {messaggio}
    </p>
  );
}

export interface EditorEsercizioProps {
  /** L'esercizio da modificare, così com'è arrivato da `caricaPerEditor`; assente per un esercizio nuovo. */
  valoreIniziale?: EsercizioEditor;
  /** Presente per un esercizio esistente: il salvataggio chiama PUT sulla
   * sua rotta invece di POST su quella di creazione. */
  esercizioId?: string;
  /** Chiamata dopo un salvataggio riuscito, con l'id e la versione appena
   * scritta — tipicamente per navigare altrove. Opzionale: il modulo resta
   * comunque utilizzabile da solo, mostrando la conferma in pagina. */
  onSalvato?: (esito: { esercizioId: string; versione: number }) => void;
}

/** Il modulo di redazione per intero: metadati, testo, variabili (Task 6),
 * le tre parti e l'anteprima (Task 7), salva e controlla. */
export function EditorEsercizio({ valoreIniziale, esercizioId, onSalvato }: EditorEsercizioProps) {
  const t = useTranslations("esercizi.redazione");
  const [editor, setEditor] = useState<EsercizioEditor>(valoreIniziale ?? ESERCIZIO_VUOTO);
  const [nuovoTipoParte, setNuovoTipoParte] = useState<TipoParte>("numerica");

  const [salvando, setSalvando] = useState(false);
  const [salvatoOk, setSalvatoOk] = useState(false);
  const [rifiutoSalvataggio, setRifiutoSalvataggio] = useState<CorpoRifiuto | null>(null);

  const [verificando, setVerificando] = useState(false);
  const [rifiutoVerifica, setRifiutoVerifica] = useState<CorpoRifiuto | null>(null);
  const [verificaOk, setVerificaOk] = useState(false);

  // I7 dell'onda di correzioni: nessuno stato "sporco", nessun `beforeunload`
  // — il modulo di redazione non avvertiva mai di modifiche non salvate
  // prima di uscire. `modificato` è vero dalla prima modifica del modello
  // fino al successivo salvataggio riuscito (mai svuotato da "controlla",
  // che non scrive nulla): è la base sia dell'avviso `beforeunload` sia
  // della conferma su un clic fuori dal modulo, entrambi più sotto.
  const [modificato, setModificato] = useState(false);

  // I3 dell'onda di correzioni: `verificaOk`/`salvatoOk` (sopra) venivano
  // azzerati solo quando la PROSSIMA azione partiva ("controlla"/"salva"),
  // mai quando il modello cambiava — un "nessun problema nei venti semi" o
  // uno "salvato" restavano a schermo anche dopo una modifica che li aveva
  // già resi falsi. Ogni `setEditor` del modulo passa quindi da qui, mai da
  // una chiamata diretta: azzera insieme le due rassicurazioni verdi e marca
  // il modulo come sporco, nello stesso istante in cui il modello cambia
  // davvero — non al prossimo giro di "controlla" o "salva".
  function mutaEditor(updater: (e: EsercizioEditor) => EsercizioEditor) {
    setSalvatoOk(false);
    setVerificaOk(false);
    setModificato(true);
    setEditor(updater);
  }

  // I6 dell'onda di correzioni (la parte che tocca l'interfaccia): il seme
  // su cui la verifica a venti semi — o il salvataggio, che corre la stessa
  // verifica prima di scrivere — ha rifiutato l'esercizio, quando il
  // rifiuto ancora in vista ne porta uno. È l'unica informazione che il
  // docente non può riprodurre da solo (l'anteprima genera sempre semi
  // casuali, senza modo di inserirne uno): passato all'anteprima qui sotto,
  // che lo mostra davvero invece di lasciarlo un numero da inoltrare a uno
  // sviluppatore.
  const rifiutoAttivo = rifiutoVerifica ?? rifiutoSalvataggio;
  const semeInEvidenza =
    rifiutoAttivo && rifiutoAttivo.error === "verifica_fallita" && eDettaglioVerifica(rifiutoAttivo.dettaglio)
      ? rifiutoAttivo.dettaglio.seme
      : undefined;

  // Sempre I6: l'alert del rifiuto è l'ultimo elemento della pagina, sotto i
  // tre riquadri di anteprima — a 1440×1000 (misurato dalla revisione) resta
  // fuori dallo schermo dopo "controlla". Porta lo scroll e il focus sul suo
  // contenitore ogni volta che un rifiuto compare, invece di lasciare che il
  // docente lo scopra scrollando a caso. `tabIndex={-1}` sul contenitore
  // (nel JSX più sotto) è ciò che rende `.focus()` valido su un elemento non
  // interattivo.
  const rifiutoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!rifiutoVerifica && !rifiutoSalvataggio) return;
    const nodo = rifiutoRef.current;
    if (!nodo) return;
    if (typeof nodo.scrollIntoView === "function") {
      nodo.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    nodo.focus();
  }, [rifiutoVerifica, rifiutoSalvataggio]);

  // I7: il caso più semplice di modifiche non salvate — chiudere la scheda,
  // ricaricare, digitare un altro URL. Il testo passato a `returnValue` non
  // è quello che il browser mostra davvero (ogni browser moderno mostra un
  // proprio messaggio generico, ignorando questo): serve solo, insieme a
  // `preventDefault`, a far comparire IL dialogo nativo.
  useEffect(() => {
    function alPrimaDiUscire(e: BeforeUnloadEvent) {
      if (!modificato) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", alPrimaDiUscire);
    return () => window.removeEventListener("beforeunload", alPrimaDiUscire);
  }, [modificato]);

  // I7: il caso che il rapporto della revisione nomina per nome — la
  // sidebar e "Torna alla redazione" sono entrambi un `<Link>` di Next.js,
  // cioè una navigazione client-side che non scarica mai la pagina: nessun
  // `beforeunload` la vede (quell'evento esiste solo per una navigazione
  // vera del browser). Un ascoltatore sulla fase di cattura di `document`,
  // registrato qui e mai su un file di layout condiviso, intercetta il clic
  // PRIMA che l'handler di Next.js (in fase di bubbling) lo consumi:
  // se il docente annulla la conferma, `stopImmediatePropagation` impedisce
  // sia il comportamento nativo dell'ancora sia quello di Next.js. Ignora
  // deliberatamente un'ancora `#…`, un download, un `target="_blank"` (non
  // si lascia la scheda corrente) o un clic con tasto modificatore (li vuole
  // gestire il browser, non questo modulo) — lo stesso perimetro con cui
  // Next.js stesso decide se intercettare un clic.
  useEffect(() => {
    function alClicSuUnLink(e: MouseEvent) {
      if (!modificato) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href") ?? "";
      if (href.startsWith("#") || link.target === "_blank" || link.hasAttribute("download")) return;
      if (!window.confirm(t("confermaUscita"))) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }
    document.addEventListener("click", alClicSuUnLink, true);
    return () => document.removeEventListener("click", alClicSuUnLink, true);
  }, [modificato, t]);

  // Giro di correzioni 1: qui, non dentro `ParteScelta`, perché è questo il
  // componente che salva. Uno stato "manca una scelta" che vive solo dentro
  // la parte non può mai bloccare nulla — il salvataggio non lo vede. La
  // fonte di verità è il modello stesso: `ParteScelta` scrive la sentinella
  // `NESSUNA_RISPOSTA_CORRETTA` in `indiceGiusta` quando la risposta
  // segnata come corretta viene rimossa (vedi parte-scelta.tsx), e finché
  // resta lì "salva" (e "controlla", che manderebbe comunque un
  // `indiceGiusta` fuori dai vincoli dello schema del dominio) restano
  // disabilitati — mai solo un avviso accanto a un pulsante che funziona lo
  // stesso.
  const sceltaMancante = editor.parti.some(
    (p) => p.tipo === "scelta" && p.indiceGiusta === NESSUNA_RISPOSTA_CORRETTA,
  );

  function aggiornaMeta<K extends keyof EsercizioEditor["meta"]>(campo: K, valore: EsercizioEditor["meta"][K]) {
    mutaEditor((e) => ({ ...e, meta: { ...e.meta, [campo]: valore } }));
  }

  function aggiornaParte(indice: number, parte: ParteEditor) {
    mutaEditor((e) => ({ ...e, parti: e.parti.map((p, i) => (i === indice ? parte : p)) }));
  }

  function rimuoviParte(indice: number) {
    mutaEditor((e) => ({ ...e, parti: e.parti.filter((_, i) => i !== indice) }));
  }

  function aggiungiParte() {
    mutaEditor((e) => ({ ...e, parti: [...e.parti, parteVuota(nuovoTipoParte)] }));
  }

  async function salva() {
    setSalvando(true);
    setSalvatoOk(false);
    setRifiutoSalvataggio(null);
    try {
      const url = esercizioId ? `/api/esercizi/redazione/${esercizioId}` : "/api/esercizi/redazione";
      const res = await fetch(url, {
        method: esercizioId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editor }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as CorpoRifiuto;
        setRifiutoSalvataggio(corpo);
        return;
      }
      const corpo = (await res.json()) as { esercizioId: string; versione: number };
      setSalvatoOk(true);
      // I7: un salvataggio riuscito è l'unico momento in cui "sporco" torna
      // falso — "controlla" (sopra) non scrive nulla, quindi non lo tocca.
      setModificato(false);
      onSalvato?.(corpo);
    } finally {
      setSalvando(false);
    }
  }

  async function verifica() {
    setVerificando(true);
    setVerificaOk(false);
    setRifiutoVerifica(null);
    try {
      const res = await fetch("/api/esercizi/redazione/verifica", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ editor }),
      });
      if (!res.ok) {
        const corpo = (await res.json().catch(() => ({}))) as CorpoRifiuto;
        setRifiutoVerifica(corpo);
        return;
      }
      setVerificaOk(true);
    } finally {
      setVerificando(false);
    }
  }

  return (
    <ImpaginazioneEditor
      // L'intestazione porta il titolo dell'esercizio (l'unico metadato che
      // si scrive mentre si pensa all'esercizio: resta fuori dalla scheda
      // di catalogo) e la scheda stessa, ripiegata. Sta sopra le due
      // colonne, non dentro la scrittura: nell'ordine del documento precede
      // sia la scrittura sia la visione, in ogni larghezza.
      intestazione={
        <>
          <h1 className="text-xl font-semibold">{t("titolo")}</h1>

          <div className="flex flex-col gap-1">
            <label htmlFor="redazione-titolo" className="text-xs font-medium text-muted-foreground">
              {t("meta.titolo")}
            </label>
            <Input
              id="redazione-titolo"
              value={editor.meta.titolo}
              onChange={(e) => aggiornaMeta("titolo", e.target.value)}
            />
          </div>

          <SchedaCatalogo
            meta={editor.meta}
            onChange={(campo, valore) => mutaEditor((e) => ({ ...e, meta: { ...e.meta, [campo]: valore } }))}
          />
        </>
      }
      // La colonna sinistra, nell'ordine del piano: testo, suggerimento,
      // variabili, domande (il titolo è già nell'intestazione, non qui).
      scrittura={
        <>
          <div className="space-y-2 rounded-lg border bg-card p-4">
            <label htmlFor="redazione-testo" className="text-base font-semibold">
              {t("testo")}
            </label>
            <Textarea
              id="redazione-testo"
              value={editor.testo}
              onChange={(e) => mutaEditor((ed) => ({ ...ed, testo: e.target.value }))}
            />
          </div>

          <div className="space-y-2 rounded-lg border bg-card p-4">
            <label htmlFor="redazione-suggerimento" className="text-base font-semibold">
              {t("suggerimento")}
            </label>
            <Textarea
              id="redazione-suggerimento"
              value={editor.suggerimento}
              onChange={(e) => mutaEditor((ed) => ({ ...ed, suggerimento: e.target.value }))}
            />
            <p className="text-xs text-muted-foreground">{t("suggerimentoAiuto")}</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <PannelloVariabili
              variabili={editor.variabili}
              onChange={(variabili) => mutaEditor((ed) => ({ ...ed, variabili }))}
              condizione={editor.condizione}
              onChangeCondizione={(condizione) => mutaEditor((ed) => ({ ...ed, condizione }))}
            />
          </div>

          <section className="space-y-3 rounded-lg border bg-card p-4">
            <h2 className="text-base font-semibold">{t("parti.titolo")}</h2>

            <div className="space-y-4">
              {editor.parti.map((parte, i) => (
                // `numeroParte` (Task 6/7): tradotto in entrambe le lingue ma
                // rimasto inutilizzato — un esercizio con più parti non mostrava
                // nessuna etichetta "Parte N" oltre all'ordine nel DOM
                // (correzione riportata dalla revisione del task precedente).
                <div key={i} className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{t("parti.numeroParte", { numero: i + 1 })}</h3>
                  {parte.tipo === "numerica" ? (
                    <ParteNumerica parte={parte} onChange={(p) => aggiornaParte(i, p)} onRimuovi={() => rimuoviParte(i)} />
                  ) : parte.tipo === "scelta" ? (
                    <ParteScelta parte={parte} onChange={(p) => aggiornaParte(i, p)} onRimuovi={() => rimuoviParte(i)} />
                  ) : (
                    <ParteEspressione parte={parte} onChange={(p) => aggiornaParte(i, p)} onRimuovi={() => rimuoviParte(i)} />
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="redazione-nuovo-tipo-parte" className="text-xs font-medium text-muted-foreground">
                  {t("parti.tipo")}
                </label>
                <select
                  id="redazione-nuovo-tipo-parte"
                  value={nuovoTipoParte}
                  onChange={(e) => setNuovoTipoParte(e.target.value as TipoParte)}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  {TIPI_PARTE.map((tipo) => (
                    <option key={tipo} value={tipo}>
                      {t(`parti.tipo${tipo === "numerica" ? "Numerica" : tipo === "scelta" ? "Scelta" : "Espressione"}`)}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" variant="outline" onClick={aggiungiParte}>
                {t("parti.aggiungi")}
              </Button>
            </div>
          </section>
        </>
      }
      // La colonna destra: l'anteprima, e subito accanto a lei il dettaglio
      // di un eventuale rifiuto — racconta la stessa storia del riquadro
      // evidenziato nell'anteprima (stesso seme), non i pulsanti che l'hanno
      // prodotto. Vive in una regione distinta dalla scrittura e precede
      // sempre la barra delle azioni nell'ordine del documento.
      visione={
        <>
          <Anteprima editor={editor} locale="it" semeRifiuto={semeInEvidenza} />

          {(rifiutoVerifica || rifiutoSalvataggio) && (
            // I6: contenitore che riceve scroll e focus (vedi l'effetto sopra) —
            // `tabIndex={-1}` lo rende un bersaglio valido per `.focus()` pur
            // restando fuori dall'ordine di tabulazione normale.
            <div ref={rifiutoRef} tabIndex={-1}>
              {rifiutoVerifica && <DettaglioRifiuto corpo={rifiutoVerifica} />}
              {rifiutoSalvataggio && <DettaglioRifiuto corpo={rifiutoSalvataggio} />}
            </div>
          )}
        </>
      }
      // La barra fissa in fondo: i due pulsanti, lo stato di salvataggio, e
      // l'unico avviso abbastanza corto (una riga) da restare qui accanto ai
      // pulsanti che blocca — non il dettaglio del rifiuto, che è nella
      // visione.
      azioni={
        <section className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={verifica} disabled={verificando || sceltaMancante}>
            {verificando ? t("verificaInCorso") : t("verifica")}
          </Button>
          <Button type="button" onClick={salva} disabled={salvando || sceltaMancante}>
            {salvando ? t("salvataggioInCorso") : t("salva")}
          </Button>
          {salvatoOk && <span className="text-sm text-brand-green">{t("salvato")}</span>}
          {verificaOk && <span className="text-sm text-brand-green">{t("verificaOk")}</span>}
          {sceltaMancante && (
            <p role="alert" className="w-full text-sm text-destructive">
              {t("salvataggioBloccatoScelta")}
            </p>
          )}
        </section>
      }
    />
  );
}
