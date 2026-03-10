"use client";

import { useState } from "react";
import { Copy, Check, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const PROMPT = `Sei un assistente per la creazione di quiz didattici. Devi generare un file Excel (.xlsx) compatibile con la piattaforma SAVINT.

Il file deve contenere 5 fogli, uno per ogni tipo di domanda. Usa ESATTAMENTE i nomi dei fogli e delle colonne indicati qui sotto.

---

📋 FOGLIO 1: "Scelta Multipla"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Opzione1 | Opzione2 | Opzione3 | Opzione4 | Opzione5 | Opzione6 | Corretta

- Da 2 a 6 opzioni per domanda
- "Corretta" indica il numero dell'opzione corretta (es. "1" oppure "1,3" se più di una è corretta)
- Tempo in secondi (default: 30), Punti (default: 1000), Confidenza: S o N (default: N)

📋 FOGLIO 2: "Vero o Falso"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Risposta (V/F)

- Risposta: "V" per vero, "F" per falso

📋 FOGLIO 3: "Risposta Aperta"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Risposta1 | Risposta2 | Risposta3

- Inserisci le risposte accettate (il confronto è case-insensitive)
- Almeno una risposta obbligatoria

📋 FOGLIO 4: "Ordinamento"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Elemento1 | Elemento2 | Elemento3 | Elemento4 | Elemento5 | Elemento6

- Inserisci gli elementi NELL'ORDINE CORRETTO (da 2 a 6 elementi)
- La piattaforma li mescolerà automaticamente durante il quiz

📋 FOGLIO 5: "Stima Numerica"
Colonne: Domanda | Tempo (sec) | Punti | Confidenza (S/N) | Valore Corretto | Tolleranza | Range Massimo | Unità

- Valore Corretto: il numero esatto
- Tolleranza: margine entro cui il punteggio è pieno
- Range Massimo: oltre questo margine il punteggio è zero
- Unità: opzionale (es. "km", "milioni", "°C")

---

REGOLE IMPORTANTI:
- La prima riga di ogni foglio DEVE essere l'intestazione con i nomi delle colonne esatti
- La seconda riga è un esempio (verrà ignorata all'importazione)
- I dati delle domande partono dalla riga 3
- Le colonne Tempo, Punti e Confidenza sono opzionali (verranno usati i default)
- I fogli vuoti vengono ignorati, non serve riempirli tutti
- Genera il file .xlsx, NON un file .csv

Ora crea un quiz sull'argomento: [ARGOMENTO]

Genera almeno 10 domande distribuite su diversi tipi. Usa un mix di difficoltà.`;

export default function AiPromptsPage() {
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
      const res = await fetch("/api/quiz/excel-template");
      if (!res.ok) throw new Error("Errore nel download");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "savint-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Errore nel download del template");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Crea quiz con l&apos;AI
        </h1>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Copia il prompt qui sotto e incollalo nel tuo chatbot preferito (ChatGPT, Gemini, Claude, Copilot...).
          Sostituisci <strong>[ARGOMENTO]</strong> con il tema del quiz. Il chatbot genererà un file Excel
          che potrai importare direttamente in SAVINT.
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
                Copiato
              </>
            ) : (
              <>
                <Copy className="size-4 mr-1.5" />
                Copia
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
          Scarica Template Excel di riferimento
        </Button>
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-800 dark:text-amber-200">
        <strong>Suggerimento:</strong> dopo aver generato il file Excel con il chatbot, scaricalo
        e importalo dalla pagina <strong>I miei Quiz</strong> usando il bottone &quot;Importa Excel&quot;.
        SAVINT validera il file e ti mostrerà eventuali errori prima dell&apos;importazione.
      </div>
    </div>
  );
}
