"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EsercizioEditor } from "@/lib/esercizi/editor/modello";
import { PannelloVariabili } from "./pannello-variabili";

/** Un esercizio nuovo, vuoto: `parti: []` non è ancora valido per lo schema
 * del dominio (`esercizioEditorSchema.parti.min(1)`) — non deve esserlo qui,
 * è solo lo stato iniziale del modulo prima che il docente scriva qualcosa.
 * Le parti arrivano nel Task 7, che estende questo componente. */
export const ESERCIZIO_VUOTO: EsercizioEditor = {
  meta: { titolo: "", descrizione: "", anno: 1, argomento: "", tag: [], difficolta: 1 },
  testo: "",
  suggerimento: "",
  variabili: [],
  condizione: "",
  parti: [],
};

const ANNI = [1, 2, 3, 4, 5];
const DIFFICOLTA = [1, 2, 3] as const;

export interface EditorEsercizioProps {
  /** L'esercizio da modificare, così com'è arrivato da `caricaPerEditor`; assente per un esercizio nuovo. */
  valoreIniziale?: EsercizioEditor;
}

/** Il modulo di redazione: metadati, testo, suggerimento e variabili in
 * questo task; le parti e l'anteprima arrivano nel Task 7, che estende
 * questo stesso componente (mai una riscrittura: lo stato che questo task
 * introduce — `editor`, `setEditor` — è quello su cui le parti e
 * l'anteprima continueranno a operare). */
export function EditorEsercizio({ valoreIniziale }: EditorEsercizioProps) {
  const t = useTranslations("esercizi.redazione");
  const [editor, setEditor] = useState<EsercizioEditor>(valoreIniziale ?? ESERCIZIO_VUOTO);

  function aggiornaMeta<K extends keyof EsercizioEditor["meta"]>(campo: K, valore: EsercizioEditor["meta"][K]) {
    setEditor((e) => ({ ...e, meta: { ...e.meta, [campo]: valore } }));
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t("titolo")}</h1>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="redazione-titolo" className="text-sm font-medium">
            {t("meta.titolo")}
          </label>
          <Input
            id="redazione-titolo"
            value={editor.meta.titolo}
            onChange={(e) => aggiornaMeta("titolo", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="redazione-descrizione" className="text-sm font-medium">
            {t("meta.descrizione")}
          </label>
          <Textarea
            id="redazione-descrizione"
            value={editor.meta.descrizione}
            onChange={(e) => aggiornaMeta("descrizione", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-anno" className="text-sm font-medium">
            {t("meta.anno")}
          </label>
          <select
            id="redazione-anno"
            value={editor.meta.anno}
            onChange={(e) => aggiornaMeta("anno", Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {ANNI.map((anno) => (
              <option key={anno} value={anno}>
                {anno}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-difficolta" className="text-sm font-medium">
            {t("meta.difficolta")}
          </label>
          <select
            id="redazione-difficolta"
            value={editor.meta.difficolta}
            onChange={(e) => aggiornaMeta("difficolta", Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {DIFFICOLTA.map((d) => (
              <option key={d} value={d}>
                {t(`meta.difficolta${d}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-argomento" className="text-sm font-medium">
            {t("meta.argomento")}
          </label>
          <Input
            id="redazione-argomento"
            value={editor.meta.argomento}
            onChange={(e) => aggiornaMeta("argomento", e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="redazione-tag" className="text-sm font-medium">
            {t("meta.tag")}
          </label>
          <Input
            id="redazione-tag"
            value={editor.meta.tag.join(", ")}
            onChange={(e) =>
              aggiornaMeta(
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
      </section>

      <div className="flex flex-col gap-1">
        <label htmlFor="redazione-testo" className="text-sm font-medium">
          {t("testo")}
        </label>
        <Textarea
          id="redazione-testo"
          value={editor.testo}
          onChange={(e) => setEditor((ed) => ({ ...ed, testo: e.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="redazione-suggerimento" className="text-sm font-medium">
          {t("suggerimento")}
        </label>
        <Textarea
          id="redazione-suggerimento"
          value={editor.suggerimento}
          onChange={(e) => setEditor((ed) => ({ ...ed, suggerimento: e.target.value }))}
        />
        <p className="text-xs text-muted-foreground">{t("suggerimentoAiuto")}</p>
      </div>

      <PannelloVariabili
        variabili={editor.variabili}
        onChange={(variabili) => setEditor((ed) => ({ ...ed, variabili }))}
        condizione={editor.condizione}
        onChangeCondizione={(condizione) => setEditor((ed) => ({ ...ed, condizione }))}
      />
    </div>
  );
}
