"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { caricaFormulario } from "@/components/esercizi/verifica/carica-formulario";
import { withBasePath } from "@/lib/base-path";
import { DURATA_MAX, DURATA_MIN, durataValida } from "@/lib/esercizi/verifica-regole";
import type { VerificaJson } from "./verifica-docente-client";

type ModoStrumento = VerificaJson["calcolatrice"];
const STRUMENTI: ModoStrumento[] = ["NESSUNO", "SOLO_PDP", "TUTTI"];

const ETICHETTA = "text-sm font-medium";
const SELECT = "h-10 rounded-lg border border-input bg-background px-3 text-sm";

const due = (n: number) => String(n).padStart(2, "0");

/** Un istante nel formato del campo `datetime-local`, sull'ora del browser:
 * la stessa che il campo usa al ritorno (`new Date(valore)`), come nella
 * pagina Nuovo compito. */
function perCampoOrario(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())}T${due(d.getHours())}:${due(d.getMinutes())}`;
}

const nessunaIscrizione = () => () => {};

/** Le impostazioni che una verifica preparata può ancora cambiare: durata,
 * avvio, strumenti e formulario (esercizi e punti no: per quelli si ritira
 * e se ne crea un'altra). Un solo PATCH con tutti i campi; le regole sui
 * valori sono del server, qui solo un primo controllo sulla durata. */
export function ImpostazioniVerifica({ compitoId, verifica, onSalvate }: {
  compitoId: string;
  verifica: VerificaJson;
  onSalvate: () => void;
}) {
  const t = useTranslations("esercizi.verifica.docente.impostazioni");
  const tC = useTranslations("esercizi.verifica.creazione");
  const tE = useTranslations("esercizi.verifica.docente.errori");

  // L'orario si mostra sull'ora del browser, che il server non conosce:
  // finché la pagina non è idratata il campo resta vuoto, così l'HTML del
  // server e quello del primo render coincidono.
  const idratata = useSyncExternalStore(nessunaIscrizione, () => true, () => false);

  const [durata, setDurata] = useState(String(verifica.durataMinuti));
  const [avvioOrario, setAvvioOrario] = useState(verifica.avvioProgrammatoAt != null);
  // null finché il docente non tocca il campo: vale l'orario salvato.
  const [orario, setOrario] = useState<string | null>(null);
  const [calcolatrice, setCalcolatrice] = useState<ModoStrumento>(verifica.calcolatrice);
  const [modoFormulario, setModoFormulario] = useState<ModoStrumento>(
    verifica.formulario === "NESSUNO" ? "SOLO_PDP" : verifica.formulario,
  );
  // `nome` è il nome originale di un file appena caricato; quello già
  // salvato si riconosce solo dal nome che gli ha dato il server.
  const [formulario, setFormulario] = useState<{ file: string; nome: string | null } | null>(
    verifica.formularioFile ? { file: verifica.formularioFile, nome: null } : null,
  );
  const [caricamento, setCaricamento] = useState(false);
  const [erroreFormulario, setErroreFormulario] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [esito, setEsito] = useState<{ ok: true } | { ok: false; messaggio: string } | null>(null);

  const orarioSalvato = idratata ? perCampoOrario(verifica.avvioProgrammatoAt) : "";
  const valoreOrario = orario ?? orarioSalvato;
  const durataMinuti = /^\d+$/.test(durata.trim()) ? Number(durata) : NaN;
  const durataOk = durataValida(durataMinuti);

  async function scegliFormulario(file: File) {
    setCaricamento(true);
    setErroreFormulario(null);
    setEsito(null);
    const r = await caricaFormulario(file);
    if (r.ok) {
      setFormulario({ file: r.file, nome: file.name });
    } else {
      setErroreFormulario(
        r.motivo === "tipo"
          ? tC("erroreFormularioTipo")
          : r.motivo === "grande"
            ? tC("erroreFormularioGrande")
            : r.motivo === "troppe_richieste"
              ? tE("troppe")
              : tC("erroreFormularioCaricamento"),
      );
    }
    setCaricamento(false);
  }

  async function salva(e: React.FormEvent) {
    e.preventDefault();
    setEsito(null);
    const avvio = avvioOrario && valoreOrario ? new Date(valoreOrario) : null;
    if (!durataOk || (avvioOrario && (!avvio || Number.isNaN(avvio.getTime())))) {
      setEsito({ ok: false, messaggio: t("erroreValori") });
      return;
    }
    setSalvando(true);
    try {
      const res = await fetch(withBasePath(`/api/esercizi/verifiche/${compitoId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durataMinuti,
          avvioProgrammatoAt: avvio ? avvio.toISOString() : null,
          calcolatrice,
          // Senza file non c'è formulario da mostrare: si manda NESSUNO.
          formulario: formulario ? modoFormulario : "NESSUNO",
          formularioFile: formulario?.file ?? null,
        }),
      });
      if (res.ok) {
        setEsito({ ok: true });
      } else {
        setEsito({
          ok: false,
          messaggio:
            res.status === 409 ? t("erroreAvviata")
              : res.status === 400 ? t("erroreValori")
                : res.status === 429 ? tE("troppe")
                  : res.status === 404 ? tE("nonTrovata")
                    : tE("generico"),
        });
      }
    } catch {
      setEsito({ ok: false, messaggio: tE("generico") });
    }
    setSalvando(false);
    // Anche dopo un rifiuto: la verifica può essere partita nel frattempo.
    onSalvate();
  }

  const etichettaStrumento = (m: ModoStrumento) =>
    m === "NESSUNO" ? tC("strumentoNessuno") : m === "SOLO_PDP" ? tC("strumentoSoloPdp") : tC("strumentoTutti");

  return (
    <section aria-labelledby="impostazioni-titolo" className="space-y-4 rounded-xl border-2 border-brand-blue bg-card p-4">
      <h2 id="impostazioni-titolo" className="text-sm font-semibold uppercase tracking-wide text-brand-blue">
        {t("titolo")}
      </h2>
      <form onSubmit={salva} className="space-y-4">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="iv-durata" className={ETICHETTA}>{tC("durata")}</label>
            <Input
              id="iv-durata"
              type="number"
              inputMode="numeric"
              required
              min={DURATA_MIN}
              max={DURATA_MAX}
              value={durata}
              onChange={(e) => setDurata(e.target.value)}
              aria-describedby="iv-durata-aiuto"
              aria-invalid={(durata.trim() !== "" && !durataOk) || undefined}
              className="h-10 w-28 tabular-nums"
            />
            <span id="iv-durata-aiuto" className="text-xs text-muted-foreground">
              {tC("durataAiuto", { min: DURATA_MIN, max: DURATA_MAX })}
            </span>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${ETICHETTA} mb-1.5`}>{tC("avvio")}</legend>
            {[false, true].map((aOrario) => (
              <label key={String(aOrario)} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="iv-avvio"
                  checked={avvioOrario === aOrario}
                  onChange={() => setAvvioOrario(aOrario)}
                  className="size-4 accent-brand-blue"
                />
                {aOrario ? tC("avvioOrario") : tC("avvioManuale")}
              </label>
            ))}
            {avvioOrario && (
              <Input
                type="datetime-local"
                value={valoreOrario}
                onChange={(e) => setOrario(e.target.value)}
                aria-label={tC("orario")}
                className="ml-6 h-10 w-56 max-w-[calc(100%-1.5rem)]"
              />
            )}
          </fieldset>
        </div>

        <div className="flex flex-wrap items-start gap-x-8 gap-y-3 border-t border-border pt-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className={ETICHETTA}>{tC("formulario")}</span>
            {formulario && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {formulario.nome ? (
                  <span className="truncate font-medium">{formulario.nome}</span>
                ) : (
                  <>
                    <span className="font-medium">{t("formularioCaricato")}</span>
                    <a
                      href={withBasePath(`/api/esercizi/verifiche/${compitoId}/formulario`)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-blue hover:underline"
                    >
                      {t("apri")}
                    </a>
                  </>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => setFormulario(null)}>
                  {tC("togliFormulario")}
                </Button>
              </div>
            )}
            <label htmlFor="iv-formulario-file" className="text-sm text-muted-foreground">
              {formulario ? t("sostituisci") : t("carica")}
            </label>
            <input
              id="iv-formulario-file"
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              disabled={caricamento}
              aria-describedby="iv-formulario-aiuto"
              onChange={(e) => {
                const file = e.target.files?.[0];
                // Svuotato subito: lo stesso file si può riscegliere dopo un errore.
                e.target.value = "";
                if (file) void scegliFormulario(file);
              }}
              className="max-w-full text-sm file:mr-3 file:h-9 file:rounded-lg file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium hover:file:bg-muted"
            />
            <span id="iv-formulario-aiuto" className="text-xs text-muted-foreground">
              {caricamento ? tC("formularioCaricamento") : tC("formularioAiuto")}
            </span>
            {erroreFormulario && <span role="alert" className="text-sm text-destructive">{erroreFormulario}</span>}
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className={`${ETICHETTA} mb-1.5`}>{tC("strumenti")}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="iv-calcolatrice" className="text-sm text-muted-foreground">{tC("calcolatrice")}</label>
                <select
                  id="iv-calcolatrice"
                  value={calcolatrice}
                  onChange={(e) => setCalcolatrice(e.target.value as ModoStrumento)}
                  className={SELECT}
                >
                  {STRUMENTI.map((m) => <option key={m} value={m}>{etichettaStrumento(m)}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="iv-formulario-modo" className="text-sm text-muted-foreground">{tC("formularioStrumento")}</label>
                <select
                  id="iv-formulario-modo"
                  value={formulario ? modoFormulario : "NESSUNO"}
                  disabled={!formulario}
                  onChange={(e) => setModoFormulario(e.target.value as ModoStrumento)}
                  aria-describedby={formulario ? undefined : "iv-formulario-modo-aiuto"}
                  className={`${SELECT} disabled:opacity-60`}
                >
                  {STRUMENTI.map((m) => <option key={m} value={m}>{etichettaStrumento(m)}</option>)}
                </select>
                {!formulario && (
                  <span id="iv-formulario-modo-aiuto" className="text-xs text-muted-foreground">{tC("formularioStrumentoAiuto")}</span>
                )}
              </div>
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={salvando || caricamento}>
            {salvando ? t("salvataggio") : t("salva")}
          </Button>
          {esito?.ok && <span role="status" className="text-sm text-brand-green">{t("salvate")}</span>}
          {esito && !esito.ok && <span role="alert" className="text-sm text-destructive">{esito.messaggio}</span>}
        </div>
      </form>
    </section>
  );
}
