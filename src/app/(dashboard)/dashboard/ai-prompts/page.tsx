"use client";

import { useState } from "react";
import { Copy, Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { withBasePath } from "@/lib/base-path";
import { useTranslations } from "next-intl";

const PROMPT = `Sei un assistente per la creazione di quiz didattici. Devi generare un file Excel (.xlsx) compatibile con la piattaforma SAVINT.

Il file deve contenere 5 fogli, uno per ogni tipo di domanda. Usa ESATTAMENTE i nomi dei fogli e delle colonne indicati qui sotto.

---

\u{1F4CB} FOGLIO 1: "Scelta Multipla"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Opzione1 | Opzione2 | Opzione3 | Opzione4 | Opzione5 | Opzione6 | Corretta

- Da 2 a 6 opzioni per domanda
- "Corretta" indica il numero dell'opzione corretta (es. "1" oppure "1,3" se pi\u00f9 di una \u00e8 corretta)
- Tempo in secondi (default: 30), Punti (default: 1000), Confidenza: S o N (default: N)

\u{1F4CB} FOGLIO 2: "Vero o Falso"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Risposta (V/F)

- Risposta: "V" per vero, "F" per falso

\u{1F4CB} FOGLIO 3: "Risposta Aperta"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Risposta1 | Risposta2 | Risposta3

- Inserisci le risposte accettate (il confronto \u00e8 case-insensitive)
- Almeno una risposta obbligatoria

\u{1F4CB} FOGLIO 4: "Ordinamento"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Elemento1 | Elemento2 | Elemento3 | Elemento4 | Elemento5 | Elemento6

- Inserisci gli elementi NELL'ORDINE CORRETTO (da 2 a 6 elementi)
- La piattaforma li mescol\u00e8ra automaticamente durante il quiz

\u{1F4CB} FOGLIO 5: "Stima Numerica"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Valore Corretto | Tolleranza | Range Massimo | Unit\u00e0

- Valore Corretto: il numero esatto
- Tolleranza: margine entro cui il punteggio \u00e8 pieno
- Range Massimo: oltre questo margine il punteggio \u00e8 zero
- Unit\u00e0: opzionale (es. "km", "milioni", "\u00b0C")

---

REGOLE IMPORTANTI:
- La prima riga di ogni foglio DEVE essere l'intestazione con i nomi delle colonne esatti
- La seconda riga \u00e8 un esempio (verr\u00e0 ignorata all'importazione)
- I dati delle domande partono dalla riga 3
- Le colonne Tempo, Punti e Confidenza sono opzionali (verranno usati i default)
- I fogli vuoti vengono ignorati, non serve riempirli tutti
- Genera il file .xlsx, NON un file .csv

Ora crea un quiz sull'argomento: [ARGOMENTO]
Destinatari: [TARGET, es. scuola primaria, scuola media, scuola superiore (biennio), scuola superiore (triennio), universit\u00e0, formazione adulti]
Lingua delle domande e risposte: [LINGUA, es. italiano, inglese, francese...]

Adatta il livello di difficolt\u00e0, il linguaggio e la complessit\u00e0 delle domande al target indicato. Genera almeno 10 domande distribuite su diversi tipi. Usa un mix di difficolt\u00e0 adeguato al livello. Scrivi TUTTE le domande, le opzioni di risposta e le risposte nella lingua indicata.`;

export default function AiPromptsPage() {
  const t = useTranslations("ai");
  const tc = useTranslations("common");
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(PROMPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownloadTemplate() {
    setDownloading(true);
    try {
      const res = await fetch(withBasePath("/api/quiz/excel-template"));
      if (!res.ok) throw new Error(t("downloadError"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "savint-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert(t("downloadTemplateError"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">
          {t("title")}
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          {t("instruction")}{" "}
          {t("highlights")}{" "}
          {t("importHint")}
        </p>
      </div>

      <div className="relative">
        <div className="absolute top-3 right-3 z-10">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="bg-white dark:bg-slate-800"
          >
            {copied ? (
              <>
                <Check className="size-4 mr-1.5 text-emerald-600" />
                {tc("copied")}
              </>
            ) : (
              <>
                <Copy className="size-4 mr-1.5" />
                {tc("copy")}
              </>
            )}
          </Button>
        </div>
        <pre className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-5 pr-28 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-[60vh] overflow-y-auto">
          {PROMPT}
        </pre>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start">
        <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloading}>
          {downloading ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Download className="size-4 mr-2" />
          )}
          {t("downloadTemplate")}
        </Button>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
        {t("tip")}
      </div>
    </div>
  );
}
