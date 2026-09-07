"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ParteEditor } from "@/lib/esercizi/editor/modello";

type ParteEspressioneEditor = Extract<ParteEditor, { tipo: "espressione" }>;

export interface ParteEspressioneProps {
  parte: ParteEspressioneEditor;
  onChange: (parte: ParteEspressioneEditor) => void;
  onRimuovi: () => void;
}

/** La parte a risposta in formula: il motore confronta simbolicamente, non
 * lo studente contro un solo modo di scriverla — vale la pena dirlo qui,
 * dove il docente scrive la risposta attesa, perché senza saperlo si finisce
 * per scrivere istruzioni difensive ("semplifica il risultato") che non
 * servono (vedi il brief del Task 7). */
export function ParteEspressione({ parte, onChange, onRimuovi }: ParteEspressioneProps) {
  const t = useTranslations("esercizi.redazione.parti");
  const idRisposta = "parte-espressione-risposta";

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">{t("consegna")}</label>
        <Textarea value={parte.consegna} onChange={(e) => onChange({ ...parte, consegna: e.target.value })} />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex w-24 flex-col gap-1">
          <label className="text-sm font-medium">{t("punti")}</label>
          <Input
            type="number"
            min={1}
            value={parte.punti}
            onChange={(e) => onChange({ ...parte, punti: Number(e.target.value) })}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={idRisposta} className="text-sm font-medium">
            {t("espressione.risposta")}
          </label>
          <Input
            id={idRisposta}
            value={parte.risposta}
            onChange={(e) => onChange({ ...parte, risposta: e.target.value })}
          />
        </div>
      </div>

      <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
        {t("espressione.spiegazioneConfronto")}
      </p>

      <Button type="button" variant="outline" size="sm" onClick={onRimuovi}>
        {t("rimuovi")}
      </Button>
    </div>
  );
}
