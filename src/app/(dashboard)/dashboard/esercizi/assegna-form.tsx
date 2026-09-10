"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface ClasseOpzione {
  id: string;
  name: string;
  /** `null` per una classe creata a mano senza anno (crea-classe-form.tsx)
   * o sincronizzata da un gruppo Google il cui nome non ne porta uno
   * riconoscibile — l'unico caso in cui questo modulo chiede l'anno
   * (design doc, "Come si assegna"): "la 2A vuole esercizi del secondo
   * anno, e chiederlo sarebbe chiedere una cosa che sappiamo". */
  yearLevel: number | null;
}

/** Un esercizio del bacino, per scegliere un candidato da mostrare in
 * anteprima (vedi `candidatoAnteprima` più sotto): non deriva da
 * `quantiCorrispondono` (che dà solo un numero) ma da `elencoRedazione`
 * (redazione.ts), già filtrato dalla pagina server a chi ha una versione
 * — la stessa cosa che `caricaPerAnteprima` esige per non mostrare "nessuna
 * versione salvata" al primo tentativo. */
export interface CandidatoAnteprima {
  id: string;
  argomento: string;
  anno: number;
}

interface ArgomentoOpzione {
  argomento: string;
  quanti: number;
}

interface DettaglioCapienza {
  contenitore: string;
  richiesti: number;
  disponibili: number;
}

/** "Quanti esercizi corrispondono" (GET /api/esercizi/argomenti con
 * `argomento`) ha un tetto di rete alto apposta perché la specifica lo
 * vuole richiamato mentre il docente sceglie filtro dopo filtro — vedi il
 * commento sopra al rate limit nella rotta. Ma richiamarlo a OGNI singolo
 * cambiamento di stato (ogni tocco di un select, ogni cifra scritta)
 * lo martellerebbe comunque senza guadagnarci niente: il numero che conta
 * per il docente è quello dell'ULTIMA combinazione di filtri, non quelli
 * intermedi attraversati mentre decide. 400ms: abbastanza perché due scelte
 * ravvicinate (difficoltà, poi un argomento diverso) confluiscano in una
 * sola richiesta, abbastanza poco perché il numero sotto i filtri non
 * sembri in ritardo rispetto alla scelta appena fatta. */
const DEBOUNCE_CONTEGGIO_MS = 400;

function costruisciQuery(parametri: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [chiave, valore] of Object.entries(parametri)) {
    if (valore !== undefined && valore !== "") query.set(chiave, valore);
  }
  return query.toString();
}

/** Il rifiuto di `assegnaDiretto` che conta di più (brief del task):
 * `esercizi_insufficienti` porta `dettaglio.contenitore` (che per una
 * regola a filtro è l'ARGOMENTO, non un nome di raccolta — vedi il
 * commento su `etichettaRegola` nella rotta), `richiesti` e `disponibili`.
 * Appiattirlo su un messaggio generico perderebbe il lavoro che il dominio
 * e la rotta hanno già fatto per produrlo — lo stesso principio di
 * `compito-form.tsx` per l'assegnazione da raccolta. */
function messaggioErrore(
  t: ReturnType<typeof useTranslations>,
  corpo: { error?: string; dettaglio?: DettaglioCapienza },
): string {
  if (corpo.error === "esercizi_insufficienti" && corpo.dettaglio) {
    return t("erroreCapienza", {
      argomento: corpo.dettaglio.contenitore,
      richiesti: corpo.dettaglio.richiesti,
      disponibili: corpo.dettaglio.disponibili,
    });
  }
  if (corpo.error === "non_insegni_questa_classe") return t("erroreNonInsegni");
  if (corpo.error === "classe_non_trovata") return t("erroreClasseNonTrovata");
  if (corpo.error === "classe_senza_anno") return t("erroreClasseSenzaAnno");
  if (corpo.error === "scadenza_prima_apertura") return t("erroreScadenzaPrimaApertura");
  if (corpo.error === "scadenza_nel_passato") return t("erroreScadenzaPassata");
  if (corpo.error === "rate_limited") return t("erroreRateLimited");
  return t("erroreGenerico");
}

