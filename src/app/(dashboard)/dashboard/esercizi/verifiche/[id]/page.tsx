import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { misureDellaVerifica, monitoraggioVerifica } from "@/lib/esercizi/verifiche";
import { TeacherExercisesNav } from "../../teacher-exercises-nav";
import { VerificaDocenteClient, type MonitoraggioJson } from "./verifica-docente-client";

// La pagina di una verifica per il docente: preparazione, monitoraggio e
// (più avanti) risultati. `monitoraggioVerifica` è anche il controllo di
// titolo: null per un docente senza titolo, una verifica che non c'è o
// ritirata, e in tutti i casi lo stesso 404 (un 403 confermerebbe che la
// verifica esiste).
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const session = await redirectUnlessTeacher();
  const { id } = await params;

  const monitoraggio = await monitoraggioVerifica(id, session.user.id);
  if (!monitoraggio) notFound();

  // Le misure si cambiano solo prima dell'avvio: dopo non servono qui.
  const misure = monitoraggio.verifica.stato === "PREPARATA" ? await misureDellaVerifica(id, session.user.id) : null;

  const tUi = await getTranslations("teacherExercisesUi");
  // Il client riceve il monitoraggio nella stessa forma della GET (date come
  // stringhe ISO): un solo tipo per lo stato iniziale e per gli aggiornamenti.
  const iniziale = JSON.parse(JSON.stringify(monitoraggio)) as MonitoraggioJson;

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={{ label: tUi("nav.label"), overview: tUi("nav.overview"), catalog: tUi("nav.catalog"), collections: tUi("nav.collections"), assignments: tUi("nav.assignments"), classes: tUi("nav.classes"), models: tUi("nav.models") }} />
      <VerificaDocenteClient compitoId={id} iniziale={iniziale} misureIniziali={misure} />
    </div>
  );
}
