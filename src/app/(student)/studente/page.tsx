import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BookOpen, CheckCircle2, ClipboardList } from "lucide-react";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { compitiDelloStudente } from "@/lib/esercizi/compiti";
import { Card } from "@/components/ui/card";
import { CatalogoEsercizi, type StatoCatalogo } from "./catalogo-esercizi";
import { IscrizioneClasseForm } from "./iscrizione-classe-form";

type Traduttore = (chiave: string, valori?: Record<string, string | number>) => string;
type StatoTentativo = { status: string; score: number; maxScore: number };
type StatoAssegnato = StatoCatalogo | "toComplete";

function dettaglioTentativo(t: Traduttore, tentativo: StatoTentativo): string | undefined {
  const punteggi = { score: tentativo.score, maxScore: tentativo.maxScore };
  if (tentativo.status === "COMPLETED") return t("ultimoTentativo", punteggi);
  if (tentativo.status !== "IN_PROGRESS") return undefined;
  return tentativo.maxScore <= 0 ? t("tentativoAperto") : t("tentativoInCorso", punteggi);
}

function statoCatalogo(tentativo: Pick<StatoTentativo, "status"> | undefined): StatoCatalogo {
  if (tentativo?.status === "COMPLETED") return "completed";
  if (tentativo?.status === "IN_PROGRESS") return "inProgress";
  return "notStarted";
}

