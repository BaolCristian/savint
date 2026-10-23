"use client";

import { useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formattaOra } from "@/components/esercizi/verifica/data-verifica";
import { formattaResiduo } from "@/components/esercizi/verifica/orologio-server";
import type { CorpoAzione, MonitoraggioJson } from "./verifica-docente-client";

type Riga = MonitoraggioJson["righe"][number];

const SCELTE_MINUTI = [5, 10, 15] as const;
const MINUTI_MAX = 120;

/** I minuti in più, a uno studente o a tutti: 5, 10, 15 con un clic, o un
 * valore scritto (1–120, come il server). */
export function MinutiDialog({ titolo, descrizione, testo, accessibile, disabled, onScegli }: {
  titolo: string;
  descrizione: string;
  testo: string;
  accessibile?: string;
  disabled?: boolean;
  onScegli: (minuti: number) => void;
}) {
  const t = useTranslations("esercizi.verifica.docente");
  const id = useId();
  const [aperta, setAperta] = useState(false);
  const [altro, setAltro] = useState("");
  const [errore, setErrore] = useState(false);

  function cambiaApertura(nuova: boolean) {
    if (nuova) {
      setAltro("");
      setErrore(false);
    }
    setAperta(nuova);
  }

  function scegli(minuti: number) {
    setAperta(false);
    onScegli(minuti);
  }

  function aggiungiAltro(e: React.FormEvent) {
    e.preventDefault();
    const minuti = /^\d+$/.test(altro.trim()) ? Number(altro) : NaN;
    if (!(minuti >= 1 && minuti <= MINUTI_MAX)) {
      setErrore(true);
      return;
    }
    scegli(minuti);
  }

  return (
    <Dialog open={aperta} onOpenChange={cambiaApertura}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" disabled={disabled} />} aria-label={accessibile}>
        {testo}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg leading-snug break-words">{titolo}</DialogTitle>
          <DialogDescription>{descrizione}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2">
          {SCELTE_MINUTI.map((n) => (
            <Button key={n} type="button" variant="secondary" onClick={() => scegli(n)}>
              {t("minuti.scelta", { n })}
            </Button>
          ))}
        </div>
        <form onSubmit={aggiungiAltro} noValidate className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-altro`} className="text-sm">{t("minuti.altro")}</label>
            <Input
              id={`${id}-altro`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MINUTI_MAX}
              step={1}
              value={altro}
              onChange={(e) => {
                setAltro(e.target.value);
                setErrore(false);
              }}
              aria-invalid={errore || undefined}
              className="w-28"
            />
          </div>
          <Button type="submit" variant="outline">{t("minuti.aggiungi")}</Button>
        </form>
        {errore && <p role="alert" className="text-sm text-destructive">{t("minuti.erroreValore")}</p>}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("annulla")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const COLORE_STATO: Record<Riga["stato"], string> = {
  non_entrato: "text-muted-foreground",
  in_corso: "bg-brand-blue-50 text-brand-blue",
  consegnato: "bg-brand-green-50 text-brand-green",
  consegnato_auto: "bg-brand-green-50 text-brand-green",
};

/** La tabella del monitoraggio: una riga per iscritto, nessun punteggio
 * (durante la prova nemmeno il docente lo vede). Il tempo residuo scorre
 * in locale (`trascorsiMs` dall'ultima lettura) fra un aggiornamento e
 * l'altro; tempo extra PDP e minuti dati si vedono solo qui, dal docente.
 * Le righe recuperabili hanno una casella per il recupero, quelle in
 * recupero ancora aperto «Chiudi recupero». */
export function MonitoraggioVerifica({ righe, oraServer, trascorsiMs, occupato, onAzione }: {
  righe: Riga[];
  oraServer: string;
  trascorsiMs: number;
  occupato: boolean;
  onAzione: (corpo: CorpoAzione) => Promise<boolean>;
}) {
  const t = useTranslations("esercizi.verifica.docente");
  const tM = useTranslations("esercizi.verifica.docente.monitoraggio");
  const locale = useLocale() === "en" ? "en" : "it";
  const [scelti, setScelti] = useState<Set<string>>(new Set());

  // Solo chi è ancora recuperabile: una scelta fatta prima di un
  // aggiornamento (lo studente nel frattempo è entrato) non vale più.
  const daRecuperare = righe.filter((r) => r.recuperabile && scelti.has(r.studentId)).map((r) => r.studentId);
  const conRecupero = righe.some((r) => r.recuperabile);

  function cambiaScelta(studentId: string, scelto: boolean) {
    setScelti((prima) => {
      const dopo = new Set(prima);
      if (scelto) dopo.add(studentId);
      else dopo.delete(studentId);
      return dopo;
    });
  }

  async function avviaRecupero() {
    if (await onAzione({ azione: "recupero", studentIds: daRecuperare })) setScelti(new Set());
  }

  if (righe.length === 0) return <p className="text-sm text-muted-foreground">{tM("nessunoIscritto")}</p>;

  return (
    <section aria-labelledby="monitoraggio-titolo" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="monitoraggio-titolo" className="text-lg font-semibold">{tM("titolo")}</h2>
        <p className="text-xs text-muted-foreground">{tM("aggiornato", { ora: formattaOra(new Date(oraServer), locale) })}</p>
      </div>

      {conRecupero && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-orange-50 px-3 py-2 text-sm text-brand-ink">
          <Button type="button" size="sm" disabled={occupato || daRecuperare.length === 0} onClick={avviaRecupero}>
            {tM("avviaRecupero", { n: daRecuperare.length })}
          </Button>
          <span className="min-w-0 flex-1 basis-60">{tM("recuperoAiuto")}</span>
        </div>
      )}

      {/* `relative`: le intestazioni sr-only (assolute) restano dentro la
          scatola che scorre, invece di allargare la pagina sul telefono. */}
      <div className="relative overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b text-left">
              {conRecupero && <th className="w-10 p-2 font-medium"><span className="sr-only">{tM("selezione")}</span></th>}
              <th className="p-2 font-medium">{tM("studente")}</th>
              <th className="p-2 font-medium">{tM("stato")}</th>
              <th className="p-2 font-medium">{tM("risposti")}</th>
              <th className="p-2 font-medium">{tM("tempo")}</th>
              <th className="p-2 font-medium">{tM("uscite")}</th>
              <th className="p-2 font-medium">{tM("salvataggio")}</th>
              <th className="p-2 font-medium"><span className="sr-only">{tM("azioni")}</span></th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => {
              const puoLavorare = r.secondiResidui != null;
              const recuperoAperto = r.recupero && (r.stato === "non_entrato" || r.stato === "in_corso");
              return (
                <tr key={r.studentId} className="border-b last:border-b-0">
                  {conRecupero && (
                    <td className="p-2">
                      {r.recuperabile && (
                        <input
                          type="checkbox"
                          checked={scelti.has(r.studentId)}
                          onChange={(e) => cambiaScelta(r.studentId, e.target.checked)}
                          aria-label={tM("seleziona", { nome: r.nome })}
                          className="size-4 accent-brand-orange"
                        />
                      )}
                    </td>
                  )}
                  <td className="p-2 font-medium">{r.nome}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${COLORE_STATO[r.stato]}`}>{tM(r.stato)}</span>
                      {r.recupero && (
                        <span className="rounded bg-brand-orange-50 px-1.5 py-0.5 text-xs font-medium text-brand-orange">{tM("recupero")}</span>
                      )}
                    </span>
                  </td>
                  <td className="p-2 tabular-nums">{tM("rispostiValore", { risposti: r.risposti, totale: r.totale })}</td>
                  <td className="p-2">
                    <span className="flex flex-wrap items-center gap-1">
                      <span className="tabular-nums">
                        {puoLavorare ? formattaResiduo(r.secondiResidui! * 1000 - trascorsiMs) : tM("mai")}
                      </span>
                      {r.tempoExtraPct > 0 && (
                        <span className="rounded bg-brand-magenta-50 px-1 text-xs text-brand-magenta">{tM("tempoExtra", { pct: r.tempoExtraPct })}</span>
                      )}
                      {r.minutiExtra > 0 && (
                        <span className="rounded bg-brand-blue-50 px-1 text-xs text-brand-blue">{tM("minutiExtra", { n: r.minutiExtra })}</span>
                      )}
                    </span>
                  </td>
                  <td className="p-2">
                    {r.uscite === 0 ? (
                      <span className="text-muted-foreground">{tM("nessunaUscita")}</span>
                    ) : (
                      <span className="flex flex-col">
                        <span className="font-medium text-brand-orange">{tM("usciteValore", { n: r.uscite })}</span>
                        {r.secondiFuori > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums">{tM("fuori", { tempo: formattaResiduo(r.secondiFuori * 1000) })}</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="p-2 tabular-nums">
                    {r.ultimoSalvataggioAt ? formattaOra(new Date(r.ultimoSalvataggioAt), locale) : tM("mai")}
                  </td>
                  <td className="p-2">
                    <span className="flex flex-wrap justify-end gap-2">
                      {puoLavorare && (
                        <MinutiDialog
                          titolo={t("minuti.titoloDi", { nome: r.nome })}
                          descrizione={t("minuti.descrizioneDi")}
                          testo={t("minuti.pulsante")}
                          accessibile={t("minuti.pulsanteDi", { nome: r.nome })}
                          disabled={occupato}
                          onScegli={(minuti) => void onAzione({ azione: "minuti", minuti, studentId: r.studentId })}
                        />
                      )}
                      {recuperoAperto && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={occupato}
                          aria-label={tM("chiudiRecuperoDi", { nome: r.nome })}
                          onClick={() => void onAzione({ azione: "chiudiRecupero", studentIds: [r.studentId] })}
                        >
                          {tM("chiudiRecupero")}
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
