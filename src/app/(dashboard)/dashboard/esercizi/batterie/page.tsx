import { redirect } from "next/navigation";

// Nuovo compito, Task 5: la vecchia pagina "Prepara un compito" è diventata
// la pagina Modelli. Il vecchio indirizzo (link salvati, segnalibri) porta lì.
export default function Page() {
  redirect("/dashboard/esercizi/modelli");
}