export default async function StudentHomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("esercizi");
  const studentT = await getTranslations("studentExercisesUi");
  const [esercizi, compitiGrezzi] = await Promise.all([
    prisma.esercizio.findMany({
      where: { versions: { some: {} } },
      orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
      include: {
        versions: {
          orderBy: { version: "desc" }, take: 1,
          include: { tentativi: { where: { studentId: session.user.id, compitoId: null }, orderBy: { startedAt: "desc" }, take: 1 } },
        },
      },
    }),
    compitiDelloStudente(session.user.id),
  ]);

  // `ritiratoAt: null` anche qui, benché `compitiDelloStudente` escluda già
  // i compiti ritirati: questa rilettura decide cosa la pagina mostra, e non
  // deve fidarsi di chi le ha passato gli id.
  const datiCompiti = await prisma.compito.findMany({
    where: { id: { in: compitiGrezzi.map((c) => c.id) }, ritiratoAt: null },
    select: { id: true, opensAt: true, drawnVersionIds: true },
  });
  const ora = new Date();
  const compitiVisibili = new Map(datiCompiti.filter((c) => c.opensAt == null || c.opensAt <= ora).map((c) => [c.id, c]));
  const compiti = compitiGrezzi.filter((c) => compitiVisibili.has(c.id));
  const versioniAssegnate = [...new Set([...compitiVisibili.values()].flatMap((c) => c.drawnVersionIds))];
  const versioniPerCompito = new Map(
    [...compitiVisibili].map(([id, compito]) => [id, new Set(compito.drawnVersionIds)]),
  );
  const tentativiAssegnati = versioniAssegnate.length === 0 ? [] : await prisma.tentativo.findMany({
    where: {
      studentId: session.user.id,
      compitoId: { in: compiti.map((c) => c.id) },
      esercizioVersioneId: { in: versioniAssegnate },
    },
    orderBy: { startedAt: "desc" },
    include: { versione: { select: { esercizioId: true } } },
  });
  const statiAssegnati = new Map<string, StatoAssegnato>();
  for (const tentativo of tentativiAssegnati) {
    if (!tentativo.compitoId || !versioniPerCompito.get(tentativo.compitoId)?.has(tentativo.esercizioVersioneId)) continue;
    const chiave = `${tentativo.compitoId}:${tentativo.versione.esercizioId}`;
    if (tentativo.status === "COMPLETED" || !statiAssegnati.has(chiave)) {
      statiAssegnati.set(chiave, tentativo.status === "ABANDONED" ? "toComplete" : statoCatalogo(tentativo));
    }
  }

  const compitiAttivi = compiti.filter((c) => c.fatti < c.esercizi.length);
  const compitiCompletati = compiti.filter((c) => c.esercizi.length > 0 && c.fatti >= c.esercizi.length);
  const catalogo = esercizi.map((e) => {
    const tentativo = e.versions[0]?.tentativi[0];
    return { id: e.id, title: e.title, yearLevel: e.yearLevel, topic: e.topic, difficulty: e.difficulty, status: statoCatalogo(tentativo), dettaglioTentativo: tentativo ? dettaglioTentativo(t, tentativo) : undefined };
  });

  function elencoCompiti(elenco: typeof compiti) {
    return <ul className="grid gap-3">{elenco.map((c) => (
      <li key={c.id}>
        <Card className={`gap-4 overflow-hidden rounded-2xl border bg-white p-5 shadow-none sm:p-6 ${c.fatti >= c.esercizi.length ? "border-slate-200" : "border-brand-blue/25"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><p className="flex items-center gap-2 text-lg font-semibold leading-snug text-slate-900">{c.fatti >= c.esercizi.length && <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-emerald-600" />}{c.batteria}</p><p className="mt-1.5 text-sm text-slate-500">{t("compitoProgresso", { fatti: c.fatti, totali: c.esercizi.length })}</p></div>
            <p className="text-sm text-muted-foreground">{c.dueAt ? t("compitoScadenza", { quando: c.dueAt.toLocaleDateString("it-IT") }) : t("compitoSenzaScadenza")}</p>
          </div>
          {c.esercizi.length > 0 && <div role="progressbar" aria-label={t("compitoProgresso", { fatti: c.fatti, totali: c.esercizi.length })} aria-valuemin={0} aria-valuemax={c.esercizi.length} aria-valuenow={Math.min(c.fatti, c.esercizi.length)} className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${c.fatti >= c.esercizi.length ? "bg-emerald-500" : "bg-brand-blue"}`} style={{ width: `${Math.min(c.fatti / c.esercizi.length, 1) * 100}%` }} /></div>}
          {c.fatti < c.esercizi.length && <Link href={`/studente/compito/${c.id}`} prefetch={false} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand-blue px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-blue/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2">
            {studentT(c.fatti > 0 || c.esercizi.some((e) => statiAssegnati.get(`${c.id}:${e.esercizioId}`) === "inProgress") ? "continueAssignment" : "startAssignment")}
          </Link>}
          <details className="border-t border-slate-100 pt-3"><summary className="cursor-pointer text-sm font-medium text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">{studentT("assignmentExercises")}</summary><ul className="mt-3 grid gap-2">{c.esercizi.map((e) => {
            const stato = statiAssegnati.get(`${c.id}:${e.esercizioId}`) ?? "notStarted";
            const statoTesto = studentT(stato === "completed" ? "assignedCompleted" : stato === "inProgress" ? "assignedInProgress" : stato === "toComplete" ? "assignedToComplete" : "assignedNotStarted");
            return <li key={e.esercizioId} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2">
              <div className="min-w-0"><p className="line-clamp-2 font-medium text-slate-900">{e.title}</p><p className="text-sm text-slate-500">{statoTesto}</p></div>
              {stato === "completed" && <Link href={`/studente/esercizio/${e.esercizioId}`} aria-label={`${e.title}: ${studentT("practiceAgain")}`} className="shrink-0 text-sm font-semibold text-brand-blue underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">{studentT("practiceAgain")}</Link>}
            </li>;
          })}</ul></details>
        </Card>
      </li>
    ))}</ul>;
  }

  return <section className="space-y-6">
    <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue"><BookOpen className="h-5 w-5" /></div><h1 className="text-2xl font-black text-slate-900">{t("titoloStudente")}</h1></div>
    {compiti.length > 0 && <div className="space-y-3">
      <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue"><ClipboardList className="h-4 w-4" /></div><h2 className="text-lg font-bold text-slate-900">{t("compitiTitolo")}</h2></div>
      {compitiAttivi.length > 0 && <><h3 className="text-sm font-semibold text-slate-700">{studentT("assignedActiveTitle")}</h3>{elencoCompiti(compitiAttivi)}</>}
      {compitiCompletati.length > 0 && <><h3 className="text-sm font-semibold text-slate-500">{studentT("assignedCompletedTitle")}</h3>{elencoCompiti(compitiCompletati)}</>}
    </div>}
    <details className="rounded-xl border border-slate-200 bg-white/60 px-4 py-3"><summary className="cursor-pointer font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue">{studentT("signupDisclosure")}</summary><div className="pt-4"><IscrizioneClasseForm /></div></details>
    <div className="space-y-3"><h2 className="text-lg font-bold text-slate-900">{t("liberiTitolo")}</h2>{catalogo.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-slate-600">{t("nessunEsercizio")}</div> : <CatalogoEsercizi esercizi={catalogo} />}</div>
  </section>;
}
