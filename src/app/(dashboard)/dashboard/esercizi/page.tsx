import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users, FolderOpen, ClipboardCheck, Pencil } from "lucide-react";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { Card } from "@/components/ui/card";

// Task 4 (docente-via-veloce): la pagina non è più cinque riquadri di pari
// peso. Erano una sequenza obbligata travestita da scelta — dichiarare le
// classi, scrivere o raccogliere esercizi, metterli in un contenitore,
// comporre una batteria, e solo allora assegnare — e "Compiti", la cosa che
// il docente viene davvero a fare, era in mezzo agli altri quattro senza
// dire che non si poteva ancora usare.
//
// Qui: l'azione di assegnare per prima, sola e più grande. Il modulo vero
// arriva nel prossimo task (T5, stesso file) — questa sezione gli riserva
// già il posto, come intestazione con una descrizione di cosa farà, non
// come link verso il vuoto: non deve sembrare rotta.
//
// Sotto, più piccole, le quattro sezioni che restano — nell'ordine del
// design doc: i miei esercizi, le mie classi, le raccolte, i compiti
// assegnati. "Batterie" non compare più: resta raggiungibile dal suo
// indirizzo per chi lo conosce già (i link già in giro non si rompono), ma
// il docente non deve più saperla nominare per assegnare qualcosa.
export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi");

  const sezioni = [
    { href: "/dashboard/esercizi/redazione", label: t("navRedazione"), icon: Pencil },
    { href: "/dashboard/esercizi/classi", label: t("navClassi"), icon: Users },
    { href: "/dashboard/esercizi/contenitori", label: t("navContenitori"), icon: FolderOpen },
    { href: "/dashboard/esercizi/compiti", label: t("navCompiti"), icon: ClipboardCheck },
  ];

  return (
    <div className="space-y-8 p-6">
      <h1 className="text-2xl font-semibold">{t("titoloDocente")}</h1>

      <section
        aria-labelledby="assegna-titolo"
        className="rounded-2xl border-2 border-brand-blue/20 bg-brand-blue-50/50 p-6 dark:border-brand-blue/30 dark:bg-brand-blue/10"
      >
        <h2 id="assegna-titolo" className="text-xl font-semibold text-brand-blue dark:text-blue-300">
          {t("assegnaTitolo")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("assegnaDescrizione")}</p>
      </section>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sezioni.map((s) => (
          <li key={s.href}>
            <Link href={s.href}>
              <Card size="sm" className="items-center gap-2 p-3 text-center transition hover:bg-muted/50">
                <s.icon className="mx-auto h-4 w-4 text-brand-blue" />
                <p className="text-sm font-medium">{s.label}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
