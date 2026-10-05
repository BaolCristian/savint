import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { avviaORiprendi } from "@/lib/esercizi/tentativo";
import { percorsoCompitoStudente } from "@/lib/esercizi/percorso-compito";
import { PlayerEsercizioLazy } from "@/components/esercizi/player/player-esercizio-lazy";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ esercizioId: string }>;
  // Opzionale: un esercizio aperto dal link libero non ne porta nessuno.
  searchParams?: Promise<{ compitoId?: string; percorso?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { esercizioId } = await params;
  // Aperto da un compito (link `?compitoId=...` nella home dello studente) o
  // dal link libero (nessun parametro): `avviaORiprendi` tiene i due
  // percorsi su tentativi distinti, vedi il commento nel dominio.
  const parametri = await searchParams;
  const compitoId = parametri?.compitoId;
  const locale = (await getLocale()) === "en" ? "en" : "it";
  // Un vecchio tab o il tasto indietro può riportare qui dopo che il
  // tentativo è già stato completato altrove. Si risolve PRIMA di aprire il
  // tentativo: altrimenti `avviaORiprendi` creerebbe una nuova riga vuota
  // per un passo che non è più quello corrente.
  const percorso = compitoId && parametri?.percorso === "1"
    ? await percorsoCompitoStudente(compitoId, session.user.id)
    : null;
  if (compitoId && parametri?.percorso === "1" && percorso && percorso.prossimo?.esercizioId !== esercizioId) {
    redirect(`/studente/compito/${compitoId}`);
  }
  const tentativo = await avviaORiprendi(session.user.id, esercizioId, compitoId, locale);
  if (!tentativo) notFound();

  // Solo il resolver appena visitato autorizza l'avanzamento automatico:
  // un link secondario a un esercizio del compito resta consultabile senza
  // trasformarsi in una ripresa artificiale dell'intera consegna.
  const corrente = !tentativo.richiestaCompitoRifiutata && percorso?.prossimo?.esercizioId === esercizioId ? percorso.prossimo : null;
  const compito = corrente ? { id: compitoId!, indice: corrente.indice, totale: percorso!.totale } : undefined;
  const titolo =
    typeof tentativo.content === "object" && tentativo.content !== null &&
    "name" in tentativo.content && typeof tentativo.content.name === "string"
      ? tentativo.content.name
      : undefined;

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
      richiestaCompitoRifiutata={tentativo.richiestaCompitoRifiutata}
      locale={locale}
      titolo={titolo}
      contesto={compitoId && !tentativo.richiestaCompitoRifiutata ? "assigned" : "free"}
      compito={compito}
      allCorrectIniziale={tentativo.allCorrect}
    />
  );
}
