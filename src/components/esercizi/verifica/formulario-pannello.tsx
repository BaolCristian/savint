"use client";

import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FormularioPannelloProps {
  /** L'indirizzo del formulario, già passato da `withBasePath`: una rotta
   * della stessa origine che controlla chi può vederlo. */
  src: string;
  tipo: "immagine" | "pdf";
  aperto: boolean;
  onChiudi: () => void;
}

/** Il formulario della verifica in un pannello laterale `fixed` (visibile
 * anche a schermo intero): un'immagine o un PDF della stessa origine. */
export function FormularioPannello({ src, tipo, aperto, onChiudi }: FormularioPannelloProps) {
  const t = useTranslations("esercizi.provaStudente");
  if (!aperto) return null;

  return (
    <aside
      role="dialog"
      aria-label={t("formulario")}
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-xl"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-900">{t("formulario")}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label={t("chiudiFormulario")} onClick={onChiudi}>
          <X aria-hidden="true" className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {tipo === "immagine" ? (
          // eslint-disable-next-line @next/next/no-img-element -- rotta protetta, non un'immagine statica da ottimizzare
          <img src={src} alt={t("formulario")} className="h-auto w-full" />
        ) : (
          <iframe src={src} title={t("formulario")} className="h-full w-full border-0" />
        )}
      </div>
    </aside>
  );
}
