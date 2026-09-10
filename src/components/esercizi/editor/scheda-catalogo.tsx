"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";

const ANNI = [1, 2, 3, 4, 5];
const DIFFICOLTA = [1, 2, 3] as const;

export interface SchedaCatalogoProps {
  /** Tutti i metadati tranne il titolo, che resta nell'intestazione della
   * pagina: è l'unico che si scrive mentre si pensa all'esercizio, non un
   * dato di catalogo da ripiegare via. */
  meta: EsercizioEditor["meta"];
  onChange: (campo: keyof EsercizioEditor["meta"], valore: unknown) => void;
}

/** I metadati di catalogo — descrizione, anno, difficoltà, argomento, tag —
 * dietro un `<details>`: non si consultano mentre si scrive l'esercizio, ma
 * servono a chi lo cerca nel catalogo dopo. Il riassunto accanto al
 * riepilogo («2ª · Equazioni · media») resta visibile a scheda chiusa,
 * così chi scorre la colonna sa cosa c'è dentro senza doverla aprire. */
export function SchedaCatalogo({ meta, onChange }: SchedaCatalogoProps) {
  const t = useTranslations("esercizi.redazione");

  const riassunto = t("catalogo.riassunto", {
    anno: meta.anno,
    argomento: meta.argomento,
    difficolta: t(`meta.difficolta${meta.difficolta}`),
  });

  return (
    <details className="rounded-lg border bg-card p-4">
      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-base font-semibold">{t("catalogo.titolo")}</span>
        <span className="text-xs font-medium text-muted-foreground">{riassunto}</span>
      </summary>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="redazione-descrizione" className="text-xs font-medium text-muted-foreground">
            {t("meta.descrizione")}
          </label>
          <Textarea
            id="redazione-descrizione"
            value={meta.descrizione}
            onChange={(e) => onChange("descrizione", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-anno" className="text-xs font-medium text-muted-foreground">
            {t("meta.anno")}
          </label>
          <select
            id="redazione-anno"
            value={meta.anno}
            onChange={(e) => onChange("anno", Number(e.target.value))}
            className="h-8 w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {ANNI.map((anno) => (
              <option key={anno} value={anno}>
                {anno}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-difficolta" className="text-xs font-medium text-muted-foreground">
            {t("meta.difficolta")}
          </label>
          <select
            id="redazione-difficolta"
            value={meta.difficolta}
            onChange={(e) => onChange("difficolta", Number(e.target.value))}
            className="h-8 w-32 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {DIFFICOLTA.map((d) => (
              <option key={d} value={d}>
                {t(`meta.difficolta${d}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-argomento" className="text-xs font-medium text-muted-foreground">
            {t("meta.argomento")}
          </label>
          <Input
            id="redazione-argomento"
            value={meta.argomento}
            onChange={(e) => onChange("argomento", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-tag" className="text-xs font-medium text-muted-foreground">
            {t("meta.tag")}
          </label>
          <Input
            id="redazione-tag"
            value={meta.tag.join(", ")}
            onChange={(e) =>
              onChange(
                "tag",
                e.target.value
                  .split(",")
                  .map((tag) => tag.trim())
                  .filter((tag) => tag.length > 0),
              )
            }
          />
          <p className="text-xs text-muted-foreground">{t("meta.tagAiuto")}</p>
        </div>
      </div>
    </details>
  );
}
