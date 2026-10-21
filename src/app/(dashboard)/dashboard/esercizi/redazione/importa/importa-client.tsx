"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";
import { withBasePath } from "@/lib/base-path";
import { estraiEsercizi, MAX_ESERCIZI_IMPORT } from "@/lib/esercizi/importa/estrai";
import { testoErrorePerIA, type EsitoControllo, type EsitoImport } from "@/lib/esercizi/importa/tipi";

/** Gli errori delle rotte che hanno un testo dedicato; il resto è "generico". */
type ErroreServer = "invalid_body" | "troppo_grande" | "rate_limited" | "non_autorizzato" | "generico";

/** L'errore mostrato sopra l'elenco: o del testo (prima di chiamare il
 * server, da `estraiEsercizi`) o della risposta di una rotta. */
type Errore =
  | { tipo: "testo"; motivo: "vuoto" | "non_json" | "troppi"; dettaglio: string }
  | { tipo: "file" }
  | { tipo: "server"; codice: ErroreServer };

/** Status e corpo di una risposta non 200 → la chiave del testo. Il corpo
 * delle rotte è `{ error: "..." }`; 401/403 non hanno un codice nostro. */
async function erroreDaRisposta(res: Response): Promise<ErroreServer> {
  if (res.status === 401 || res.status === 403) return "non_autorizzato";
  if (res.status === 413) return "troppo_grande";
  if (res.status === 429) return "rate_limited";
  try {
    const corpo = (await res.json()) as { error?: unknown };
    if (corpo.error === "invalid_body" || corpo.error === "troppo_grande" || corpo.error === "rate_limited") {
      return corpo.error;
    }
  } catch {
    // Corpo non JSON: resta l'errore generico.
  }
  return "generico";
}

/** Stessa tecnica di `nuovoSorteggio` in anteprima-docente-client.tsx. */
function nuovoSorteggio(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Argomento, anno e difficoltà letti dall'elemento grezzo del file: la
 * verifica restituisce solo titolo e `content`, e per un esercizio `ok`
 * questi campi hanno già passato lo schema, ma qui si legge con prudenza. */
function metaGrezza(elemento: unknown): { argomento?: string; anno?: number; difficolta?: number } {
  if (typeof elemento !== "object" || elemento === null) return {};
  const meta = (elemento as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return {};
  const m = meta as Record<string, unknown>;
  return {
    argomento: typeof m.argomento === "string" ? m.argomento : undefined,
    anno: typeof m.anno === "number" ? m.anno : undefined,
    difficolta: typeof m.difficolta === "number" ? m.difficolta : undefined,
  };
}

/** L'anteprima di un esercizio `ok`: un sorteggio alla volta e "Altri
 * numeri", come `AnteprimaDocenteClient`. `soloLocale`: il player non
 * chiama la rete e non crea nessun tentativo. */
function AnteprimaImport({ indice, content, locale }: { indice: number; content: unknown; locale: "it" | "en" }) {
  const t = useTranslations("esercizi.redazione.importa");
  const [sorteggio, setSorteggio] = useState<string>(nuovoSorteggio);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t("seme", { seme: sorteggio })}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => setSorteggio(nuovoSorteggio())}>
          {t("altriNumeri")}
        </Button>
      </div>
      {/* `key`: un sorteggio nuovo rimonta il player da capo (vedi
          anteprima-docente-client.tsx). */}
      <div key={sorteggio} className="rounded-lg border p-3">
        <PlayerEsercizioLazy
          tentativoId={`anteprima-importa-${indice}-${sorteggio}`}
          esercizioId={`importa-${indice}`}
          seed={sorteggio}
          content={content}
          statoIniziale={null}
          lastActivityAt={new Date()}
          locale={locale}
          soloLocale
        />
      </div>
    </div>
  );
}

