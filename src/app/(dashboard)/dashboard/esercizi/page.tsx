import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Users, FolderOpen, Pencil, ChevronRight } from "lucide-react";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDelDocente } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { elencoRedazione } from "@/lib/esercizi/redazione";
import { AssegnaForm } from "./assegna-form";

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
//  1. il pannello per ASSEGNARE — l'unica carta sulla pagina, e l'unica
//     cosa con dentro un pulsante blu;
//  2. quello che si e' GIA' assegnato — un elenco, non un riquadro: dopo
//     aver premuto "Assegna" e' la prima cosa che il docente vuole vedere,
//     e prima stava dietro un clic su una pagina per due terzi vuota;
//  3. dove si PREPARA il materiale (i miei esercizi, le mie classi, le
//     raccolte) — tre link in fondo, non tre riquadri pari al resto.
// "Batterie" non compare: resta raggiungibile dal suo indirizzo per chi lo
// conosce già, ma il docente non deve più saperla nominare per assegnare.
export default async function Page() {
  const session = await redirectUnlessTeacher();
  const [t, tCompiti, locale] = await Promise.all([
    getTranslations("esercizi"),
    getTranslations("esercizi.compiti"),
    getLocale(),
  ]);

  // Le classi che il docente ha dichiarato di insegnare, e gli esercizi che
  // hanno almeno una versione salvata: senza versione l'anteprima direbbe
  // "nessuna versione salvata" invece di mostrare qualcosa, quindi il filtro
  // sta qui e non nel modulo (che riceve gia' solo candidati validi).
  const [insegnate, esercizi] = await Promise.all([
    classiDelDocente(session.user.id),
    elencoRedazione(),
  ]);
  const candidati = esercizi
    .filter((e) => e.ultimaVersione > 0)
    .map((e) => ({ id: e.id, argomento: e.argomento, anno: e.anno }));

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

  const strumenti = [
    { href: "/dashboard/esercizi/redazione", label: t("navRedazione"), icon: Pencil },
    { href: "/dashboard/esercizi/classi", label: t("navClassi"), icon: Users },
    { href: "/dashboard/esercizi/contenitori", label: t("navContenitori"), icon: FolderOpen },
  ];

  return (
    // `text-foreground` esplicito: la modalita' scura di questa area e' un
    // `div.dark` dentro il layout, non una classe su <html>, quindi il colore
    // ereditato dal body resta quello chiaro; dichiararlo qui lo fa
    // risolvere dentro lo scope scuro, e tutto il resto lo eredita.
    <div className="max-w-4xl space-y-8 text-foreground">
      <div>
        {/* Il nome della sezione e' contesto, non il titolo: lo dice gia' la
            barra laterale. Resta un h1 per chi naviga per intestazioni, ma
            in corpo piccolo, sopra la carta — la parola grande della pagina
            e' l'azione. */}
        <h1 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("titoloDocente")}</h1>
        <section
          aria-labelledby="assegna-titolo"
          className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6"
        >
          <h2 id="assegna-titolo" className="text-2xl font-semibold tracking-tight">
            {t("assegnaTitolo")}
          </h2>
          <div className="mt-5">
            <AssegnaForm
              classi={insegnate.map((c) => ({ id: c.id, name: c.name, yearLevel: c.yearLevel }))}
              candidati={candidati}
            />
          </div>
        </section>
      </div>

      {/* Senza classi non puo' esserci nessun compito, e la pagina dei
          compiti direbbe solo "dichiara prima le classi": niente elenco e
          niente link verso il vuoto. */}
      {insegnate.length > 0 && (
        <section aria-labelledby="compiti-titolo" className="space-y-2">
          <h2 id="compiti-titolo" className="text-base font-semibold">
            <Link href="/dashboard/esercizi/compiti" className="inline-flex items-center gap-1 hover:text-brand-blue">
              {t("navCompiti")}
              <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
            </Link>
          </h2>
          {compiti.length === 0 ? (
            <p className="text-sm text-muted-foreground">{tCompiti("nessunCompito")}</p>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {compiti.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5 text-sm">
                  <Link href={`/dashboard/esercizi/compiti/${c.id}`} className="font-medium hover:text-brand-blue hover:underline">
                    {c.batteria} — {c.classe}
                  </Link>
                  <span className="text-muted-foreground">
                    {c.dueAt ? tCompiti("compitoScadenza", { quando: c.dueAt.toLocaleDateString(locale) }) : tCompiti("nessunaScadenza")}
                    {" · "}
                    {tCompiti("eserciziCount", { n: c.esercizi })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ul className="flex flex-wrap gap-2">
        {strumenti.map((s) => (
          <li key={s.href}>
            <Link
              href={s.href}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium transition hover:bg-muted"
            >
              <s.icon className="h-4 w-4 text-muted-foreground" aria-hidden />
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
