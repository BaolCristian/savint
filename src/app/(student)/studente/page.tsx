import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookOpen, ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { compitiDelloStudente } from "@/lib/esercizi/compiti";
import { Card } from "@/components/ui/card";

type Traduttore = (chiave: string, valori?: Record<string, string | number>) => string;
type StatoTentativo = { status: string; score: number; maxScore: number };

/** Cosa dire dell'ultimo tentativo di uno studente su un esercizio.
 *
 * L'elenco prendeva il tentativo più recente senza guardarne lo stato e lo
 * annunciava sempre come "Tentativo in corso: {score}/{maxScore}", due volte
 * in contrasto col dominio: un tentativo CHIUSO veniva detto in corso, e un
 * tentativo appena aperto mostrava "0/0", perché il massimo lo scrive il
 * server solo quando arriva la prima risposta (`applicaRisposta`) e fino ad
 * allora la colonna vale zero — un massimo che non è mai stato zero per
 * nessun esercizio. */
function statoTentativo(t: Traduttore, tentativo: StatoTentativo): string {
  const punteggi = { score: tentativo.score, maxScore: tentativo.maxScore };
  if (tentativo.status === "COMPLETED") return t("ultimoTentativo", punteggi);
  // Aperto ma senza nessuna risposta: non c'è ancora un massimo da mostrare.
  if (tentativo.maxScore <= 0) return t("tentativoAperto");
  return t("tentativoInCorso", punteggi);
}

export default async function StudentHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("esercizi");

  const [esercizi, compitiGrezzi] = await Promise.all([
    prisma.esercizio.findMany({
      orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          include: {
            tentativi: {
              where: { studentId: session.user.id },
              orderBy: { startedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
    compitiDelloStudente(session.user.id),
  ]);

  // `compitiDelloStudente` non espone `opensAt` (non è nel suo contratto):
  // lo si legge qui con una query mirata, solo per decidere la visibilità.
  // Un compito senza data di apertura, o con una già passata, si vede; una
  // scadenza passata invece non nasconde niente — è un punto aperto della
  // spec, non deciso qui.
  const opensAtPerCompito = new Map(
    (
      await prisma.compito.findMany({
        where: { id: { in: compitiGrezzi.map((c) => c.id) } },
        select: { id: true, opensAt: true },
      })
    ).map((c) => [c.id, c.opensAt] as const),
  );
  const ora = new Date();
  const compiti = compitiGrezzi.filter((c) => {
    const opensAt = opensAtPerCompito.get(c.id) ?? null;
    return opensAt == null || opensAt <= ora;
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue">
          <BookOpen className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">{t("titoloStudente")}</h1>
      </div>

      {compiti.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange/10 text-brand-orange">
              <ClipboardList className="h-4 w-4" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">{t("compitiTitolo")}</h2>
          </div>
          <ul className="grid gap-3">
            {compiti.map((c) => (
              <li key={c.id}>
                <Card className="gap-2 border border-brand-orange/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{c.batteria}</p>
                    <p className="text-sm text-muted-foreground">
                      {c.dueAt
                        ? t("compitoScadenza", { quando: c.dueAt.toLocaleDateString("it-IT") })
                        : t("compitoSenzaScadenza")}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t("compitoProgresso", { fatti: c.fatti, totali: c.esercizi.length })}
                  </p>
                  <ul className="mt-1 grid gap-1">
                    {c.esercizi.map((e) => (
                      <li key={e.esercizioId}>
                        <Link
                          href={`/studente/esercizio/${e.esercizioId}?compitoId=${c.id}`}
                          className="text-sm font-medium text-brand-blue hover:underline"
                        >
                          {e.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        {compiti.length > 0 && <h2 className="text-lg font-bold text-slate-900">{t("liberiTitolo")}</h2>}
        {esercizi.length === 0 ? (
        <div className="rounded-3xl border border-white/80 bg-white/70 p-8 text-center shadow-xl shadow-slate-200/50 backdrop-blur-xl">
          <p className="text-slate-600">{t("nessunEsercizio")}</p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {esercizi.map((e) => {
            const versione = e.versions[0];
            const tentativo = versione?.tentativi[0];
            return (
              <li key={e.id}>
                <Link href={`/studente/esercizio/${e.id}`} className="block">
                  <Card className="flex-row items-center justify-between gap-4 p-4 transition hover:bg-muted/50">
                    <div>
                      <p className="font-medium text-slate-900">{e.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {t("annoArgomento", { anno: e.yearLevel, argomento: e.topic })}
                        {" · "}
                        {t("difficolta", { livello: e.difficulty })}
                      </p>
                      {tentativo && (
                        <p className="mt-1 text-sm font-medium text-brand-blue">
                          {statoTentativo(t, tentativo)}
                        </p>
                      )}
                    </div>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </section>
  );
}
