import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { classiDisponibili, classiDelDocente, iscrittiDellaClasse } from "@/lib/esercizi/classi";
import { compitiDellaClasse } from "@/lib/esercizi/compiti";
import { utenteDaSessione } from "@/lib/esercizi/accesso";
import { MISURE_VUOTE, haMisure, misureDellaClasse } from "@/lib/esercizi/misure-pdp";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClassiForm } from "./classi-form";
import { CreaClasseForm } from "./crea-classe-form";
import { ClasseCodice } from "./classe-codice";
import { MisurePdpDialog } from "./misure-pdp-dialog";
import { TeacherExercisesNav } from "../teacher-exercises-nav";
import { etichetteNav } from "../aree";
import { IntestazioneArea } from "../intestazione-area";

/** Il docente dichiara quali classi insegna, scegliendo fra TUTTE quelle
 * esistenti (`classiDisponibili`, senza rotta HTTP: qui si legge il dominio
 * direttamente, come da nota della spec). Solo le classi selezionate
 * potranno poi ricevere un compito da lui (`assegna` rifiuta altrimenti). */
export default async function Page() {
  const session = await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.classi");
  const tUi = await getTranslations("teacherExercisesUi");
  const tE = await getTranslations("esercizi");
  const tPdp = await getTranslations("esercizi.misurePdp");

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
  // noti server-side, senza bisogno del pattern usato da `gestione-compito.tsx`
  // per il motivo di un rifiuto, noto solo a runtime).
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

  // Il codice arriva da `classiDelDocente` insieme al resto: fa parte di
  // "una classe come la vede il suo docente", e tenerlo li' evita che la
  // forma della tabella Classe sia conosciuta anche qui. E' nullo per le
  // classi nate da un gruppo Google, che un codice non l'hanno mai avuto.
  //
  // `iscrittiDellaClasse` e' una lettura (nessuna rotta HTTP la espone,
  // stessa scelta di `classiDisponibili`/`classiDelDocente`) che riverifica
  // da se' che il docente insegni la classe: qui e' sempre vero, essendo
  // `insegnate` la stessa fonte, ma e' il contratto della funzione.
  //
  // Le misure PDP (modalità verifica) restano qui, sulla card della classe:
  // le vede solo il docente, accanto all'iscritto, e non arrivano mai a una
  // pagina dello studente.
  const utente = utenteDaSessione(session);
  const dettagli = await Promise.all(
    insegnate.map(async (c) => {
      const [esito, misure] = await Promise.all([
        iscrittiDellaClasse(c.id, session.user.id),
        misureDellaClasse(c.id, utente),
      ]);
      const righe = esito.ok ? esito.righe : [];
      return {
        id: c.id,
        nome: c.name,
        codice: c.codice,
        iscritti: righe.map((r) => ({
          studentId: r.studentId,
          nome: r.nome ?? t("iscrittoSenzaNome"),
          origine: r.origine === "GRUPPO" ? t("origineGruppo") : t("origineCodice"),
          misure: misure?.get(r.studentId) ?? MISURE_VUOTE,
        })),
      };
    }),
  );

  return (
    <div className="space-y-6">
      <TeacherExercisesNav labels={etichetteNav(tUi)} />
      <IntestazioneArea
        area="classi"
        titolo={t("titolo")}
        descrizione={
          <>
            <p>{t("descrizione")}</p>
            <p>{t("significato")}</p>
          </>
        }
      />

      <section className="space-y-3" aria-labelledby="crea-classe">
        <h2 id="crea-classe" className="text-lg font-semibold">{tUi("classes.createSection")}</h2>
        <CreaClasseForm />
      </section>

      {dettagli.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">{tUi("classes.managementSection")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {dettagli.map((c) => (
              <Card key={c.id} className="gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{c.nome}</p>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Nuovo compito, Task 7: un compito a questa classe,
                        con la classe già scelta. */}
                    <Link href={`/dashboard/esercizi/compiti/nuovo?classe=${encodeURIComponent(c.id)}`} className="text-sm font-medium text-brand-blue hover:underline">
                      {t("nuovoCompito")}
                    </Link>
                    <Link href={`/dashboard/esercizi/classi/${c.id}/andamento`} className="text-sm text-brand-blue hover:underline">
                      {tE("statistiche.linkAndamento")}
                    </Link>
                  </div>
                </div>
                {c.codice && <ClasseCodice classeId={c.id} classeNome={c.nome} codiceIniziale={c.codice} />}
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t("iscrittiTitolo")}</p>
                  {c.iscritti.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("iscrittiVuoto")}</p>
                  ) : (
                    <ul className="space-y-1">
                      {c.iscritti.map((i) => (
                        <li key={i.studentId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            <span>{i.nome}</span>
                            {haMisure(i.misure) && (
                              <Badge variant="secondary" title={tPdp("segnoTitolo")}>{tPdp("segno")}</Badge>
                            )}
                          </span>
                          <span className="flex items-center gap-3">
                            <MisurePdpDialog
                              studentId={i.studentId}
                              nome={i.nome}
                              iniziali={i.misure}
                              endpoint={`/api/esercizi/classi/${c.id}/misure-pdp`}
                            />
                            <Badge variant="outline">{i.origine}</Badge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {disponibili.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunaClasse")}</p>
      ) : (
        <section className="space-y-3" aria-labelledby="classi-insegnate">
          <h2 id="classi-insegnate" className="text-lg font-semibold">{tUi("classes.teachingSection")}</h2>
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
        </section>
      )}
    </div>
  );
}
