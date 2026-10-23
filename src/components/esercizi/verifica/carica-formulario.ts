import { withBasePath } from "@/lib/base-path";

/** L'esito del caricamento di un formulario: il nome che il server gli ha
 * dato (`formularioFile` della verifica) o il motivo del rifiuto, che chi
 * chiama traduce nei suoi testi. */
export type EsitoCaricamentoFormulario =
  | { ok: true; file: string }
  | { ok: false; motivo: "tipo" | "grande" | "troppe_richieste" | "caricamento" };

/** Carica un formulario (immagine o PDF) appena scelto: lo stesso giro per
 * la pagina Nuovo compito e per le impostazioni di una verifica preparata. */
export async function caricaFormulario(file: File): Promise<EsitoCaricamentoFormulario> {
  const dati = new FormData();
  dati.append("file", file);
  try {
    const res = await fetch(withBasePath("/api/esercizi/verifiche/formulari"), { method: "POST", body: dati });
    const corpo = await res.json().catch(() => ({}));
    if (res.ok && typeof corpo.file === "string") return { ok: true, file: corpo.file };
    if (corpo.error === "tipo_non_ammesso") return { ok: false, motivo: "tipo" };
    if (corpo.error === "troppo_grande") return { ok: false, motivo: "grande" };
    if (res.status === 429) return { ok: false, motivo: "troppe_richieste" };
    return { ok: false, motivo: "caricamento" };
  } catch {
    return { ok: false, motivo: "caricamento" };
  }
}