/** Il modulo di assegnazione diretta (Task 5, docente-via-veloce): classe,
 * argomento, quanti, entro quando, difficoltà — un solo schermo al posto
 * dei cinque che c'erano prima (classe dichiarata, esercizio scritto o
 * raccolto, contenitore riempito, batteria composta, e solo allora
 * assegnata). Chiama `POST /api/esercizi/compiti/diretto` (Task 3): quella
 * rotta crea una batteria automatica con una sola regola a filtro e delega
 * interamente ad `assegna` — stessa pesca, stesso congelamento, stesso
 * controllo di capienza di sempre, non un secondo percorso.
 *
 * L'anno non è mai un campo che il docente compila normalmente: viene
 * dalla classe scelta (`classeSelezionata.yearLevel`). Il campo `anno`
 * qui sotto compare SOLO quando quella classe non ne ha uno — l'unico
 * momento in cui la specifica lo prevede. */
export function AssegnaForm({ classi, candidati }: { classi: ClasseOpzione[]; candidati: CandidatoAnteprima[] }) {
  const t = useTranslations("esercizi.assegnaForm");
  const router = useRouter();

  const [classeId, setClasseId] = useState(classi[0]?.id ?? "");
  const [annoManuale, setAnnoManuale] = useState("");
  const [argomento, setArgomento] = useState("");
  const [argomentiOpzioni, setArgomentiOpzioni] = useState<ArgomentoOpzione[]>([]);
  const [quanti, setQuanti] = useState("");
  const [difficoltaMax, setDifficoltaMax] = useState("");
  const [opensAt, setOpensAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [corrispondenti, setCorrispondenti] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState<"ok" | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  const classeSelezionata = classi.find((c) => c.id === classeId);
  const mostraAnno = classeSelezionata != null && classeSelezionata.yearLevel == null;
  const annoRisolto = classeSelezionata?.yearLevel ?? (annoManuale ? Number(annoManuale) : undefined);

  // Effetto 1: l'elenco degli argomenti fra cui scegliere (GET senza
  // `argomento`). Dipende dalla classe e, solo quando quella classe non
  // porta un anno, da quello scritto a mano. Un cambio di classe (o di
  // anno manuale) è un evento discreto — una scelta in un campo, non una
  // sequenza di tasti — quindi nessun debounce qui: solo il conteggio
  // sotto (effetto 2) ne ha bisogno, come chiede il brief.
  useEffect(() => {
    // Niente `setState` sincrono qui: senza classe o senza anno non c'e'
    // nulla da chiedere, e l'elenco si DERIVA vuoto piu' sotto
    // (`opzioniVisibili`) invece di essere azzerato dentro l'effetto. Il
    // compilatore React lo vieta perche' innesca un secondo render a
    // catena, e su questa superficie il lint blocca la CI.
    if (classeId === "" || annoRisolto == null) return;
    let annullato = false;
    const query = costruisciQuery({ classeId, anno: mostraAnno ? String(annoRisolto) : undefined });
    fetch(`/api/esercizi/argomenti?${query}`)
      .then((res) => (res.ok ? (res.json() as Promise<ArgomentoOpzione[]>) : Promise.reject(res)))
      .then((elenco) => {
        if (annullato) return;
        setArgomentiOpzioni(elenco);
        setArgomento((corrente) => (elenco.some((o) => o.argomento === corrente) ? corrente : (elenco[0]?.argomento ?? "")));
      })
      .catch(() => {
        if (!annullato) setArgomentiOpzioni([]);
      });
    return () => {
      annullato = true;
    };
  }, [classeId, annoRisolto, mostraAnno]);

  // Effetto 2: "quanti esercizi corrispondono" (GET con `argomento`) — LA
  // chiamata debounced di cui parla il brief. Aspetta DEBOUNCE_CONTEGGIO_MS
  // di silenzio sui filtri che contano (argomento, difficoltà, anno) prima
  // di partire: un cambio ulteriore prima che scada annulla e riparte,
  // così arriva sempre e solo una richiesta per l'ULTIMA combinazione di
  // filtri, mai una per ognuna di quelle attraversate nel mezzo.
  useEffect(() => {
    // Come sopra: senza argomento non si conta niente, e il valore si
    // deriva nullo (`corrispondentiVisibili`) invece di azzerarlo qui.
    if (argomento === "" || annoRisolto == null) return;
    let annullato = false;
    const timer = setTimeout(() => {
      const query = costruisciQuery({
        classeId,
        argomento,
        difficoltaMax: difficoltaMax || undefined,
        anno: mostraAnno ? String(annoRisolto) : undefined,
      });
      fetch(`/api/esercizi/argomenti?${query}`)
        .then((res) => (res.ok ? (res.json() as Promise<{ quanti: number }>) : Promise.reject(res)))
        .then((corpo) => {
          if (!annullato) setCorrispondenti(corpo.quanti);
        })
        .catch(() => {
          // Un errore isolato (rete, rate limit) non deve far sparire
          // l'ultimo conteggio buono: resta quello che c'era.
        });
    }, DEBOUNCE_CONTEGGIO_MS);
    return () => {
      annullato = true;
      clearTimeout(timer);
    };
  }, [classeId, argomento, difficoltaMax, annoRisolto, mostraAnno]);

  // Un esercizio qualunque, fra quelli con l'argomento e l'anno scelti, per
  // linkare all'anteprima vera (`/dashboard/esercizi/anteprima/[id]`, già
  // costruita): quella pagina monta il player reale in modalità locale —
  // nessun tentativo creato, garanzia già provata in
  // anteprima-docente-client.test.tsx, non ripetuta qui. Non è filtrato
  // per difficoltà (quel dato non è nell'elenco che la pagina passa): è
  // un'anteprima illustrativa, non l'esercizio esatto che la pesca vera
  // sorteggerebbe.
  const candidatoAnteprima = candidati.find((c) => c.argomento === argomento && c.anno === annoRisolto);

  function selezionaClasse(id: string) {
    setClasseId(id);
    setAnnoManuale("");
  }

  async function assegna(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrore(null);
    setEsito(null);
    const res = await fetch("/api/esercizi/compiti/diretto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        classeId,
        argomento,
        quanti: Number(quanti),
        ...(difficoltaMax ? { difficoltaMax: Number(difficoltaMax) } : {}),
        ...(mostraAnno && annoManuale ? { anno: Number(annoManuale) } : {}),
        ...(opensAt ? { opensAt: new Date(opensAt).toISOString() } : {}),
        ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const corpo = await res.json().catch(() => ({}));
      setErrore(messaggioErrore(t, corpo));
      return;
    }
    setEsito("ok");
    router.refresh();
  }

  const quantiValide = Number(quanti) > 0 && Number.isInteger(Number(quanti));
  const invioBloccato = busy || classeId === "" || argomento === "" || !quantiValide || (mostraAnno && annoManuale === "");

  // Derivati, non azzerati dentro gli effetti (vedi i commenti la sopra):
  // senza classe o senza anno non c'e un elenco da mostrare, senza argomento
  // non c'e un conteggio. Derivarli, oltre a togliere il setState sincrono
  // che il compilatore React vieta, impedisce che il valore resti indietro
  // di un render rispetto ai filtri appena scelti.
  const opzioniVisibili = classeId === "" || annoRisolto == null ? [] : argomentiOpzioni;
  const corrispondentiVisibili = argomento === "" || annoRisolto == null ? null : corrispondenti;

  // Senza classi dichiarate non c'e' niente da assegnare, e il modulo
  // diventava un guscio: tendina vuota, bottone spento, un messaggio che
  // incolpava una classe inesistente, e nemmeno una chiamata di rete —
  // quindi non si leggeva nemmeno come "sto caricando". E' la prima cosa
  // che vede una scuola nuova, nel riquadro piu' grande della pagina: alla
  // lettera la lamentela da cui e' nata questa ristrutturazione. La frase
  // che lo spiega esisteva in entrambe le lingue e non era collegata a
  // niente. Qui e' collegata, e porta DOVE si risolve invece di limitarsi a
  // constatare.
  if (classi.length === 0) {
    return (
      <div className="rounded-xl border border-input p-4 text-sm">
        <p className="text-muted-foreground">{t("nessunaClasseInsegnata")}</p>
        <Link
          href="/dashboard/esercizi/classi"
          className="mt-2 inline-block font-medium text-brand-blue hover:underline"
        >
          {t("vaiAlleClassi")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={assegna} className="flex flex-col gap-4 rounded-xl border border-input p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="assegna-classe" className="text-sm font-medium">
            {t("classe")}
          </label>
          <select
            id="assegna-classe"
            value={classeId}
            onChange={(e) => selezionaClasse(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {classi.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {mostraAnno && (
          <div className="flex flex-col gap-1">
            <label htmlFor="assegna-anno" className="text-sm font-medium">
              {t("anno")}
            </label>
            <Input
              id="assegna-anno"
              type="number"
              min={1}
              max={5}
              value={annoManuale}
              onChange={(e) => setAnnoManuale(e.target.value)}
              className="w-20"
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="assegna-argomento" className="text-sm font-medium">
            {t("argomento")}
          </label>
          <select
            id="assegna-argomento"
            value={argomento}
            onChange={(e) => setArgomento(e.target.value)}
            disabled={opzioniVisibili.length === 0}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {opzioniVisibili.length === 0 ? (
              <option value="">{t("nessunArgomentoDisponibile")}</option>
            ) : (
              opzioniVisibili.map((o) => (
                <option key={o.argomento} value={o.argomento}>
                  {t("argomentoOpzione", { argomento: o.argomento, quanti: o.quanti })}
                </option>
              ))
            )}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="assegna-quanti" className="text-sm font-medium">
            {t("quanti")}
          </label>
          <Input
            id="assegna-quanti"
            type="number"
            min={1}
            value={quanti}
            onChange={(e) => setQuanti(e.target.value)}
            className="w-20"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="assegna-difficolta" className="text-sm font-medium">
            {t("difficolta")}
          </label>
          <select
            id="assegna-difficolta"
            value={difficoltaMax}
            onChange={(e) => setDifficoltaMax(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">{t("difficoltaQualsiasi")}</option>
            <option value="1">{t("difficolta1")}</option>
            <option value="2">{t("difficolta2")}</option>
            <option value="3">{t("difficolta3")}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="assegna-apertura" className="text-sm font-medium">
            {t("apertura")}
          </label>
          <Input id="assegna-apertura" type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} className="w-40" />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="assegna-scadenza" className="text-sm font-medium">
            {t("scadenza")}
          </label>
          <Input id="assegna-scadenza" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="w-40" />
        </div>

        <Button type="submit" disabled={invioBloccato}>
          {t("assegna")}
        </Button>
      </div>

      {mostraAnno && <p className="text-xs text-muted-foreground">{t("annoAiuto")}</p>}

      {/* "Sotto i filtri, quanti esercizi corrispondono" (design doc): qui,
          non altrove — è l'informazione che evita di chiedere dieci
          esercizi dove ce ne sono quattro, mostrata PRIMA di un eventuale
          rifiuto, non al posto suo (il rifiuto per capienza resta un
          errore server-side qui sotto, col suo stesso dettaglio). */}
      {argomento !== "" && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <p className="text-muted-foreground">{corrispondentiVisibili === null ? t("calcolando") : t("corrispondenti", { quanti: corrispondentiVisibili })}</p>
          {candidatoAnteprima && (
            <Link href={`/dashboard/esercizi/anteprima/${candidatoAnteprima.id}`} className="text-brand-blue hover:underline">
              {t("anteprima")}
            </Link>
          )}
        </div>
      )}

      {esito === "ok" && <span className="text-sm text-brand-green">{t("assegnato")}</span>}
      {/* role="alert": lo legge chi usa uno screen reader senza doverlo
          cercare, ed e' il solo modo per una prova di distinguere QUESTO
          messaggio dal resto del testo — il nome dell'argomento compare
          anche nel menu ("Equazioni — 4"), e una ricerca per testo
          prendeva quello. */}
      {errore && (
        <span role="alert" className="text-sm text-destructive">
          {errore}
        </span>
      )}
    </form>
  );
}
