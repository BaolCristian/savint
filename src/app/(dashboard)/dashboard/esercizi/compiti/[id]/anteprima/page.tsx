import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { haTitoloSulCompito } from "@/lib/esercizi/compiti";
import { versioniDelloStudente } from "@/lib/esercizi/versioni-compito";
import { versioniConContenuto } from "@/lib/esercizi/estrazione";
import { prisma } from "@/lib/db/client";
import { AnteprimaCompito } from "@/components/esercizi/compito/anteprima-compito";
import { Button } from "@/components/ui/button";
import { TeacherExercisesNav } from "../../../teacher-exercises-nav";

/** L'anteprima di un compito GIÀ assegnato, "come la vedono i ragazzi"
 * (spec, "Anteprima del compito"): gli esercizi del compito uno dopo
 * l'altro nel player dello studente, senza salvare nulla.
 *
 * Chi può: chi può leggere le consegne del compito (`haTitoloSulCompito`,
 * la stessa regola della pagina del compito); per chiunque altro, e per un
 * compito ritirato o inesistente, 404 — mai un 403 che confermi che il
 * compito esiste.
 *
 * Modo "stesse domande": le versioni del compito (`drawnVersionIds`), nel
 * loro ordine. Modo "diverse per studente": quelle di UNO studente,
 * scelto dal menu "Anteprima di" (`?studente=`, solo fra gli iscritti di
 * adesso; di default il primo). `versioniDelloStudente` memorizza
 * l'estrazione se lo studente non l'aveva ancora — è voluto (spec: "il
 * docente che apre l'anteprima di quello studente"), ed è la stessa che lo
 * studente troverà. Senza iscritti non c'è nessuno di cui mostrare
 * l'estrazione, e lo si dice. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ studente?: string | string[] }>;
}) {
  const session = await redirectUnlessTeacher();
  const { id } = await params;
  const richiesto = (await searchParams)?.studente;
  const studenteRichiesto = Array.isArray(richiesto) ? richiesto[0] : richiesto;

  const compito = await prisma.compito.findUnique({
    where: { id },
    select: {
      id: true,
      classeId: true,
      assignedById: true,
      ritiratoAt: true,
      modo: true,
      drawnVersionIds: true,
      batteria: { select: { name: true } },
      classe: { select: { name: true } },
    },
  });
  if (!compito || compito.ritiratoAt != null) notFound();
  if (!(await haTitoloSulCompito(compito, session.user.id))) notFound();

  const t = await getTranslations("esercizi.nuovoCompito.dettaglio");
  const tNc = await getTranslations("esercizi.nuovoCompito");
  const tUi = await getTranslations("teacherExercisesUi");

  let iscritti: { id: string; nome: string }[] = [];
  let studenteId: string | null = null;
  let versionIds: string[] = compito.drawnVersionIds;
  if (compito.modo === "STUDENTE") {
    iscritti = (
      await prisma.classeStudente.findMany({
        where: { classeId: compito.classeId },
        select: { studentId: true, studente: { select: { name: true, email: true } } },
        orderBy: { studente: { name: "asc" } },
      })
    ).map((i) => ({ id: i.studentId, nome: i.studente.name ?? i.studente.email }));
    studenteId = iscritti.find((i) => i.id === studenteRichiesto)?.id ?? iscritti[0]?.id ?? null;
    versionIds = studenteId ? ((await versioniDelloStudente(compito.id, studenteId)) ?? []) : [];
  }

  // Nell'ordine del compito; una versione sparita non si mostra (come
  // `compitiDelloStudente`, che non la elenca allo studente).
  const righe = await versioniConContenuto(versionIds);
  const esercizi = versionIds.flatMap((v) => {
    const r = righe.get(v);
    return r ? [{ esercizioId: r.esercizioId, titolo: r.titolo, content: r.content }] : [];
  });

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes") }} />
      <div className="space-y-1">
        <Link href={`/dashboard/esercizi/compiti/${compito.id}`} className="text-sm text-brand-blue hover:underline">
          {t("tornaCompito")}
        </Link>
        <h1 className="text-2xl font-semibold">
          {t("anteprimaTitolo", { titolo: compito.batteria.name, classe: compito.classe.name })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("modo", { modo: compito.modo === "STUDENTE" ? tNc("modoStudente") : tNc("modoClasse") })}
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">{t("anteprimaSpiegazione")}</p>
      </div>

      {compito.modo === "STUDENTE" &&
        (iscritti.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("nessunIscritto")}</p>
        ) : (
          // Un modulo GET: cambiare studente è cambiare indirizzo, e
          // funziona anche prima che il JavaScript della pagina sia pronto.
          <form method="get" className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="anteprima-studente" className="text-sm font-medium">{t("anteprimaDi")}</label>
              <select
                id="anteprima-studente"
                name="studente"
                defaultValue={studenteId ?? undefined}
                className="h-10 min-w-48 rounded-lg border border-input bg-background px-3 text-sm"
              >
                {iscritti.map((i) => (
                  <option key={i.id} value={i.id}>{i.nome}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="outline" className="h-10 px-4">{t("mostra")}</Button>
          </form>
        ))}

      {(compito.modo !== "STUDENTE" || studenteId) && (
        <div className="max-w-4xl rounded-xl border-2 border-brand-green p-4">
          <AnteprimaCompito key={studenteId ?? "classe"} esercizi={esercizi} locale={locale} />
        </div>
      )}
    </div>
  );
}
