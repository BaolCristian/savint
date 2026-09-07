import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDisponibili, classiDelDocente } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { ClassiForm } from "./classi-form";

/** Il docente dichiara quali classi insegna, scegliendo fra TUTTE quelle
 * esistenti (`classiDisponibili`, senza rotta HTTP: qui si legge il dominio
 * direttamente, come da nota della spec). Solo le classi selezionate
 * potranno poi ricevere un compito da lui (`assegna` rifiuta altrimenti). */
export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.classi");

  const [disponibili, insegnate] = await Promise.all([
    classiDisponibili(),
    classiDelDocente(session.user.id),
  ]);
  const insegnateIds = insegnate.map((c) => c.id);

  // Per ciascuna classe già insegnata che ha già dei compiti, il testo di
  // conferma già tradotto per QUELLA classe: serve al form per avvisare
  // PRIMA di togliere la spunta a una classe che ne ha (Fix round finale,
  // item 2) — `dichiaraInsegnamento` è una sostituzione integrale
  // dell'elenco (dominio, classi.ts), e con due schede aperte salvare
  // quella vecchia fa sparire silenziosamente una classe dall'insegnamento
  // pur restando l'assegnazione (e gli studenti che ci lavorano) del tutto
  // intatta. Tradotto già qui, non nel client component: un client
  // component non può ricevere funzioni come prop (`useTranslations` è
  // l'unica via, e qui il nome della classe e l'elenco dei compiti sono già
  // noti server-side, senza bisogno del pattern usato da `compito-form.tsx`
  // per il dettaglio di `esercizi_insufficienti`, noto solo a runtime).
  // Nessun giro di rete in più: `compitiDellaClasse` è la stessa funzione
  // già usata dalla pagina dei compiti.
  const nomeClasse = new Map(disponibili.map((c) => [c.id, c.name]));
  const confermeRimozione: Record<string, { titolo: string; descrizione: string }> = {};
  for (const id of insegnateIds) {
    const nomiCompiti = (await compitiDellaClasse(id)).map((c) => c.batteria);
    if (nomiCompiti.length === 0) continue;
    confermeRimozione[id] = {
      titolo: t("confermaRimozioneTitolo", { classe: nomeClasse.get(id) ?? "" }),
      descrizione: t("confermaRimozioneDescrizione", { elenco: nomiCompiti.join(", ") }),
    };
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
      <p className="text-sm text-muted-foreground">{t("descrizione")}</p>
      <p className="text-sm text-muted-foreground">{t("significato")}</p>
      {disponibili.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunaClasse")}</p>
      ) : (
        <ClassiForm
          classi={disponibili}
          selezionateIniziali={insegnateIds}
          confermeRimozione={confermeRimozione}
          testi={{
            salva: t("salva"),
            salvato: t("salvato"),
            errore: t("erroreSalvataggio"),
            confermaRimozioneAzione: t("confermaRimozioneAzione"),
            annulla: t("annulla"),
          }}
        />
      )}
    </div>
  );
}
