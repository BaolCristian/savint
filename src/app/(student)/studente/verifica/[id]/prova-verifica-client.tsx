"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Lock, Maximize, Timer } from "lucide-react";
import type { QuestionState } from "@savint/engine";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { withBasePath } from "@/lib/base-path";
import { haRisposta } from "@/lib/esercizi/verifica-regole";
// Solo i tipi: prova-verifica.ts legge il database e non entra nel bundle.
import type { EsercizioProva, IntroProva, ProvaAperta } from "@/lib/esercizi/prova-verifica";
import { CalcolatricePannello } from "@/components/esercizi/verifica/calcolatrice-pannello";
import { CodaSalvataggi, type EsitoInvio, type StatoCoda } from "@/components/esercizi/verifica/coda-salvataggi";
import { formattaQuando } from "@/components/esercizi/verifica/data-verifica";
import { EsercizioVerifica } from "@/components/esercizi/verifica/esercizio-verifica";
import { FormularioPannello } from "@/components/esercizi/verifica/formulario-pannello";
import { formattaResiduo, millisecondiResidui, scarto as scartoDa } from "@/components/esercizi/verifica/orologio-server";
import { InvioEventi, useSorveglianza } from "@/components/esercizi/verifica/usa-sorveglianza";

/** La prova come arriva in JSON: le date sono stringhe ISO. */
type ProvaJson = Omit<ProvaAperta, "scadenza" | "oraServer"> & { scadenza: string; oraServer: string };
type Finale = "consegnata" | "tempo_scaduto" | "chiusa";
type Fase =
  | { tipo: "intro"; nonIniziata?: boolean; errore?: boolean }
  | { tipo: "prova" }
  | { tipo: "finale"; motivo: Finale };
type CorpoRisposta = { error?: string; oraServer?: string; scadenza?: string; consegnata?: boolean } | null;

const POLLING_MS = 20_000;
/** Sotto questa soglia il conto alla rovescia diventa rosso. */
const ULTIMI_MINUTI_MS = 5 * 60_000;
const FINE_PROVA = new Set(["tempo_scaduto", "consegnata", "chiusa"]);

/**
 * Come la coda dei salvataggi legge la risposta di `PUT .../prova/risposte`:
 * 200 salvato; 400 (`invalid_state`, o un corpo che la rotta non accetta)
 * quello stato non passerà mai e si scarta; 409 tempo scaduto, consegnata o
 * chiusa e 404 chiudono la coda; il resto (409 `non_iniziata`, 429, 5xx) si
 * ritenta. Gli errori di rete li ritenta la coda da sé.
 */
export function esitoDaRisposta(status: number, corpo: CorpoRisposta): EsitoInvio {
  const motivo = corpo?.error;
  const oraServer = corpo?.oraServer;
  if (status >= 200 && status < 300) return { ok: true, oraServer: oraServer ?? "", scadenza: corpo?.scadenza ?? "" };
  if (status === 400) return { ok: false, definitivo: false, scarta: true, motivo };
  if (status === 404) return { ok: false, definitivo: true, motivo: motivo ?? "non_trovata", oraServer };
  if (status === 409 && motivo && FINE_PROVA.has(motivo)) return { ok: false, definitivo: true, motivo, oraServer };
  return { ok: false, definitivo: false, motivo, oraServer };
}

const finaleDa = (motivo: string | undefined): Finale =>
  motivo === "tempo_scaduto" ? "tempo_scaduto" : motivo === "consegnata" ? "consegnata" : "chiusa";

const leggiCorpo = (r: Response): Promise<CorpoRisposta> => r.json().catch(() => null);

/** Le parti di un esercizio senza risposta: dallo stato del motore, o — per
 * un esercizio mai toccato — tutte le parti del contenuto. */
function partiVuote(e: Pick<EsercizioProva, "content" | "state">): number {
  if (e.state) return e.state.parts.filter((p) => !haRisposta({ ...e.state!, parts: [p] })).length;
  const parti = (e.content as { parts?: unknown[] } | null)?.parts;
  return Array.isArray(parti) ? parti.length : 0;
}

/** Lo schermo intero si chiede SUBITO, dentro il clic (fuori dal gesto il
 * browser lo rifiuta); un rifiuto non ferma la prova. */
