"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { withBasePath } from "@/lib/base-path";
// Solo il tipo: misure-pdp.ts legge il database, e un client component non
// deve tirarselo dietro nel bundle.
import type { MisurePdpValori } from "@/lib/esercizi/misure-pdp";

// Le percentuali di tempo supplementare più comuni nei PDP; qualunque altro
// valore intero da 0 a 100 passa da «altro».
const SCELTE = [0, 15, 20, 25, 30, 50] as const;
type Scelta = `${(typeof SCELTE)[number]}` | "altro";

function sceltaIniziale(pct: number): Scelta {
  return (SCELTE as readonly number[]).includes(pct) ? (`${pct}` as Scelta) : "altro";
}

/** Le misure PDP di un iscritto: tempo supplementare e tre spunte, nient'altro
 * (mai diagnosi o note). `endpoint` arriva senza basePath — lo stesso dialogo
 * serve la classe e, più avanti, una singola verifica — e riceve un PUT
 * `{ studentId, misure }`. Dopo il salvataggio la pagina si rilegge, così il
 * segno «PDP» accanto all'iscritto segue quel che è stato salvato.
 * `etichetta` cambia il testo del pulsante (e il suo nome accessibile, che
 * deve contenere il testo visibile); `onSalvato` serve a chi tiene le misure
 * in uno stato suo, che `router.refresh()` non rilegge. */
export function MisurePdpDialog({
  studentId,
  nome,
  iniziali,
  endpoint,
  etichetta,
  onSalvato,
}: {
  studentId: string;
  nome: string;
  iniziali: MisurePdpValori;
  endpoint: string;
  etichetta?: { testo: string; accessibile: string };
  onSalvato?: () => void;
}) {
  const t = useTranslations("esercizi.misurePdp");
  const router = useRouter();
  const id = useId();

  const [aperta, setAperta] = useState(false);
  const [scelta, setScelta] = useState<Scelta>(sceltaIniziale(iniziali.tempoExtraPct));
  const [altro, setAltro] = useState(String(iniziali.tempoExtraPct));
  const [menoEsercizi, setMenoEsercizi] = useState(iniziali.menoEsercizi);
  const [calcolatrice, setCalcolatrice] = useState(iniziali.calcolatrice);
  const [formulario, setFormulario] = useState(iniziali.formulario);
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  // Ogni apertura riparte da quel che è salvato: una modifica annullata non
  // deve ricomparire alla volta dopo.
  function cambiaApertura(nuova: boolean) {
    if (nuova) {
      setScelta(sceltaIniziale(iniziali.tempoExtraPct));
      setAltro(String(iniziali.tempoExtraPct));
      setMenoEsercizi(iniziali.menoEsercizi);
      setCalcolatrice(iniziali.calcolatrice);
      setFormulario(iniziali.formulario);
      setErrore(null);
    }
    setAperta(nuova);
  }

  async function salva() {
    // Il server rifiuta comunque (misurePdpSchema): qui serve a dirlo subito,
    // senza un giro di rete.
    const testo = scelta === "altro" ? altro.trim() : scelta;
    const tempoExtraPct = /^\d+$/.test(testo) ? Number(testo) : NaN;
    if (!(tempoExtraPct >= 0 && tempoExtraPct <= 100)) {
      setErrore(t("erroreTempo"));
      return;
    }

    setSalvando(true);
    setErrore(null);
    try {
      const res = await fetch(withBasePath(endpoint), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId, misure: { tempoExtraPct, menoEsercizi, calcolatrice, formulario } }),
      });
      if (!res.ok) {
        setErrore(t("errore"));
        return;
      }
      setAperta(false);
      router.refresh();
      onSalvato?.();
    } catch {
      setErrore(t("errore"));
    } finally {
      setSalvando(false);
    }
  }

  const spunte = [
    { chiave: "menoEsercizi", valore: menoEsercizi, cambia: setMenoEsercizi },
    { chiave: "calcolatrice", valore: calcolatrice, cambia: setCalcolatrice },
    { chiave: "formulario", valore: formulario, cambia: setFormulario },
  ] as const;

  return (
    <Dialog open={aperta} onOpenChange={cambiaApertura}>
      <DialogTrigger
        render={<button type="button" className="text-sm text-brand-blue hover:underline" />}
        aria-label={etichetta?.accessibile ?? t("pulsanteDi", { nome })}
      >
        {etichetta?.testo ?? t("pulsante")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg leading-snug break-words">{t("titolo", { nome })}</DialogTitle>
          <DialogDescription>{t("descrizione")}</DialogDescription>
        </DialogHeader>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("tempoExtra")}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {[...SCELTE.map((p) => `${p}` as Scelta), "altro" as const].map((valore) => (
              <label key={valore} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={`${id}-tempo`}
                  value={valore}
                  checked={scelta === valore}
                  onChange={() => setScelta(valore)}
                />
                {valore === "altro" ? t("altro") : valore === "0" ? t("nessuno") : t("percentuale", { pct: valore })}
              </label>
            ))}
          </div>
          {scelta === "altro" && (
            <div className="space-y-1">
              <label htmlFor={`${id}-altro`} className="text-sm">{t("altroEtichetta")}</label>
              <Input
                id={`${id}-altro`}
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                step={1}
                value={altro}
                onChange={(e) => setAltro(e.target.value)}
                className="w-28"
              />
            </div>
          )}
        </fieldset>

        <div className="space-y-2">
          {spunte.map((s) => (
            <label key={s.chiave} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.valore} onChange={(e) => s.cambia(e.target.checked)} />
              {t(s.chiave)}
            </label>
          ))}
        </div>

        {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{t("annulla")}</DialogClose>
          <Button type="button" onClick={salva} disabled={salvando}>
            {salvando ? t("salvataggio") : t("salva")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
