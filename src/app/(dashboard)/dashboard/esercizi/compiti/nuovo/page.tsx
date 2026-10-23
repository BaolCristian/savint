import { randomUUID } from "node:crypto";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { comeDocente, utenteDaSessione } from "@/lib/esercizi/accesso";
import { argomentiDisponibili, caricaModello } from "@/lib/esercizi/batterie";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { eserciziAssegnabili, type Blocco } from "@/lib/esercizi/estrazione";
import { TeacherExercisesNav } from "../../teacher-exercises-nav";
import { NuovoCompitoClient } from "./nuovo-compito-client";

type Parametri = { classe?: string; raccolta?: string; argomento?: string; modello?: string; esercizio?: string };

/** Un parametro della query come stringa sola: `?raccolta=a&raccolta=b`
 * arriva come array, e qui vale il primo. */
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Quanti prenderne da un blocco precompilato: cinque, o tutti se sono
 * meno (lo stesso default dei blocchi aggiunti a mano nella pagina). */
const quantiDa = (disponibili: number | undefined) => Math.max(1, Math.min(5, disponibili ?? 5));

/** La pagina "Nuovo compito" (spec 2026-10-22): l'unica strada per dare un
 * compito. I dati per le tre zone si leggono qui, tutti COME DOCENTE
 * (`comeDocente`: un ADMIN che insegna compone e pesca fra ciò che
 * vedrebbe da docente, come `baciniDeiBlocchi`) — le classi che insegna,
 * gli argomenti con quanti esercizi per ogni anno delle sue classi, le
 * raccolte che vede, il catalogo per "+ scegli esercizi".
 *
 * Si arriva qui da ovunque con un parametro che precompila (Task 7):
 * `?classe=` sceglie la classe; `?modello=` porta i blocchi del modello
 * (un blocco argomento senza anno prende quello della classe: lo fa la
 * rotta, `blocchiConAnno`) e il compito ricorderà da quale modello viene;
 * `?raccolta=`, `?argomento=`, `?esercizio=` aggiungono un blocco
 * ciascuno. Un parametro che non corrisponde a niente di visibile si
 * ignora: nessun blocco su una raccolta privata altrui, e nessun indizio
 * che esista. */
export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.nuovoCompito");
  const tUi = await getTranslations("teacherExercisesUi");
  const tCompiti = await getTranslations("esercizi.compiti");
  const grezzi = (await searchParams) ?? {};
  const p: Parametri = {
    classe: uno(grezzi.classe),
    raccolta: uno(grezzi.raccolta),
    argomento: uno(grezzi.argomento),
    modello: uno(grezzi.modello),
    esercizio: uno(grezzi.esercizio),
  };

  const chi = comeDocente(utenteDaSessione(session));
  const [classi, raccolte, catalogo, modello] = await Promise.all([
    classiDelDocente(session.user.id),
    elencoContenitori(chi),
    eserciziAssegnabili(chi),
    p.modello ? caricaModello(p.modello) : Promise.resolve(null),
  ]);

  // Gli argomenti per ogni anno che può servire: quelli delle classi e
  // quelli scritti nei blocchi del modello (un modello composto per un
  // altro anno lo tiene).
  const anni = new Set<number>(classi.flatMap((c) => (c.yearLevel != null ? [c.yearLevel] : [])));
  for (const b of modello?.blocchi ?? []) if (b.tipo === "argomento" && b.anno != null) anni.add(b.anno);
  const argomentiPerAnno = Object.fromEntries(
    await Promise.all([...anni].sort((a, b) => a - b).map(async (anno) => [String(anno), await argomentiDisponibili(chi, anno)] as const)),
  );

  // Con una sola classe non c'è niente da scegliere.
  const classeId = classi.find((c) => c.id === p.classe)?.id ?? (classi.length === 1 ? classi[0]!.id : "");
  const annoClasse = classi.find((c) => c.id === classeId)?.yearLevel ?? null;

  const blocchi: Blocco[] = [...(modello?.blocchi ?? [])];
  const raccolta = p.raccolta ? raccolte.find((r) => r.id === p.raccolta) : undefined;
  if (raccolta) blocchi.push({ tipo: "raccolta", contenitoreId: raccolta.id, quanti: quantiDa(raccolta.esercizi) });
  if (p.argomento) {
    const n = annoClasse != null ? argomentiPerAnno[String(annoClasse)]?.find((a) => a.argomento === p.argomento)?.quanti : undefined;
    blocchi.push({ tipo: "argomento", argomento: p.argomento, quanti: quantiDa(n) });
  }
  if (p.esercizio && catalogo.some((e) => e.id === p.esercizio)) blocchi.push({ tipo: "scelti", esercizioIds: [p.esercizio] });

  const locale = (await getLocale()) === "en" ? "en" : "it";

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes"), models: tUi("nav.models") }} />
      <div className="space-y-1">
        <Link href="/dashboard/esercizi/compiti" className="text-sm text-brand-blue hover:underline">
          {tCompiti("torna")}
        </Link>
        <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
        <p className="text-sm text-muted-foreground">{t("descrizione")}</p>
      </div>
      <div className="max-w-4xl">
        <NuovoCompitoClient
          classi={classi.map((c) => ({ id: c.id, nome: c.name, anno: c.yearLevel }))}
          argomentiPerAnno={argomentiPerAnno}
          raccolte={raccolte.map((r) => ({ id: r.id, nome: r.name, esercizi: r.esercizi }))}
          catalogo={catalogo}
          iniziale={{ classeId, blocchi, modello: modello ? { id: modello.id, nome: modello.nome } : null }}
          semeIniziale={randomUUID().slice(0, 12)}
          locale={locale}
        />
      </div>
    </div>
  );
}