function SchedaEsito({
  esito,
  elemento,
  locale,
}: {
  esito: EsitoControllo;
  elemento: unknown;
  locale: "it" | "en";
}) {
  const t = useTranslations("esercizi.redazione.importa");
  const tBase = useTranslations("esercizi");
  const tMeta = useTranslations("esercizi.redazione.meta");
  const [copiato, setCopiato] = useState(false);

  const titolo = esito.titolo ?? t("esercizioNumero", { numero: esito.indice + 1 });
  const meta = metaGrezza(elemento);

  const stato = {
    ok: { testo: t("statoOk"), classe: "bg-brand-green/15 text-brand-green" },
    invalido: { testo: t("statoInvalido"), classe: "bg-destructive/10 text-destructive" },
    verifica_fallita: { testo: t("statoVerificaFallita"), classe: "bg-destructive/10 text-destructive" },
    gia_presente: { testo: t("statoGiaPresente"), classe: "bg-brand-orange/15 text-brand-orange" },
  }[esito.stato];

  async function copia() {
    if (esito.stato === "ok") return;
    await navigator.clipboard.writeText(testoErrorePerIA(esito));
    setCopiato(true);
    setTimeout(() => setCopiato(false), 2000);
  }

  return (
    <article className="space-y-3 rounded-lg border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{titolo}</h2>
          {esito.stato === "ok" && meta.anno !== undefined && meta.argomento !== undefined && (
            <p className="text-sm text-muted-foreground">
              {tBase("annoArgomento", { anno: meta.anno, argomento: meta.argomento })}
              {meta.difficolta !== undefined && meta.difficolta >= 1 && meta.difficolta <= 3 && (
                <> · {tMeta(`difficolta${meta.difficolta as 1 | 2 | 3}`)}</>
              )}
            </p>
          )}
        </div>
        <Badge className={stato.classe}>{stato.testo}</Badge>
      </header>

      {esito.stato === "ok" && <AnteprimaImport indice={esito.indice} content={esito.content} locale={locale} />}

      {esito.stato === "invalido" && (
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {esito.problemi.map((p, i) => (
            <li key={i}>
              {p.percorso && <code className="font-mono text-xs">{p.percorso}</code>}
              {p.percorso && ": "}
              {p.messaggio}
            </li>
          ))}
        </ul>
      )}

      {esito.stato === "verifica_fallita" && (
        <p className="text-sm">
          {t("verificaFallita", {
            fase: esito.dettaglio.fase,
            seme: esito.dettaglio.seme,
            messaggio: esito.dettaglio.messaggio,
          })}
        </p>
      )}

      {esito.stato === "gia_presente" && (
        <p className="text-sm">
          {esito.nelFile
            ? t("giaNelFile", { titolo: esito.titoloEsistente })
            : t("giaImportato", { titolo: esito.titoloEsistente })}
        </p>
      )}

      {esito.stato !== "ok" && (
        <Button type="button" variant="outline" size="sm" onClick={copia}>
          {copiato ? t("copiato") : t("copiaErrore")}
        </Button>
      )}
    </article>
  );
}

/** La pagina di import: testo (o file) → controllo → una scheda per
 * esercizio → import dei soli `ok`. Gli elementi grezzi si tengono per
 * indice: l'import manda proprio quelli (il server rifà tutto), e la scheda
 * ne legge argomento/anno/difficoltà. */
