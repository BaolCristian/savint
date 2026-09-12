"use client";

import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";

const ANNI = [1, 2, 3, 4, 5];
const DIFFICOLTA = [1, 2, 3] as const;

export interface SchedaCatalogoProps {
  /** Tutti i metadati tranne il titolo, che apre invece la colonna di
   * scrittura: è l'unico che si scrive mentre si pensa all'esercizio, non
   * un dato di catalogo da ripiegare via. */
  meta: EsercizioEditor["meta"];
  /** Generica sul campo, non `unknown`: `onChange("tag", "una stringa")`
   * deve restare un errore di tipo, non un crash a runtime dentro
   * `meta.tag.join` più sotto. Firma identica a `aggiornaMeta` in
   * `editor-esercizio.tsx`, che la implementa: nessuna lambda intermedia
   * necessaria al callsite. */
  onChange: <K extends keyof EsercizioEditor["meta"]>(campo: K, valore: EsercizioEditor["meta"][K]) => void;
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
    <details className="group rounded-lg border bg-card p-4">
      {/* `list-none` toglie il triangolino solo su Chrome/Firefox: Safari
       * (WebKit) ignora `list-style` sui `<summary>` e lo mostra comunque —
       * va spento esplicitamente. Tolto il marcatore nativo, il chevron qui
       * sotto (ruotato via `group-open:` quando la scheda è aperta) resta
       * l'unico segnale — su ogni motore, anche touch, dove `cursor-pointer`
       * non esiste — che «Catalogo» è qualcosa che si apre. */}
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden="true" />
        <span className="text-base font-semibold">{t("catalogo.titolo")}</span>
        <span className="ml-auto text-xs font-medium text-muted-foreground">{riassunto}</span>
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
