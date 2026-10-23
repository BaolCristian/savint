"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, Folder, Hand, Plus, RefreshCw, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AnteprimaCompito } from "@/components/esercizi/compito/anteprima-compito";
import { withBasePath } from "@/lib/base-path";
import type { Blocco, Riepilogo } from "@/lib/esercizi/estrazione";

export type ClasseOpzione = { id: string; nome: string; anno: number | null };
export type ArgomentoOpzione = { argomento: string; quanti: number };
export type RaccoltaOpzione = { id: string; nome: string; esercizi: number };
export type EsercizioOpzione = { id: string; titolo: string; argomento: string; anno: number };

export type NuovoCompitoProps = {
  classi: ClasseOpzione[];
  /** Gli argomenti con quanti esercizi visibili ciascuno, per anno
   * (`argomentiDisponibili`): il menu "+ Aggiungi da un argomento" mostra
   * quelli dell'anno della classe scelta. Chiave: l'anno come stringa. */
  argomentiPerAnno: Record<string, ArgomentoOpzione[]>;
  raccolte: RaccoltaOpzione[];
  /** Il catalogo di "+ scegli esercizi" (`eserciziAssegnabili`). */
  catalogo: EsercizioOpzione[];
  /** La precompilazione dai parametri della pagina (`?classe=&raccolta=…`). */
  iniziale: { classeId: string; blocchi: Blocco[]; modello: { id: string; nome: string } | null };
  /** Il primo seme viene dal server: lo stesso HTML lato server e lato
   * client, e una prova può conoscerlo. */
  semeIniziale: string;
  locale: "it" | "en";
};

type Modo = "CLASSE" | "STUDENTE";

/** Un blocco come lo maneggia la pagina: il `quanti` resta il testo del
 * campo (un campo svuotato mentre il docente riscrive il numero non deve
 * diventare 0 né tornare indietro da solo); `chiave` per React. */
type BloccoUI =
  | { chiave: string; tipo: "argomento"; argomento: string; anno?: number; difficoltaMax?: number; quanti: string }
  | { chiave: string; tipo: "raccolta"; contenitoreId: string; quanti: string }
  | { chiave: string; tipo: "scelti"; esercizioIds: string[] };

/** Il risultato dell'ultima richiesta di riepilogo, con la chiave (il corpo
 * della richiesta) a cui risponde: un riepilogo vale solo se la sua chiave
 * è quella dei blocchi di ADESSO — è ciò che impedisce di assegnare, con le
 * versioni viste di prima, dei blocchi appena cambiati. */
type Risultato = { chiave: string; tipi: Blocco["tipo"][] } & ({ riepilogo: Riepilogo } | { errore: string });

const QUANTI_MAX = 100;
const QUANTI_PREDEFINITO = 5;
const DEBOUNCE_MS = 400;
const RISULTATI_MAX = 20;
const NOME_MAX = 120;

function nuovoSeme(): string {
  return Math.random().toString(36).slice(2, 12);
}

let contatoreChiavi = 0;
function nuovaChiave(): string {
  contatoreChiavi += 1;
  return `b${contatoreChiavi}`;
}

/** Quanti prenderne di default da un bacino di `disponibili`: cinque, o
 * tutti se sono meno — mai un blocco che nasce già insufficiente. */
function quantiPredefinito(disponibili: number | undefined): string {
  return String(Math.max(1, Math.min(QUANTI_PREDEFINITO, disponibili ?? QUANTI_PREDEFINITO)));
}

function versoUI(b: Blocco): BloccoUI {
  if (b.tipo === "scelti") return { ...b, esercizioIds: [...b.esercizioIds], chiave: nuovaChiave() };
  return { ...b, quanti: String(b.quanti), chiave: nuovaChiave() };
}

/** Il blocco da mandare al server, o `null` se il suo numero non è valido
 * (vuoto, non intero, fuori da 1–100: i limiti di `blocchi-corpo.ts`). */
