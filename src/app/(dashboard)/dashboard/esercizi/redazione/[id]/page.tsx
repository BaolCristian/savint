import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { caricaPerEditor } from "@/lib/esercizi/redazione";
import { ModificaEsercizioClient } from "./modifica-esercizio-client";

/** La modifica di un esercizio esistente. Chi arriva dall'elenco (Task 8)
 * arriva qui solo per un esercizio già segnato modificabile — ma l'URL è
 * diretto, quindi questa pagina deve reggere anche una visita a un id non
 * modificabile o inesistente, non solo il caso comodo. `caricaPerEditor` è
 * anche il controllo: `non_trovato` è un 404 (mai una pagina che finge un
 * esercizio inesistente), `non_rappresentabile` mostra lo stesso motivo del
 * dominio invece dell'editor — mai "duplica" qui: duplicare non
 * cambierebbe il verdetto (vedi il commento su `duplicaEsercizio`,
 * redazione.ts), lasciando solo un'altra copia di sola lettura. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.redazione.elenco");
  const { id } = await params;

  const esito = await caricaPerEditor(id);

  if (!esito.ok) {
    if (esito.motivo === "non_trovato") notFound();
    return (
      <div className="space-y-4 p-6">
        <Link href="/dashboard/esercizi/redazione" className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <h1 className="text-xl font-semibold">{t("nonModificabileTitolo")}</h1>
        {/* `esito.dettaglio` è il messaggio del dominio (`daNumbas`,
            SUGGERIMENTO_REPOSITORIO): chiude già da sé con "può essere
            modificato solo intervenendo direttamente nel repository dei
            contenuti". Questa pagina non lo ripete più in un secondo
            paragrafo — prima diceva la stessa frase due volte. */}
        <p className="text-sm text-muted-foreground">{esito.dettaglio}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <Link href="/dashboard/esercizi/redazione" className="text-sm text-brand-blue hover:underline">
        {t("torna")}
      </Link>
      <ModificaEsercizioClient esercizioId={id} valoreIniziale={esito.editor} />
    </div>
  );
}
