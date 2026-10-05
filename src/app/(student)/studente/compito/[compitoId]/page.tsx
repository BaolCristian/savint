import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Check, CheckCircle2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { percorsoCompitoStudente } from "@/lib/esercizi/percorso-compito";

export default async function Page({ params }: { params: Promise<{ compitoId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  const { compitoId } = await params;
  const percorso = await percorsoCompitoStudente(compitoId, session.user.id);
  if (!percorso) notFound();
  if (percorso.prossimo) {
    redirect(`/studente/esercizio/${percorso.prossimo.esercizioId}?compitoId=${compitoId}&percorso=1`);
  }

  const t = await getTranslations("studentExercisesUi");
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="space-y-3 border-b border-emerald-100 bg-emerald-50/60 p-6 sm:p-8">
      <CheckCircle2 aria-hidden="true" className="mb-4 size-11 text-emerald-600" />
      <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t("assignmentCompleted")}</h1>
      <p className="text-lg text-slate-700">{percorso.titolo}</p>
      <p className="text-sm text-muted-foreground">
        {t("assignmentSummary", { completed: percorso.totale, total: percorso.totale })}
      </p>
      </div>
      <div className="space-y-6 p-6 sm:p-8">
      <ul className="divide-y divide-slate-100 text-sm text-slate-700">
        {percorso.esercizi.map((esercizio) => <li key={esercizio.esercizioId} className="flex items-center gap-3 py-3"><Check aria-hidden="true" className="size-5 shrink-0 text-emerald-600" /><span>{esercizio.titolo}</span></li>)}
      </ul>
      <Link href="/studente" className={`${buttonVariants()} min-h-11 w-full rounded-xl sm:w-auto`}>
        {t("backToExercises")}
      </Link>
      </div>
    </section>
  );
}