function versoBlocco(b: BloccoUI): Blocco | null {
  if (b.tipo === "scelti") return { tipo: "scelti", esercizioIds: b.esercizioIds };
  if (!/^\d+$/.test(b.quanti.trim())) return null;
  const quanti = Number(b.quanti);
  if (quanti < 1 || quanti > QUANTI_MAX) return null;
  if (b.tipo === "raccolta") return { tipo: "raccolta", contenitoreId: b.contenitoreId, quanti };
  return {
    tipo: "argomento",
    argomento: b.argomento,
    ...(b.anno != null ? { anno: b.anno } : {}),
    ...(b.difficoltaMax != null ? { difficoltaMax: b.difficoltaMax } : {}),
    quanti,
  };
}

const ETICHETTA = "text-sm font-medium";
const SELECT = "h-10 rounded-lg border border-input bg-background px-3 text-sm";
const LINK_AGGIUNGI = "text-sm font-medium text-brand-blue hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded";

/** La pagina "Nuovo compito" (spec 2026-10-22): tre zone una sotto l'altra,
 * numerate e colorate come nella bozza approvata — 1 Per chi (blu), 2 Cosa
 * (arancio), 3 Riepilogo (verde).
 *
 * Il riepilogo è del server (`/api/esercizi/compiti/estrai`, lo stesso
 * calcolo di "Assegna"): la pagina lo richiede, con un debounce, a ogni
 * cambio di classe, blocchi, modo o seme, e manda SEMPRE il modo — senza,
 * il server risponderebbe nel modo "stesse domande", con numeri che nel
 * modo "diverse per studente" non valgono (là `disponibili` è il caso
 * peggiore, ciò che è garantito a ogni studente).
 *
 * "Assegna" è possibile solo con un riepilogo aggiornato ai blocchi di
 * adesso e sufficiente. Nel modo "stesse domande" manda le versioni viste
 * (quelle del riepilogo, cioè dell'anteprima): se il server non le ritrova
 * con lo stesso seme risponde `estrazione_cambiata` con il riepilogo nuovo,
 * che la pagina mostra al posto del suo con un avviso — il docente assegna
 * sempre ciò che ha visto. Nel modo "diverse per studente" le versioni viste
 * non si mandano: l'anteprima era solo un esempio. */
