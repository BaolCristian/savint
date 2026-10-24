import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { contenutoContenitore } from "@/lib/esercizi/contenitori";
import { puo, ruoliEsercizi, utenteDaSessione } from "@/lib/esercizi/accesso";
import { accessoEsercizi } from "@/lib/esercizi/redazione";
import { prisma } from "@/lib/db/client";
import { CondividiDialog } from "@/components/esercizi/condivisione/condividi-dialog";
import { testiCondivisione } from "@/components/esercizi/condivisione/testi-condivisione";
import { buttonVariants } from "@/components/ui/button-variants";
import { ContenitoreDetailClient } from "./contenitore-detail-client";
import { TeacherExercisesNav } from "../../teacher-exercises-nav";
import { etichetteNav } from "../../aree";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await redirectUnlessTeacher();
  const chi = utenteDaSessione(session);
  const t = await getTranslations("esercizi.contenitori");
  const tBase = await getTranslations("esercizi");
  const tUi = await getTranslations("teacherExercisesUi");

  const { id } = await params;
  // Gli esercizi che il docente vede, una volta sola per la richiesta
  // (`ruoliEsercizi` li carica tutti): servono sia al contenuto della
  // raccolta sia all'elenco di quelli da aggiungere.
  const visibili = await ruoliEsercizi(chi);
  // Una raccolta che non vede è un 404, come una che non esiste.
  const contenitore = await contenutoContenitore(id, chi, visibili);
  if (!contenitore) notFound();
  const modificabile = puo(contenitore.ruolo, "modificare");

  const dentroIds = new Set(contenitore.esercizi.map((e) => e.id));
  // Chi può ancora entrare: gli esercizi che il docente vede, tranne chi
  // c'è già. Nessuno, se la raccolta per lui è in sola lettura.
  const disponibili = modificabile
    ? await prisma.esercizio.findMany({
        where: { id: { in: [...visibili.keys()].filter((e) => !dentroIds.has(e)) } },
        orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
      })
    : [];

  // Regola delle raccolte: un esercizio proprio messo in una raccolta di cui
  // si è contributori (proprietario o editor nominato) e che è aperta a
  // qualcuno diventa visibile ai suoi membri. Se oggi è privato, il client
  // chiede conferma prima di aggiungerlo. Solo per gli esercizi propri (un
  // amministratore è PROPRIETARIO di tutto, ma non è l'autore: la raccolta
  // non trasmette ciò che non ha messo l'autore) e solo se la raccolta li
  // trasmetterebbe davvero (`contenitore.trasmette`, la stessa regola di
  // accesso.ts: un editor di scuola non contribuisce, quindi niente avviso).
  const propri = contenitore.trasmette
    ? disponibili.filter((e) => e.authorId === chi.id && visibili.get(e.id) === "PROPRIETARIO")
    : [];
  const accessi = await accessoEsercizi(propri);
  const privati = new Set(propri.filter((e) => accessi.get(e.id) === "privato").map((e) => e.id));

  const sottotitolo = (e: { yearLevel: number; topic: string; difficulty: number }) =>
    `${tBase("annoArgomento", { anno: e.yearLevel, argomento: e.topic })} · ${tBase("difficolta", { livello: e.difficulty })}`;

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={etichetteNav(tUi)} />
      <div>
        <Link href="/dashboard/esercizi/contenitori" className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{contenitore.name}</h1>
            {contenitore.description && (
              <p className="text-sm text-muted-foreground">{contenitore.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Nuovo compito, Task 7: dalla raccolta si assegna direttamente
                — apre il Nuovo compito con un blocco su questa raccolta. A
                chiunque la veda (assegnare non la modifica), ma non se è
                vuota: non ci sarebbe niente da pescare. */}
            {contenitore.esercizi.length > 0 && (
              <Link href={`/dashboard/esercizi/compiti/nuovo?raccolta=${encodeURIComponent(id)}`} className={buttonVariants()}>
                {t("assegna")}
              </Link>
            )}
            {/* "Condividi" solo al proprietario della raccolta (o all'ADMIN). */}
            {puo(contenitore.ruolo, "condividere") && (
              <CondividiDialog risorsa={{ tipo: "contenitore", id }} titolo={contenitore.name} testi={await testiCondivisione()} admin={chi.admin} />
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("eserciziNelContenitore")}</h2>
      </div>

      <ContenitoreDetailClient
        contenitoreId={id}
        dentro={contenitore.esercizi.map((e) => ({ id: e.id, title: e.title, subtitle: sottotitolo(e), anno: e.yearLevel, argomento: e.topic }))}
        fuori={disponibili.map((e) => ({ id: e.id, title: e.title, subtitle: sottotitolo(e), anno: e.yearLevel, argomento: e.topic, privato: privati.has(e.id) }))}
        modificabile={modificabile}
        testi={{
          nessunoDentro: t("nessunEsercizioNelContenitore"),
          rimuovi: t("rimuovi"),
          titoloAggiungi: t("aggiungiEsercizi"),
          nessunoFuori: t("nessunEsercizioDaAggiungere"),
          aggiungi: t("aggiungi"),
          erroreGenerico: t("erroreGenerico"),
          anteprima: t("anteprima"),
          cerca: tUi("collections.search"),
          anno: tUi("collections.year"),
          argomento: tUi("collections.topic"),
          tutti: tUi("collections.all"),
          nessunRisultato: tUi("collections.noResults"),
          avvisoPrivato: t("avvisoPrivato"),
          confermaAggiunta: t("confermaAggiunta"),
          annulla: t("annulla"),
        }}
      />
    </div>
  );
}
