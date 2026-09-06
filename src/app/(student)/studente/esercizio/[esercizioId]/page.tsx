import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ esercizioId: string }>;
  // Opzionale: un esercizio aperto dal link libero non ne porta nessuno.
  searchParams?: Promise<{ compitoId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { esercizioId } = await params;
  // Aperto da un compito (link `?compitoId=...` nella home dello studente) o
  // dal link libero (nessun parametro): `avviaORiprendi` tiene i due
  // percorsi su tentativi distinti, vedi il commento nel dominio.
  const compitoId = (await searchParams)?.compitoId;
  const tentativo = await avviaORiprendi(session.user.id, esercizioId, compitoId);
  if (!tentativo) notFound();

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    // `key`: dopo un abbandono (`abbandona`, dominio) il tentativo attuale
    // cambia — `router.refresh()` rifà girare questa pagina e chiama di
    // nuovo `avviaORiprendi`, che qui trova il vecchio non più `IN_PROGRESS`
    // e ne apre uno nuovo. Senza una `key` diversa React riutilizzerebbe la
    // stessa istanza del player, che carica domanda e seme una volta sola al
    // montaggio (vedi il commento gemello lì): il "ricomincia" sembrerebbe
    // riuscito ma in scena resterebbe il vecchio tentativo.
    <PlayerEsercizioLazy
      key={tentativo.tentativoId}
      tentativoId={tentativo.tentativoId}
      esercizioId={esercizioId}
      seed={tentativo.seed}
      content={tentativo.content}
      statoIniziale={tentativo.state}
      lastActivityAt={tentativo.lastActivityAt}
      locale={locale}
    />
  );
}