function chiediSchermoIntero(): Promise<void> {
  try {
    return Promise.resolve(document.documentElement.requestFullscreen?.()).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

function esciDaSchermoIntero() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  } catch {
    // Niente schermo intero da lasciare.
  }
}

export interface ProvaVerificaClientProps {
  compitoId: string;
  studentId: string;
  intro: IntroProva;
  locale: "it" | "en";
}

/**
 * La pagina della verifica per lo studente: introduzione, prova a schermo
 * intero e schermata finale. Il server decide tempi, chiusura e consegna; il
 * client conta il tempo sull'ora del server, salva ogni risposta con la coda
 * e registra le uscite. Niente di quello che mostra dice se una risposta è
 * giusta: solo «risposto» o «non risposto».
 */
export function ProvaVerificaClient({ compitoId, studentId, intro, locale }: ProvaVerificaClientProps) {
  const t = useTranslations("esercizi.provaStudente");
  const base = `/api/esercizi/verifiche/${compitoId}`;

  const [fase, setFase] = useState<Fase>(() =>
    intro.stato === "consegnata" || intro.stato === "risultati"
      ? { tipo: "finale", motivo: "consegnata" }
      : intro.stato === "chiusa"
        ? { tipo: "finale", motivo: "chiusa" }
        : { tipo: "intro", nonIniziata: intro.stato === "non_iniziata" },
  );
  const [entrando, setEntrando] = useState(false);
  const [prova, setProva] = useState<ProvaJson | null>(null);
  const [risposti, setRisposti] = useState<Record<string, boolean>>({});
  const [vuote, setVuote] = useState<Record<string, number>>({});
  const [corrente, setCorrente] = useState(0);
  const [statoCoda, setStatoCoda] = useState<StatoCoda>({ fase: "salvato" });
  const [scarto, setScarto] = useState(0);
  const [scadenza, setScadenza] = useState<string | null>(null);
  const [adesso, setAdesso] = useState(() => Date.now());
  const [dialogo, setDialogo] = useState(false);
  const [consegnando, setConsegnando] = useState(false);
  const [erroreConsegna, setErroreConsegna] = useState(false);
  const [calcolatrice, setCalcolatrice] = useState(false);
  const [formulario, setFormulario] = useState(false);

  const codaRef = useRef<CodaSalvataggi | null>(null);
  const eventiRef = useRef<InvioEventi | null>(null);
  const finitaRef = useRef(false);
  const consegnaAvviataRef = useRef(false);
  // L'ultima ora del server già usata per lo scarto: la coda ripete quella
  // vecchia negli stati di errore, e ricalcolarla adesso sposterebbe l'orologio.
  const ultimaOraServerRef = useRef<string | null>(null);

  const inProva = fase.tipo === "prova";

  useEffect(() => {
    const eventi = new InvioEventi({ compitoId });
    eventiRef.current = eventi;
    return () => {
      eventi.ferma();
      codaRef.current?.ferma();
    };
  }, [compitoId]);

  const { fuori, rientra } = useSorveglianza({
    attiva: inProva,
    scartoMs: scarto,
    onEvento: (e) => eventiRef.current?.aggiungi(e),
  });

  const aggiornaTempo = useCallback((oraServer: string | undefined, nuovaScadenza: string | undefined) => {
    if (oraServer && oraServer !== ultimaOraServerRef.current) {
      ultimaOraServerRef.current = oraServer;
      setScarto(scartoDa(oraServer, Date.now()));
    }
    if (nuovaScadenza) setScadenza(nuovaScadenza);
  }, []);

  const concludi = useCallback((motivo: Finale) => {
    if (finitaRef.current) return;
    finitaRef.current = true;
    codaRef.current?.ferma();
    esciDaSchermoIntero();
    setDialogo(false);
    setFase({ tipo: "finale", motivo });
  }, []);

  const suCambioCoda = useCallback((s: StatoCoda) => {
    setStatoCoda(s);
    aggiornaTempo(s.oraServer, s.scadenza);
    if (s.fase === "chiuso") concludi(finaleDa(s.motivo));
  }, [aggiornaTempo, concludi]);

  function apriProva(p: ProvaJson) {
    codaRef.current?.ferma();
    const coda = new CodaSalvataggi({
      compitoId,
      studentId,
      onCambio: suCambioCoda,
      invia: async (tentativoId: string, state: QuestionState) => {
        const r = await fetch(withBasePath(`${base}/prova/risposte`), {
          method: "PUT",
          headers: { "Content-Type": "application/json", "x-savint-locale": locale },
          body: JSON.stringify({ tentativoId, state }),
        });
        return esitoDaRisposta(r.status, await leggiCorpo(r));
      },
    });
    codaRef.current = coda;
    // Quello che un refresh aveva lasciato nella coda è più nuovo di quello
    // salvato sul server: lo sostituisce (e la coda lo sta già mandando).
    const pendenti = coda.pendenti();
    const esercizi = p.esercizi.map((e) => (pendenti.has(e.tentativoId) ? { ...e, state: pendenti.get(e.tentativoId)! } : e));
    setProva({ ...p, esercizi });
    setRisposti(Object.fromEntries(esercizi.map((e) => [e.tentativoId, haRisposta(e.state)])));
    setVuote(Object.fromEntries(esercizi.map((e) => [e.tentativoId, partiVuote(e)])));
    aggiornaTempo(p.oraServer, p.scadenza);
    setAdesso(Date.now());
    setFase({ tipo: "prova" });
  }

  async function entra() {
    setEntrando(true);
    const schermo = chiediSchermoIntero();
    let r: Response;
    try {
      r = await fetch(withBasePath(`${base}/prova`), { method: "POST" });
    } catch {
      await schermo;
      esciDaSchermoIntero();
      setEntrando(false);
      setFase({ tipo: "intro", errore: true });
      return;
    }
    const corpo = await r.json().catch(() => null);
    // Prima di sorvegliare, lo schermo intero deve aver risposto.
    await schermo;
    setEntrando(false);
    if (r.ok && corpo) {
      apriProva(corpo as ProvaJson);
      return;
    }
    esciDaSchermoIntero();
    const motivo = (corpo as CorpoRisposta)?.error;
    if (motivo === "non_iniziata") setFase({ tipo: "intro", nonIniziata: true });
    else if (r.status === 404 || r.status === 409) concludi(finaleDa(motivo));
    else setFase({ tipo: "intro", errore: true });
  }

  const consegna = useCallback(async (automatica: boolean) => {
    if (consegnaAvviataRef.current || finitaRef.current) return;
    consegnaAvviataRef.current = true;
    setConsegnando(true);
    setErroreConsegna(false);
    // Il campo ancora attivo passa al motore la sua ultima risposta (onBlur),
    // così entra nella coda prima dello svuotamento.
    (document.activeElement as HTMLElement | null)?.blur?.();
    await codaRef.current?.svuota();
    if (finitaRef.current) return;
    try {
      const r = await fetch(withBasePath(`${base}/prova/consegna`), { method: "POST" });
      if (r.ok) return concludi(automatica ? "tempo_scaduto" : "consegnata");
      const corpo = await leggiCorpo(r);
      if (r.status === 404 || r.status === 409) return concludi(automatica ? "tempo_scaduto" : finaleDa(corpo?.error));
      throw new Error(`consegna: ${r.status}`);
    } catch {
      // Allo zero dell'orologio la prova è finita comunque: oltre la grazia
      // la consegna il server da sé.
      if (automatica) return concludi("tempo_scaduto");
      consegnaAvviataRef.current = false;
      setConsegnando(false);
      setDialogo(false);
      setErroreConsegna(true);
    }
  }, [base, concludi]);

  // Il conto alla rovescia.
  useEffect(() => {
    if (!inProva) return;
    const id = setInterval(() => setAdesso(Date.now()), 500);
    return () => clearInterval(id);
  }, [inProva]);

  const residuo = scadenza ? millisecondiResidui(scadenza, scarto, adesso) : null;
  const scaduto = inProva && residuo === 0;
  useEffect(() => {
    if (scaduto) void consegna(true);
  }, [scaduto, consegna]);

  // Ogni 20 s il tempo dal server: minuti aggiunti dal docente, consegna
  // fatta da lui o allo scadere.
  useEffect(() => {
    if (!inProva) return;
    const id = setInterval(async () => {
      try {
        const r = await fetch(withBasePath(`${base}/prova`), { cache: "no-store" });
        const corpo = await leggiCorpo(r);
        if (r.ok && corpo) {
          aggiornaTempo(corpo.oraServer, corpo.scadenza);
          if (corpo.consegnata) concludi("consegnata");
          return;
        }
        if (r.status === 404 || (r.status === 409 && corpo?.error && FINE_PROVA.has(corpo.error))) concludi(finaleDa(corpo?.error));
      } catch {
        // Rete assente: il prossimo giro riprova, l'orologio continua.
      }
    }, POLLING_MS);
    return () => clearInterval(id);
  }, [inProva, base, aggiornaTempo, concludi]);

  function vai(i: number) {
    setCorrente(i);
    void codaRef.current?.svuota();
  }

  function suStato(tentativoId: string, state: QuestionState, risposto: boolean) {
    codaRef.current?.metti(tentativoId, state);
    setRisposti((r) => ({ ...r, [tentativoId]: risposto }));
    setVuote((v) => ({ ...v, [tentativoId]: partiVuote({ content: null, state }) }));
  }

  if (fase.tipo === "finale") {
    const titolo = fase.motivo === "tempo_scaduto" ? t("tempoScaduto") : fase.motivo === "consegnata" ? t("consegnata") : t("chiusa");
    const Icona = fase.motivo === "chiusa" ? Lock : CheckCircle2;
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-3 border-b border-emerald-100 bg-emerald-50/60 p-6 sm:p-8">
          <Icona aria-hidden="true" className="mb-4 size-11 text-emerald-600" />
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{titolo}</h1>
          {fase.motivo !== "chiusa" && <p className="text-slate-700">{t("finaleSpiegazione")}</p>}
        </div>
        <div className="p-6 sm:p-8">
          <Link href="/studente" className={`${buttonVariants()} min-h-11 w-full rounded-xl sm:w-auto`}>
            {t("tornaHome")}
          </Link>
        </div>
      </section>
    );
  }

  if (fase.tipo === "intro" || !prova) {
    const introFase = fase.tipo === "intro" ? fase : { tipo: "intro" as const };
    return (
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="space-y-4 border-b border-brand-blue/15 bg-brand-blue/5 p-6 sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            {t("introTitolo", { quando: formattaQuando(new Date(intro.quando), locale) })}
          </h1>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-slate-700">
            <li className="flex items-center gap-2"><Clock aria-hidden="true" className="size-4 text-brand-blue" />{t("introDurata", { minuti: intro.durataMinuti })}</li>
            <li className="flex items-center gap-2"><CheckCircle2 aria-hidden="true" className="size-4 text-brand-blue" />{t("introEsercizi", { n: intro.esercizi })}</li>
          </ul>
        </div>
        <div className="space-y-5 p-6 sm:p-8">
          <p className="flex items-start gap-3 rounded-xl border border-brand-orange/30 bg-brand-orange/5 p-4 font-medium text-slate-800">
            <Maximize aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand-orange" />
            <span>{t("introRegola")}</span>
          </p>
          <p className="text-sm text-slate-600">{t("introSalvataggio")}</p>
          {introFase.nonIniziata && (
            <div role="status" className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{t("nonIniziata")}</p>
              <p className="text-sm text-slate-600">{t("nonIniziataSpiegazione")}</p>
            </div>
          )}
          {introFase.errore && <p role="alert" className="text-sm font-medium text-red-700">{t("erroreIngresso")}</p>}
          <Button type="button" className="min-h-11 w-full rounded-xl sm:w-auto" disabled={entrando} onClick={() => void entra()}>
            {introFase.nonIniziata ? t("riprova") : intro.giaEntrato ? t("riprendi") : t("inizia")}
          </Button>
        </div>
      </section>
    );
  }

  const totale = prova.esercizi.length;
  const quanteVuote = Object.values(vuote).reduce((s, n) => s + n, 0);
  const statoTesto =
    statoCoda.fase === "in_salvataggio" ? t("inSalvataggio") : statoCoda.fase === "non_salvato" ? t("nonSalvato") : t("salvato");
  const ultimi = residuo !== null && residuo < ULTIMI_MINUTI_MS;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
        <p
          role="timer"
          aria-label={t("tempoResiduo")}
          className={`flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-lg font-bold tabular-nums ${ultimi ? "bg-red-50 text-red-700" : "text-slate-900"}`}
        >
          <Timer aria-hidden="true" className="size-4" />
          <span>{residuo === null ? "--:--" : formattaResiduo(residuo)}</span>
        </p>
        <p
          aria-live="polite"
          className={`text-sm ${statoCoda.fase === "non_salvato" ? "font-semibold text-red-700" : "text-slate-500"}`}
        >
          {statoTesto}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {prova.calcolatrice && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setCalcolatrice((a) => !a)}>
              {t("calcolatrice")}
            </Button>
          )}
          {prova.formulario && prova.formularioTipo && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setFormulario((a) => !a)}>
              {t("formulario")}
            </Button>
          )}
          <Button type="button" className="min-h-11" disabled={consegnando} onClick={() => setDialogo(true)}>
            {t("consegna")}
          </Button>
        </div>
      </header>

      <nav aria-label={t("navigazione")} className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 sm:px-6">
        {prova.esercizi.map((e, i) => {
          const risposto = risposti[e.tentativoId] ?? false;
          return (
            <button
              key={e.tentativoId}
              type="button"
              aria-label={risposto ? t("esercizioRisposto", { n: e.numero }) : t("esercizioNonRisposto", { n: e.numero })}
              aria-current={i === corrente ? "step" : undefined}
              onClick={() => vai(i)}
              className={`flex size-11 shrink-0 items-center justify-center rounded-xl border-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 ${
                risposto ? "border-brand-blue bg-brand-blue text-white" : "border-slate-300 bg-white text-slate-700"
              } ${i === corrente ? "ring-2 ring-brand-orange ring-offset-2" : ""}`}
            >
              {e.numero}
            </button>
          );
        })}
      </nav>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-6 sm:px-6">
          <p className="text-sm font-semibold text-slate-500">{t("esercizioDi", { n: corrente + 1, totale })}</p>
          {/* Tutti montati, nascosti quelli non correnti: le risposte locali non si perdono. */}
          {prova.esercizi.map((e, i) => (
            <div key={e.tentativoId} hidden={i !== corrente}>
              <EsercizioVerifica
                esercizio={e}
                locale={locale}
                disabilitato={consegnando}
                onStato={suStato}
                onUscitaCampo={() => void codaRef.current?.svuota()}
              />
            </div>
          ))}
          <div className="flex justify-between gap-3 pt-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={corrente === 0} onClick={() => vai(corrente - 1)}>
              <ChevronLeft aria-hidden="true" className="size-4" />
              {t("precedente")}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={corrente >= totale - 1} onClick={() => vai(corrente + 1)}>
              {t("successivo")}
              <ChevronRight aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {erroreConsegna && <p role="alert" className="text-sm font-medium text-red-700">{t("erroreConsegna")}</p>}
        </div>
      </main>

      <CalcolatricePannello aperto={calcolatrice} onChiudi={() => setCalcolatrice(false)} />
      {prova.formularioTipo && (
        <FormularioPannello
          src={withBasePath(`${base}/formulario`)}
          tipo={prova.formularioTipo}
          aperto={formulario}
          onChiudi={() => setFormulario(false)}
        />
      )}

      {dialogo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="consegna-titolo"
            aria-describedby="consegna-testo"
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl"
          >
            <h2 id="consegna-titolo" className="text-lg font-bold text-slate-900">{t("consegnaTitolo")}</h2>
            <p id="consegna-testo" className="text-slate-700">
              {quanteVuote > 0 ? t("consegnaDomanda", { n: quanteVuote }) : t("consegnaTutteRisposte")}
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="min-h-11" disabled={consegnando} onClick={() => setDialogo(false)}>
                {t("annulla")}
              </Button>
              <Button
                type="button"
                className="min-h-11"
                disabled={consegnando}
                onClick={() => void consegna(false)}
              >
                {consegnando ? t("consegnaInCorso") : t("consegnaConferma")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {fuori && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="fuori-titolo" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 text-center shadow-xl">
            <Maximize aria-hidden="true" className="mx-auto size-10 text-brand-orange" />
            <h2 id="fuori-titolo" className="text-lg font-bold text-slate-900">{t("fuoriTitolo")}</h2>
            <p className="text-sm text-slate-600">{t("fuoriSpiegazione")}</p>
            <Button type="button" className="min-h-11 w-full" onClick={() => void rientra()}>
              {t("rientra")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