export function NuovoCompitoClient({
  classi,
  argomentiPerAnno,
  raccolte,
  catalogo,
  iniziale,
  semeIniziale,
  locale,
}: NuovoCompitoProps) {
  const t = useTranslations("esercizi.nuovoCompito");
  const router = useRouter();

  const [classeId, setClasseId] = useState(iniziale.classeId);
  const [opensAt, setOpensAt] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [blocchi, setBlocchi] = useState<BloccoUI[]>(() => iniziale.blocchi.map(versoUI));
  const [modo, setModo] = useState<Modo>("CLASSE");
  const [seme, setSeme] = useState(semeIniziale);
  const [menu, setMenu] = useState<null | "argomento" | "raccolta" | "esercizi">(null);
  const [cerca, setCerca] = useState("");
  const [soloAnno, setSoloAnno] = useState(true);
  const [risultato, setRisultato] = useState<Risultato | null>(null);
  const [anteprimaAperta, setAnteprimaAperta] = useState(false);
  const [salvaModello, setSalvaModello] = useState(false);
  const [nomeModello, setNomeModello] = useState("");
  const [invio, setInvio] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const classe = classi.find((c) => c.id === classeId) ?? null;
  const titoli = useMemo(() => new Map(catalogo.map((e) => [e.id, e.titolo])), [catalogo]);
  const nomiRaccolte = useMemo(() => new Map(raccolte.map((r) => [r.id, r])), [raccolte]);

  const argomentiDellAnno = (anno: number | null | undefined) =>
    anno != null ? (argomentiPerAnno[String(anno)] ?? []) : [];

  function etichetta(b: BloccoUI): string {
    if (b.tipo === "argomento") return b.argomento;
    if (b.tipo === "raccolta") return nomiRaccolte.get(b.contenitoreId)?.nome ?? t("raccoltaNonDisponibile");
    return t("scelti");
  }

  // I blocchi da mandare: tutti validi, o nessuno (un numero da correggere
  // ferma il riepilogo invece di mandarne uno su blocchi diversi da quelli
  // che il docente vede).
  const daMandare = useMemo(() => {
    const validi = blocchi.map(versoBlocco);
    return validi.every((b): b is Blocco => b !== null) ? validi : null;
  }, [blocchi]);

  const corpoRiepilogo =
    classe && daMandare && daMandare.length > 0
      ? JSON.stringify({ classeId: classe.id, blocchi: daMandare, seme, modo })
      : null;

  // Il riepilogo, a ogni cambio, con un debounce: una raffica di cifre
  // scritte nel campo "quanti" fa UNA richiesta. La richiesta precedente
  // ancora in volo si annulla; e comunque una risposta vale solo per la sua
  // chiave (`Risultato`), quindi una risposta arrivata tardi non prende il
  // posto di quella giusta.
  useEffect(() => {
    if (!corpoRiepilogo) return;
    const controllo = new AbortController();
    const tipi = (JSON.parse(corpoRiepilogo) as { blocchi: Blocco[] }).blocchi.map((b) => b.tipo);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(withBasePath("/api/esercizi/compiti/estrai"), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: corpoRiepilogo,
          signal: controllo.signal,
        });
        const corpo = await res.json().catch(() => ({}));
        if (controllo.signal.aborted) return;
        if (!res.ok) {
          const msg =
            corpo.error === "classe_senza_anno"
              ? t("erroreClasseSenzaAnno")
              : res.status === 429
                ? t("erroreTroppeRichieste")
                : t("erroreRiepilogo");
          setRisultato({ chiave: corpoRiepilogo, tipi, errore: msg });
          return;
        }
        setRisultato({ chiave: corpoRiepilogo, tipi, riepilogo: corpo as Riepilogo });
      } catch {
        if (!controllo.signal.aborted) setRisultato({ chiave: corpoRiepilogo, tipi, errore: t("erroreRiepilogo") });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controllo.abort();
    };
  }, [corpoRiepilogo, t]);

  const aggiornato = corpoRiepilogo !== null && risultato?.chiave === corpoRiepilogo;
  // Mentre si ricalcola resta visibile l'ultimo riepilogo (attenuato), per
  // non far saltare la pagina a ogni cifra; ma non vale per assegnare.
  const mostrato = corpoRiepilogo !== null && risultato && "riepilogo" in risultato ? risultato : null;
  const riepilogo = mostrato?.riepilogo ?? null;
  // Il corpo a cui il riepilogo mostrato risponde: il suo modo e i suoi
  // blocchi, che durante un ricalcolo possono non essere più quelli dei
  // controlli (il docente ha appena cambiato modo). Frasi ed etichette del
  // riepilogo seguono QUESTI, non lo stato dei controlli.
  const corpoMostrato = mostrato ? (JSON.parse(mostrato.chiave) as { blocchi: Blocco[]; modo: Modo }) : null;
  const modoMostrato = corpoMostrato?.modo ?? modo;
  const pronto = aggiornato && riepilogo !== null && riepilogo.sufficiente && riepilogo.esercizi.length > 0;
  const assegnabile = classe !== null && aggiornato && riepilogo !== null && riepilogo.sufficiente && !invio
    && (!salvaModello || nomeModello.trim().length > 0);

  function cambiaBlocchi(f: (prima: BloccoUI[]) => BloccoUI[]) {
    setBlocchi(f);
    setAvviso(null);
    setErrore(null);
  }

  function aggiungiArgomento(o: ArgomentoOpzione) {
    cambiaBlocchi((p) => [...p, { chiave: nuovaChiave(), tipo: "argomento", argomento: o.argomento, quanti: quantiPredefinito(o.quanti) }]);
    setMenu(null);
  }

  function aggiungiRaccolta(r: RaccoltaOpzione) {
    cambiaBlocchi((p) => [...p, { chiave: nuovaChiave(), tipo: "raccolta", contenitoreId: r.id, quanti: quantiPredefinito(r.esercizi) }]);
    setMenu(null);
  }

  // Un esercizio scelto va nell'ultimo blocco "scelti", o in uno nuovo in
  // fondo: un solo blocco di scelti è ciò che il docente si aspetta, e
  // l'ordine in cui li sceglie è l'ordine nel compito.
  function scegliEsercizio(id: string) {
    cambiaBlocchi((p) => {
      const k = p.map((b) => b.tipo).lastIndexOf("scelti");
      if (k === -1) return [...p, { chiave: nuovaChiave(), tipo: "scelti", esercizioIds: [id] }];
      return p.map((b, i) => (i === k && b.tipo === "scelti" ? { ...b, esercizioIds: [...b.esercizioIds, id] } : b));
    });
  }

  // Togliere l'ultimo esercizio di un blocco "scelti" toglie il blocco: un
  // blocco vuoto non si può assegnare (`blocchi_non_validi`).
  function togliEsercizio(chiave: string, id: string) {
    cambiaBlocchi((p) =>
      p.flatMap((b) => {
        if (b.chiave !== chiave || b.tipo !== "scelti") return [b];
        const resto = b.esercizioIds.filter((x) => x !== id);
        return resto.length > 0 ? [{ ...b, esercizioIds: resto }] : [];
      }),
    );
  }

  function cambiaQuanti(chiave: string, valore: string) {
    cambiaBlocchi((p) => p.map((b) => (b.chiave === chiave && b.tipo !== "scelti" ? { ...b, quanti: valore } : b)));
  }

  const nomePredefinito = () =>
    (iniziale.modello?.nome ??
      blocchi
        .map((b) => `${etichetta(b)} (${b.tipo === "scelti" ? b.esercizioIds.length : b.quanti})`)
        .join(" + ")).slice(0, NOME_MAX);

  function messaggioAssegna(corpo: { error?: string; dettaglio?: string }): string {
    switch (corpo.error) {
      case "date_non_valide":
        return corpo.dettaglio === "scadenza_prima_apertura" ? t("erroreScadenzaPrimaApertura") : t("erroreScadenzaPassata");
      case "non_insegni_questa_classe":
      case "classe_non_trovata":
        return t("erroreNonInsegni");
      case "modello_non_trovato":
        return t("erroreModello");
      case "classe_senza_anno":
        return t("erroreClasseSenzaAnno");
      case "rate_limited":
        return t("erroreTroppeRichieste");
      default:
        return t("erroreGenerico");
    }
  }

  async function assegna() {
    if (!assegnabile || !classe || !daMandare || !riepilogo || !corpoRiepilogo) return;
    setInvio(true);
    setErrore(null);
    setAvviso(null);
    const chiave = corpoRiepilogo;
    const tipi = daMandare.map((b) => b.tipo);
    try {
      const res = await fetch(withBasePath("/api/esercizi/compiti"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          classeId: classe.id,
          blocchi: daMandare,
          modo,
          seme,
          ...(modo === "CLASSE" ? { versioniViste: riepilogo.esercizi.map((e) => e.versioneId) } : {}),
          // Come i vecchi moduli di assegnazione: la data del campo
          // `type="date"` come mezzanotte UTC (la pagina del compito la
          // rilegge nello stesso modo, `perCampoData`).
          ...(opensAt ? { opensAt: new Date(opensAt).toISOString() } : {}),
          ...(dueAt ? { dueAt: new Date(dueAt).toISOString() } : {}),
          ...(salvaModello ? { salvaModello: { nome: nomeModello.trim() } } : {}),
          ...(iniziale.modello ? { modelloId: iniziale.modello.id } : {}),
        }),
      });
      const corpo = await res.json().catch(() => ({}));
      if (res.ok && typeof corpo.compitoId === "string") {
        router.push(`/dashboard/esercizi/compiti/${corpo.compitoId}`);
        return;
      }
      if (corpo.riepilogo && (corpo.error === "estrazione_cambiata" || corpo.error === "esercizi_insufficienti")) {
        // Il riepilogo nuovo prende il posto del vecchio, con la stessa
        // chiave: blocchi e seme non sono cambiati, il bacino sì.
        setRisultato({ chiave, tipi, riepilogo: corpo.riepilogo as Riepilogo });
        if (corpo.error === "estrazione_cambiata") setAvviso(t("estrazioneCambiata"));
        else setErrore(t("erroreInsufficienti"));
      } else {
        setErrore(messaggioAssegna(corpo));
      }
    } catch {
      setErrore(t("erroreGenerico"));
    }
    setInvio(false);
  }

  const giaScelti = new Set(blocchi.flatMap((b) => (b.tipo === "scelti" ? b.esercizioIds : [])));
  const filtroAnno = soloAnno && classe?.anno != null ? classe.anno : null;
  const testo = cerca.trim().toLowerCase();
  const trovati = catalogo
    .filter((e) => (filtroAnno == null || e.anno === filtroAnno) && (testo === "" || e.titolo.toLowerCase().includes(testo)))
    .slice(0, RISULTATI_MAX);

  // Le righe insufficienti del riepilogo: `disponibili < richiesti`. Nel
  // modo "diverse per studente" il numero è il caso peggiore — ciò che è
  // garantito a OGNI studente — e la frase lo dice, altrimenti "ce ne sono
  // 3" sembrerebbe smentito dal catalogo che ne mostra di più.
  //
  // L'etichetta: quella del server per argomento e raccolta visibile (il
  // testo dell'argomento, il nome della raccolta), ma le parole fisse del
  // server ("Esercizi scelti", "Raccolta non disponibile") sono italiane —
  // per quei blocchi si usano quelle della pagina, nella lingua del docente.
  const etichettaRiga = (b: Riepilogo["blocchi"][number], i: number): string => {
    const blocco = corpoMostrato?.blocchi[i];
    if (blocco?.tipo === "scelti") return t("scelti");
    if (blocco?.tipo === "raccolta" && !nomiRaccolte.has(blocco.contenitoreId)) return t("raccoltaNonDisponibile");
    return b.etichetta;
  };
  const righeInsufficienti = riepilogo
    ? riepilogo.blocchi.flatMap((b, i) => {
        if (b.disponibili >= b.richiesti) return [];
        const scelti = mostrato!.tipi[i] === "scelti" || b.nonDisponibili.length > 0;
        const valori = { etichetta: etichettaRiga(b, i), richiesti: b.richiesti, disponibili: b.disponibili };
        const frase = scelti
          ? t("sceltiInsufficiente", valori)
          : modoMostrato === "STUDENTE"
            ? t("insufficienteStudente", valori)
            : t("insufficiente", valori);
        return [{ chiave: `${i}`, frase, nonDisponibili: b.nonDisponibili }];
      })
    : [];

  return (
    <div className="space-y-4">
      {iniziale.modello && (
        <p className="text-sm text-muted-foreground">{t("dalModello", { nome: iniziale.modello.nome })}</p>
      )}

      {/* 1 · Per chi */}
      <section aria-labelledby="zona-per-chi" className="space-y-3 rounded-xl border-2 border-brand-blue bg-card p-4">
        <h2 id="zona-per-chi" className="text-sm font-semibold uppercase tracking-wide text-brand-blue">
          {t("zonaPerChi")}
        </h2>
        {classi.length === 0 ? (
          <p className="text-sm">
            {t("nessunaClasse")}{" "}
            <Link href="/dashboard/esercizi/classi" className="font-medium text-brand-blue hover:underline">
              {t("nessunaClasseLink")}
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="nc-classe" className={ETICHETTA}>{t("classe")}</label>
              <select
                id="nc-classe"
                value={classeId}
                onChange={(e) => {
                  setClasseId(e.target.value);
                  setAvviso(null);
                  setErrore(null);
                }}
                className={`${SELECT} min-w-44`}
              >
                <option value="">{t("sceltaClasse")}</option>
                {classi.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nc-apertura" className={ETICHETTA}>{t("apertura")}</label>
              <Input id="nc-apertura" type="date" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} aria-describedby="nc-apertura-aiuto" className="h-10 w-44" />
              <span id="nc-apertura-aiuto" className="text-xs text-muted-foreground">{t("aperturaAiuto")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="nc-scadenza" className={ETICHETTA}>{t("scadenza")}</label>
              <Input id="nc-scadenza" type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} aria-describedby="nc-scadenza-aiuto" className="h-10 w-44" />
              <span id="nc-scadenza-aiuto" className="text-xs text-muted-foreground">{t("scadenzaAiuto")}</span>
            </div>
          </div>
        )}
      </section>

      {/* 2 · Cosa */}
      <section aria-labelledby="zona-cosa" className="space-y-3 rounded-xl border-2 border-brand-orange bg-card p-4">
        <h2 id="zona-cosa" className="text-sm font-semibold uppercase tracking-wide text-brand-orange">
          {t("zonaCosa")}
        </h2>

        {blocchi.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nessunBlocco")}</p>
        ) : (
          <ul className="grid gap-2">
            {blocchi.map((b) => {
              const nome = etichetta(b);
              return (
                <li key={b.chiave} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-brand-orange-50 px-3 py-2 text-sm text-brand-ink">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                    {b.tipo === "argomento" && (
                      <>
                        <Tag aria-hidden="true" className="size-4 shrink-0 text-brand-orange" />
                        <span>{t("argomento")}</span>
                        <strong className="font-semibold">{b.argomento}</strong>
                        {b.anno != null && b.anno !== classe?.anno && <span>· {t("annoBlocco", { anno: b.anno })}</span>}
                        {(() => {
                          const n = argomentiDellAnno(b.anno ?? classe?.anno).find((a) => a.argomento === b.argomento)?.quanti;
                          return n != null ? <span className="text-muted-foreground">({t("disponibili", { n })})</span> : null;
                        })()}
                      </>
                    )}
                    {b.tipo === "raccolta" && (
                      <>
                        <Folder aria-hidden="true" className="size-4 shrink-0 text-brand-orange" />
                        <span>{t("raccolta")}</span>
                        <strong className="font-semibold">{nome}</strong>
                        {nomiRaccolte.has(b.contenitoreId) && (
                          <span className="text-muted-foreground">({t("eserciziRaccolta", { n: nomiRaccolte.get(b.contenitoreId)!.esercizi })})</span>
                        )}
                      </>
                    )}
                    {b.tipo === "scelti" && (
                      <>
                        <Hand aria-hidden="true" className="size-4 shrink-0 text-brand-orange" />
                        <span>{t("scelti")}:</span>
                        {b.esercizioIds.map((id) => {
                          const titolo = titoli.get(id) ?? t("esercizioNonDisponibile");
                          return (
                            <span key={id} className="inline-flex items-center gap-0.5 rounded-md bg-background px-1.5 py-0.5">
                              <strong className="font-semibold">{titolo}</strong>
                              <button
                                type="button"
                                onClick={() => togliEsercizio(b.chiave, id)}
                                aria-label={t("togliEsercizio", { titolo })}
                                className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <X aria-hidden="true" className="size-3.5" />
                              </button>
                            </span>
                          );
                        })}
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {b.tipo === "scelti" ? (
                      <span>{t("tuttiE", { n: b.esercizioIds.length })}</span>
                    ) : (
                      <label className="flex items-center gap-1.5">
                        <span>{t("prendi")}</span>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={QUANTI_MAX}
                          value={b.quanti}
                          onChange={(e) => cambiaQuanti(b.chiave, e.target.value)}
                          aria-label={t("quantiEtichetta", { etichetta: nome })}
                          aria-invalid={versoBlocco(b) === null || undefined}
                          className="h-8 w-16 bg-background text-center font-semibold tabular-nums"
                        />
                        <span>{t("aCaso")}</span>
                      </label>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => cambiaBlocchi((p) => p.filter((x) => x.chiave !== b.chiave))}
                      aria-label={t("togliBlocco", { etichetta: nome })}
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 sm:gap-x-3">
          <button type="button" className={LINK_AGGIUNGI} aria-expanded={menu === "argomento"} onClick={() => setMenu("argomento")}>
            {t("aggiungiArgomento")}
          </button>
          <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">·</span>
          <button type="button" className={LINK_AGGIUNGI} aria-expanded={menu === "raccolta"} onClick={() => setMenu("raccolta")}>
            {t("aggiungiRaccolta")}
          </button>
          <span aria-hidden="true" className="hidden text-muted-foreground sm:inline">·</span>
          <button type="button" className={LINK_AGGIUNGI} aria-expanded={menu === "esercizi"} onClick={() => setMenu("esercizi")}>
            {t("aggiungiEsercizi")}
          </button>
        </div>

        {menu !== null && (
          <div
            role="group"
            aria-label={menu === "argomento" ? t("aggiungiArgomento") : menu === "raccolta" ? t("aggiungiRaccolta") : t("aggiungiEsercizi")}
            className="space-y-2 rounded-lg border border-input bg-background p-3"
          >
            {menu === "argomento" &&
              (!classe ? (
                <p className="text-sm text-muted-foreground">{t("primaLaClasse")}</p>
              ) : classe.anno == null ? (
                <p className="text-sm text-muted-foreground">{t("classeSenzaAnno")}</p>
              ) : argomentiDellAnno(classe.anno).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("nessunArgomento", { anno: classe.anno })}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {argomentiDellAnno(classe.anno).map((o) => (
                    <li key={o.argomento}>
                      <Button type="button" variant="outline" onClick={() => aggiungiArgomento(o)}>
                        {t("argomentoOpzione", { argomento: o.argomento, n: o.quanti })}
                      </Button>
                    </li>
                  ))}
                </ul>
              ))}

            {menu === "raccolta" &&
              (raccolte.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("nessunaRaccolta")}</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {raccolte.map((r) => (
                    <li key={r.id}>
                      <Button type="button" variant="outline" onClick={() => aggiungiRaccolta(r)}>
                        {t("raccoltaOpzione", { nome: r.nome, n: r.esercizi })}
                      </Button>
                    </li>
                  ))}
                </ul>
              ))}

            {menu === "esercizi" && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Input
                    type="search"
                    value={cerca}
                    onChange={(e) => setCerca(e.target.value)}
                    aria-label={t("cerca")}
                    placeholder={t("cerca")}
                    className="h-9 w-full sm:w-72"
                  />
                  {classe?.anno != null && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={soloAnno} onChange={(e) => setSoloAnno(e.target.checked)} className="size-4 accent-brand-blue" />
                      {t("soloAnno", { anno: classe.anno })}
                    </label>
                  )}
                </div>
                {trovati.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("nessunRisultato")}</p>
                ) : (
                  <ul className="grid gap-1">
                    {trovati.map((e) => {
                      const gia = giaScelti.has(e.id);
                      return (
                        <li key={e.id}>
                          <button
                            type="button"
                            disabled={gia}
                            onClick={() => scegliEsercizio(e.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:text-muted-foreground disabled:hover:bg-transparent"
                          >
                            <Plus aria-hidden="true" className="size-4 shrink-0 text-brand-blue" />
                            <span>{t("rigaEsercizio", { titolo: e.titolo, argomento: e.argomento, anno: e.anno })}</span>
                            {gia && <span className="ml-2 text-xs">({t("giaScelto")})</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <Button type="button" variant="ghost" size="sm" onClick={() => setMenu(null)}>
              {t("chiudiMenu")}
            </Button>
          </div>
        )}
      </section>

      {/* 3 · Riepilogo */}
      <section aria-labelledby="zona-riepilogo" className="space-y-3 rounded-xl border-2 border-brand-green bg-card p-4">
        <h2 id="zona-riepilogo" className="text-sm font-semibold uppercase tracking-wide text-brand-green">
          {t("zonaRiepilogo")}
        </h2>

        <div aria-live="polite" className="space-y-2 text-sm">
          {!classe || blocchi.length === 0 ? (
            <p className="text-muted-foreground">{t("riepilogoVuoto")}</p>
          ) : daMandare === null ? (
            <p className="text-destructive">{t("quantiNonValido")}</p>
          ) : risultato && aggiornato && "errore" in risultato ? (
            <p className="text-destructive">{risultato.errore}</p>
          ) : !riepilogo ? (
            <p className="text-muted-foreground">{t("calcolo")}</p>
          ) : (
            <div className={`space-y-2 transition-opacity ${aggiornato ? "" : "opacity-60"}`}>
              {/* Insufficiente: niente "ogni studente riceverà N", che non
                  è vero finché i blocchi in rosso non si correggono. Senza
                  righe in rosso (una versione sparita fra due letture) il
                  riepilogo va solo ricalcolato. */}
              {riepilogo.sufficiente ? (
                <p>
                  <strong className="font-semibold">{t("totale", { n: riepilogo.totale })}</strong>{" "}
                  {modoMostrato === "CLASSE" ? t("fraseClasse") : t("fraseStudente")}
                </p>
              ) : (
                <p className="font-semibold text-destructive">
                  {righeInsufficienti.length > 0 ? t("mancanoEsercizi") : t("erroreRiepilogo")}
                </p>
              )}
              {righeInsufficienti.length > 0 && (
                <ul className="space-y-1 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                  {righeInsufficienti.map((r) => (
                    <li key={r.chiave}>
                      <span className="font-medium">{r.frase}</span>
                      {r.nonDisponibili.length > 0 && (
                        <ul className="list-disc pl-5">
                          {r.nonDisponibili.map((titolo, k) => (
                            <li key={`${titolo}-${k}`}>{t("nonPiuDisponibile", { titolo })}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {modoMostrato === "CLASSE" && riepilogo.duplicatiTolti > 0 && (
                <p className="text-muted-foreground">{t("duplicati", { n: riepilogo.duplicatiTolti })}</p>
              )}
              {!aggiornato && <p className="text-muted-foreground">{t("calcolo")}</p>}
            </div>
          )}
        </div>

        <fieldset className="space-y-1.5">
          <legend className={`${ETICHETTA} mb-1`}>{t("modoLegenda")}</legend>
          <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-5">
            {(["CLASSE", "STUDENTE"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="nc-modo"
                  value={m}
                  checked={modo === m}
                  onChange={() => {
                    setModo(m);
                    setAvviso(null);
                    setErrore(null);
                  }}
                  className="size-4 accent-brand-green"
                />
                {m === "CLASSE" ? t("modoClasse") : t("modoStudente")}
              </label>
            ))}
          </div>
        </fieldset>

        {riepilogo && riepilogo.sufficiente && riepilogo.esercizi.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAnteprimaAperta((a) => !a)}
                aria-expanded={anteprimaAperta}
                disabled={!pronto}
                className="h-10 border-brand-green bg-brand-green-50 px-3 font-semibold text-brand-ink hover:bg-brand-green-50/70"
              >
                <Eye aria-hidden="true" />
                {anteprimaAperta ? t("chiudiAnteprima") : t("anteprima")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSeme(nuovoSeme())} disabled={!aggiornato} className="h-10 px-3">
                <RefreshCw aria-hidden="true" />
                {t("estraiDiNuovo")}
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">{modoMostrato === "CLASSE" ? t("spiegazioneClasse") : t("spiegazioneStudente")}</p>
            {anteprimaAperta && (
              <div className="rounded-lg border border-brand-green/40 p-2 sm:p-3">
                <AnteprimaCompito
                  key={riepilogo.esercizi.map((e) => e.versioneId).join(",")}
                  esercizi={riepilogo.esercizi}
                  locale={locale}
                  avviso={modoMostrato === "STUDENTE" ? t("esempio") : undefined}
                />
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={salvaModello}
              onChange={(e) => {
                setSalvaModello(e.target.checked);
                if (e.target.checked && nomeModello.trim() === "") setNomeModello(nomePredefinito());
              }}
              className="size-4 accent-brand-green"
            />
            {t("salvaModello")}
          </label>
          {salvaModello && (
            <div className="flex flex-col gap-1.5 pl-6">
              <label htmlFor="nc-nome-modello" className="text-sm text-muted-foreground">{t("nomeModello")}</label>
              <Input
                id="nc-nome-modello"
                value={nomeModello}
                maxLength={200}
                onChange={(e) => setNomeModello(e.target.value)}
                className="h-9 w-full max-w-md"
              />
            </div>
          )}
        </div>

        {avviso && (
          <p role="alert" className="rounded-lg bg-brand-orange-50 px-3 py-2 text-sm font-medium text-brand-ink">
            {avviso}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button type="button" onClick={assegna} disabled={!assegnabile} className="h-11 px-6 text-base font-semibold">
            {classe ? t("assegnaA", { classe: classe.nome }) : t("assegna")}
          </Button>
          {errore && (
            <span role="alert" className="text-sm text-destructive">
              {errore}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
