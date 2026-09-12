"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { renderLatex } from "@savint/engine";
import { Input } from "@/components/ui/input";
import { TastieraSimboli, useTastieraSimboli } from "@/components/esercizi/tastiera-simboli";
import { Formula } from "../formula";
import type { InputParteProps } from "./index";

/** `jme`: la risposta è un'espressione matematica in sintassi JME, testo
 * libero (lettere, operatori, parentesi: non un `inputMode` numerico).
 *
 * Solo la variante non in linea ha la tastiera di simboli e l'anteprima:
 * quella in linea sta in mezzo alla frase di un gapfill, dove una riga di
 * tasti romperebbe l'impaginazione (vedi `numero.tsx` per lo stesso
 * ragionamento sul contenitore `span`). */
export function InputEspressione({ parte, valore, onChange, disabilitato, inLinea }: InputParteProps) {
  const t = useTranslations("esercizi");
  const id = `campo-${parte.path}`;
  const testo = typeof valore === "string" ? valore : "";
  const { campoRef, inserisciSimbolo } = useTastieraSimboli(testo, onChange);

  // Il motore lancia sulla maggior parte dei prefissi non validi ("12*x^" lo
  // è, come ogni suo prefisso), ma non su tutti: `sqrt()` (l'argomento
  // mancante appena premuto il tasto radice, prima che lo studente scriva
  // qualcosa) non lancia e produce invece "\sqrt{ undefined }" — un buco
  // del motore che non si può chiudere da qui (non si tocca
  // `packages/engine`). Si scarta anche questo caso, non solo quello che
  // lancia: mostrare la parola "undefined" dentro una radice sarebbe un
  // errore del motore travestito da anteprima.
  const anteprimaLatex = useMemo(() => {
    const espressione = testo.trim();
    if (!espressione) return null;
    try {
      const latex = renderLatex(espressione);
      return /\bundefined\b/.test(latex) ? null : latex;
    } catch {
      return null;
    }
  }, [testo]);

  const contenuto = (
    <>
      <label htmlFor={id} className="sr-only">
        {t("rispostaEspressione")}
      </label>
      <Input
        id={id}
        ref={campoRef}
        inputMode="text"
        autoComplete="off"
        placeholder={inLinea ? undefined : t("segnapostoEspressione")}
        className={inLinea ? "w-40" : undefined}
        value={testo}
        disabled={disabilitato}
        onChange={(e) => onChange(e.target.value)}
      />
    </>
  );

  if (inLinea) {
    // Vedi `numero.tsx`: in linea il contenitore è uno `span`, perché il
    // campo sta dentro la frase del prompt di un gapfill.
    return <span className="inline-flex items-center gap-2 align-middle">{contenuto}</span>;
  }

  return (
    <div className="flex flex-col gap-2">
      <TastieraSimboli onInserisci={inserisciSimbolo} disabilitato={disabilitato} />
      <div className="flex items-center gap-2">{contenuto}</div>
      {anteprimaLatex !== null && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t("anteprimaEspressione")}</span>
          <Formula tex={anteprimaLatex} />
        </div>
      )}
    </div>
  );
}