export function ImportaClient({ locale }: { locale: "it" | "en" }) {
  const t = useTranslations("esercizi.redazione.importa");
  const router = useRouter();

  const [testo, setTesto] = useState("");
  const [errore, setErrore] = useState<Errore | null>(null);
  const [controlloInCorso, setControlloInCorso] = useState(false);
  const [controllo, setControllo] = useState<{ elementi: unknown[]; esiti: EsitoControllo[] } | null>(null);
  const [importInCorso, setImportInCorso] = useState(false);
  // Il guardiano vero contro il doppio clic: lo stato `importInCorso`
  // disabilita il pulsante solo al rendering successivo.
  const importAvviato = useRef(false);

  function cambiaTesto(nuovo: string) {
    setTesto(nuovo);
    // Gli esiti valgono per il testo controllato: se cambia, vanno rifatti,
    // altrimenti "Importa" manderebbe gli elementi del testo di prima.
    setControllo(null);
    setErrore(null);
  }

  async function caricaFile(file: File | undefined) {
    if (!file) return;
    try {
      cambiaTesto(await file.text());
    } catch {
      setErrore({ tipo: "file" });
    }
  }

  async function controlla() {
    setErrore(null);
    setControllo(null);
    const estratto = estraiEsercizi(testo);
    if (!estratto.ok) {
      setErrore({ tipo: "testo", motivo: estratto.motivo, dettaglio: estratto.messaggio });
      return;
    }
    setControlloInCorso(true);
    try {
      const res = await fetch(withBasePath("/api/esercizi/redazione/importa/verifica"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esercizi: estratto.elementi }),
      });
      if (!res.ok) {
        setErrore({ tipo: "server", codice: await erroreDaRisposta(res) });
        return;
      }
      const corpo = (await res.json()) as { esiti: EsitoControllo[] };
      setControllo({ elementi: estratto.elementi, esiti: corpo.esiti });
    } catch {
      setErrore({ tipo: "server", codice: "generico" });
    } finally {
      setControlloInCorso(false);
    }
  }

  const daImportare = controllo ? controllo.esiti.filter((e) => e.stato === "ok") : [];
  const nSaltati = controllo ? controllo.esiti.length - daImportare.length : 0;

  async function importa() {
    if (!controllo || daImportare.length === 0 || importAvviato.current) return;
    importAvviato.current = true;
    setImportInCorso(true);
    setErrore(null);
    let finito = false;
    try {
      const esercizi = daImportare.map((e) => controllo.elementi[e.indice]);
      const res = await fetch(withBasePath("/api/esercizi/redazione/importa"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ esercizi }),
      });
      if (!res.ok) {
        setErrore({ tipo: "server", codice: await erroreDaRisposta(res) });
        return;
      }
      const corpo = (await res.json()) as { esiti: EsitoImport[] };
      const creati = corpo.esiti.filter((e) => e.stato === "creato").length;
      // Saltati: quelli scartati al controllo più quelli che il server ha
      // rifiutato all'import (doppioni nel frattempo, errori di salvataggio).
      const saltati = controllo.esiti.length - creati;
      finito = true;
      router.push(`/dashboard/esercizi/redazione?importati=${creati}&saltati=${saltati}`);
    } catch {
      setErrore({ tipo: "server", codice: "generico" });
    } finally {
      // A import riuscito il pulsante resta disabilitato fino al cambio di
      // pagina: un clic in quell'attimo rifarebbe l'import.
      if (!finito) {
        importAvviato.current = false;
        setImportInCorso(false);
      }
    }
  }

  const testoErrore =
    errore === null
      ? null
      : errore.tipo === "testo"
        ? errore.motivo === "troppi"
          ? t("erroreTesto.troppi", { max: MAX_ESERCIZI_IMPORT })
          : errore.motivo === "non_json"
            ? `${t("erroreTesto.non_json")} ${errore.dettaglio}`
            : t("erroreTesto.vuoto")
        : errore.tipo === "file"
          ? t("erroreFile")
          : t(`erroreServer.${errore.codice}`);

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border p-4">
        <div className="space-y-1">
          <label htmlFor="importa-file" className="text-sm font-medium">{t("file")}</label>
          <input
            id="importa-file"
            type="file"
            accept=".json,application/json"
            className="block text-sm file:mr-3 file:rounded-md file:border file:bg-transparent file:px-3 file:py-1 file:text-sm"
            onChange={(e) => void caricaFile(e.target.files?.[0])}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="importa-testo" className="text-sm font-medium">{t("incolla")}</label>
          <Textarea
            id="importa-testo"
            value={testo}
            onChange={(e) => cambiaTesto(e.target.value)}
            spellCheck={false}
            className="max-h-96 min-h-40 font-mono text-xs"
          />
        </div>
        <Button type="button" onClick={controlla} disabled={controlloInCorso || importInCorso}>
          {controlloInCorso ? t("controlloInCorso") : t("controlla")}
        </Button>
      </section>

      {testoErrore && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {testoErrore}
        </p>
      )}

      {controllo && (
        <>
          <div className="space-y-3">
            {controllo.esiti.map((esito) => (
              <SchedaEsito
                key={esito.indice}
                esito={esito}
                elemento={controllo.elementi[esito.indice]}
                locale={locale}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={importa} disabled={daImportare.length === 0 || importInCorso}>
              {importInCorso ? t("importaInCorso") : t("importa", { n: daImportare.length })}
            </Button>
            {nSaltati > 0 && <p className="text-sm text-muted-foreground">{t("saltati", { n: nSaltati })}</p>}
          </div>
        </>
      )}
    </div>
  );
}
