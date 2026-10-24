import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, ClipboardPlus, CalendarClock, ArrowRight } from "lucide-react";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { TeacherExercisesNav } from "./teacher-exercises-nav";
import { AREE, etichetteNav, type Area } from "./aree";

// Quanti compiti gia' dati mostrare qui, per classe. La pagina dei compiti
// li elenca tutti; qui servono gli ultimi, quelli che il docente ha appena
// dato o sta per rinnovare. `compitiDellaClasse` li restituisce gia' dal
// piu' recente, quindi basta tagliare.
const COMPITI_RECENTI_PER_CLASSE = 3;

// Task 4 (docente-via-veloce): la pagina non è più cinque riquadri di pari
// peso. Erano una sequenza obbligata travestita da scelta — dichiarare le
// classi, scrivere o raccogliere esercizi, metterli in un contenitore,
// comporre una batteria, e solo allora assegnare — e "Compiti", la cosa che
// il docente viene davvero a fare, era in mezzo agli altri quattro senza
// dire che non si poteva ancora usare.
//
// Qui la pagina ha tre piani, in ordine di quanto servono:
//  1. il pannello per ASSEGNARE — l'unica carta piena sulla pagina, nel
//     colore dei compiti: un grande link alla pagina Nuovo compito, l'unico
//     posto dove si da' un compito;
//  2. quello che si e' GIA' assegnato — un elenco, con la scadenza in
//     evidenza quando e' passata;
//  3. COME FUNZIONA: le tappe per arrivare a un compito (classi, esercizi,
//     raccolte, assegnare), ciascuna nel colore della sua zona e col link
//     alla sua pagina. Dice l'ordine invece di lasciarlo indovinare, e
//     segnala la prima tappa quando non e' ancora fatta.
// "Batterie" non compare: resta raggiungibile dal suo indirizzo per chi lo
// conosce già, ma il docente non deve più saperla nominare per assegnare.
export default async function Page() {
  const session = await redirectUnlessTeacher();
  const [t, tCompiti, tNuovo, tUi, locale] = await Promise.all([
    getTranslations("esercizi"),
    getTranslations("esercizi.compiti"),
    getTranslations("esercizi.nuovoCompito"),
    getTranslations("teacherExercisesUi"),
    getLocale(),
  ]);

  // Le classi che il docente ha dichiarato di insegnare: servono per i
  // compiti gia' dati qui sotto.
  const insegnate = await classiDelDocente(session.user.id);

  // I compiti gia' dati, classe per classe (`compitiDellaClasse` lavora per
  // classe), col nome della classe accanto — lo stesso accorpamento della
  // pagina dei compiti, tagliato ai piu' recenti.
  const compitiPerClasse = await Promise.all(
    insegnate.map(async (c) => {
      const compiti = await compitiDellaClasse(c.id);
      return compiti.slice(0, COMPITI_RECENTI_PER_CLASSE).map((compito) => ({ ...compito, classe: c.name }));
    }),
  );
  const compiti = compitiPerClasse.flat();
  const adesso = new Date();

  // Le tappe, nell'ordine in cui si fanno. La raccolta e' facoltativa: un
  // compito si puo' comporre anche pescando per argomento.
  const tappe: { area: Area; href: string; titolo: string; testo: string; facoltativa?: boolean; stato?: string }[] = [
    {
      area: "classi",
      href: AREE.classi.href,
      titolo: t("navClassi"),
      testo: tUi("hub.stepClasses"),
      stato: insegnate.length > 0 ? tUi("hub.classesCount", { n: insegnate.length }) : undefined,
    },
    { area: "esercizi", href: AREE.esercizi.href, titolo: t("navRedazione"), testo: tUi("hub.stepExercises") },
    { area: "raccolte", href: AREE.raccolte.href, titolo: t("navContenitori"), testo: tUi("hub.stepCollections"), facoltativa: true },
    { area: "compiti", href: "/dashboard/esercizi/compiti/nuovo", titolo: tUi("hub.stepAssignTitle"), testo: tUi("hub.stepAssign") },
  ];
  const senzaClassi = insegnate.length === 0;

  return (
    // `text-foreground` esplicito: la modalita' scura di questa area e' un
    // `div.dark` dentro il layout, non una classe su <html>, quindi il colore
    // ereditato dal body resta quello chiaro; dichiararlo qui lo fa
    // risolvere dentro lo scope scuro, e tutto il resto lo eredita.
    <div className="max-w-4xl space-y-8 text-foreground">
      <TeacherExercisesNav labels={etichetteNav(tUi)} />
      <div>
        {/* Il nome della sezione e' contesto, non il titolo: lo dice gia' la
            barra laterale. Resta un h1 per chi naviga per intestazioni, ma
            in corpo piccolo, sopra la carta — la parola grande della pagina
            e' l'azione. */}
        <h1 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("titoloDocente")}</h1>
        <Link
          href="/dashboard/esercizi/compiti/nuovo"
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-orange to-[#E8701A] p-5 text-white shadow-md transition hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-6"
        >
          {/* Due cerchi chiari sullo sfondo: solo decorazione. */}
          <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/10" />
          <span aria-hidden className="pointer-events-none absolute -bottom-16 right-24 h-32 w-32 rounded-full bg-white/10" />
          <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-brand-orange shadow-sm" aria-hidden>
            <ClipboardPlus className="h-7 w-7" />
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="block text-2xl font-bold tracking-tight">{tNuovo("titolo")}</span>
            <span className="mt-1 block text-sm text-white/90">{tNuovo("descrizione")}</span>
          </span>
          <ChevronRight className="relative h-6 w-6 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
        </Link>
      </div>

      {/* Senza classi non puo' esserci nessun compito, e la pagina dei
          compiti direbbe solo "dichiara prima le classi": niente elenco e
          niente link verso il vuoto. */}
      {insegnate.length > 0 && (
        <section aria-labelledby="compiti-titolo" className="space-y-3">
          <h2 id="compiti-titolo" className="flex items-center gap-2 text-base font-semibold">
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${AREE.compiti.pieno}`} aria-hidden>
              <AREE.compiti.icona className="h-4 w-4" />
            </span>
            <Link href={AREE.compiti.href} className="inline-flex items-center gap-1 hover:underline">
              {t("navCompiti")}
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          </h2>
          {compiti.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{tCompiti("nessunCompito")}</p>
          ) : (
            <ul className="space-y-2">
              {compiti.map((c) => {
                const verifica = c.tipo === "VERIFICA";
                const scaduto = c.dueAt !== null && c.dueAt < adesso;
                return (
                  <li
                    key={c.id}
                    className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-border border-l-4 bg-card px-4 py-3 text-sm shadow-sm ${
                      verifica ? "border-l-brand-magenta" : "border-l-brand-orange"
                    }`}
                  >
                    {/* Una verifica ha la sua pagina, come nell'elenco dei compiti. */}
                    <span className="flex min-w-0 items-center gap-2">
                      {verifica && (
                        <span className="rounded-full bg-brand-magenta/10 px-2 py-0.5 text-xs font-semibold text-brand-magenta">
                          {tCompiti("etichettaVerifica")}
                        </span>
                      )}
                      <Link
                        href={verifica ? `/dashboard/esercizi/verifiche/${c.id}` : `/dashboard/esercizi/compiti/${c.id}`}
                        className="font-medium hover:underline"
                      >
                        {c.batteria} — {c.classe}
                      </Link>
                    </span>
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <span className={`inline-flex items-center gap-1 ${scaduto ? "font-medium text-destructive" : ""}`}>
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {c.dueAt ? tCompiti("compitoScadenza", { quando: c.dueAt.toLocaleDateString(locale) }) : tCompiti("nessunaScadenza")}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{tCompiti("eserciziCount", { n: c.esercizi })}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="come-funziona" className="space-y-3">
        <h2 id="come-funziona" className="text-base font-semibold">{tUi("hub.howTitle")}</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tappe.map((tappa, i) => {
            const stile = AREE[tappa.area];
            const Icona = stile.icona;
            // Senza classi la prima tappa e' quella da fare: la si dice.
            const evidenziata = senzaClassi && i === 0;
            return (
              <li
                key={tappa.area}
                className={`group relative flex flex-col gap-2 rounded-xl border-2 bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                  evidenziata ? `${stile.bordo} ${stile.tenue}` : "border-border hover:border-current"
                } ${stile.testo}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${stile.pieno}`} aria-hidden>
                    <Icona className="h-5 w-5" />
                  </span>
                  <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${stile.tenue}`} aria-hidden>
                    {i + 1}
                  </span>
                </div>
                {/* Il link copre tutta la carta (after:inset-0) ma il suo
                    nome resta il solo titolo. */}
                <Link
                  href={tappa.href}
                  className="font-semibold text-foreground after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {tappa.titolo}
                </Link>
                <p className="text-sm text-muted-foreground">{tappa.testo}</p>
                <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1 text-xs font-medium">
                  {evidenziata && <span className={`rounded-full px-2 py-0.5 text-white ${stile.pieno}`}>{tUi("hub.startHere")}</span>}
                  {tappa.stato && <span className={`rounded-full px-2 py-0.5 ${stile.tenue}`}>✓ {tappa.stato}</span>}
                  {tappa.facoltativa && <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{tUi("hub.optional")}</span>}
                </div>
                {i < tappe.length - 1 && (
                  <ArrowRight aria-hidden className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground lg:block" />
                )}
              </li>
            );
          })}
        </ol>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <AREE.modelli.icona className={`h-4 w-4 ${AREE.modelli.testo}`} aria-hidden />
          {tUi("hub.modelsHint")}
          <Link href={AREE.modelli.href} className={`font-medium underline-offset-2 hover:underline ${AREE.modelli.testo}`}>
            {tUi("hub.modelsLink")}
          </Link>
        </p>
      </section>
    </div>
  );
}
