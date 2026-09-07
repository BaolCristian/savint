/**
 * E2E — Ciclo intero dei compiti: assegna, svolgi, verifica (Task 8)
 *
 * Copre il motivo per cui esistono classi, contenitori, batterie e compiti
 * tutti insieme: un docente dichiara di insegnare una classe, costruisce un
 * contenitore con due esercizi, li compone in una batteria che li pesca
 * ENTRAMBI, e la assegna alla classe. Uno studente di quella classe entra,
 * vede il compito e ne svolge solo uno dei due. Il docente ricarica la
 * pagina delle consegne e deve vedere uno su due — non due su due, non
 * zero su due. Questa è l'unica asserzione che conta davvero: una prova che
 * si fermasse a verificare che le pagine si caricano non proverebbe niente
 * (lo stesso principio di `esercizi-player.spec.ts`, il modello più vicino
 * a questa prova).
 *
 * Perché una batteria che pesca ENTRAMBI gli esercizi del contenitore
 * (`quantità = 2` su un contenitore di due) e non uno a caso: il sorteggio
 * in `assegna` (dominio, compiti.ts) è seminato con un `randomUUID()` nuovo
 * a ogni assegnazione, quindi non deterministico. Con un contenitore di
 * taglia ESATTAMENTE pari a quanto la regola richiede non c'è scelta da
 * fare: `drawnVersionIds` contiene sempre entrambe le versioni, e la prova
 * non deve indovinare quale dei due l'assegnazione ha scelto per sapere
 * quale link cliccare come studente.
 *
 * Database condiviso con l'ambiente di sviluppo del committente
 * ---------------------------------------------------------------
 * Non esiste nessuna rotta HTTP per creare una `Classe`: nel prodotto
 * nascono solo dai gruppi Google via il cancello studenti
 * (`allineaClassi`, chiamato da `signInWithGate`) — e quel cancello si
 * salta per qualunque provider diverso da "google" (vedi
 * `gate-callbacks.ts`), Dev Login compreso. Per portare in scena una classe
 * senza Google, quindi, la si scrive direttamente col client Prisma prima
 * del test — lo stesso genere di scaffolding già usato dai test di dominio
 * (`src/lib/esercizi/__tests__/compiti.test.ts`), solo qui contro il
 * database vero invece che uno isolato.
 *
 * Isolamento e ripetibilità — perché nomi unici per run, non pulizia prima
 * -------------------------------------------------------------------------
 * Il database di sviluppo, verificato prima di scrivere questa prova, porta
 * già i resti di sessioni di test precedenti (classi "3B", "Elimina",
 * batterie "battest-*", "compititest-*", persino un percorso manuale del
 * committente — batteria "Walkthrough Verifica" sulla classe "2SIA4.0",
 * insegnata dallo stesso `docente@scuola.it` che questa prova riusa). Ripulire
 * quello scenario PRIMA di partire richiederebbe conoscere in anticipo tutto
 * ciò che potrebbe già esserci, ed è esattamente la trappola che ha reso
 * instabile la suite una volta (un `deleteMany()` su tabella intera). Molto
 * più semplice: ogni nome che questa prova crea porta un ID di run
 * (`RUN_ID`, timestamp + numero casuale) che non si ripete mai fra due
 * esecuzioni — due run consecutive, anche partendo da un database sporco di
 * run precedenti mai puliti, non possono mai collidere su un vincolo
 * UNIQUE (`Classe.googleGroupEmail`) né confondere le proprie righe con
 * quelle di un'altra esecuzione. La pulizia in `afterAll` resta comunque
 * per buona educazione verso il database condiviso, mai per correttezza:
 * se fallisse a metà, la PROSSIMA esecuzione userebbe comunque un `RUN_ID`
 * diverso e non se ne accorgerebbe.
 *
 * Ogni cancellazione in `afterAll` è per riga (id o relazione precisa),
 * mai un `deleteMany()` su una tabella intera: si tocca solo la classe,
 * il contenitore, la batteria e il compito che porta l'ID di questa run, e
 * i tentativi legati a QUEL compito — non un singolo `WHERE` più largo del
 * necessario.
 *
 * `docente@scuola.it` insegna già "2SIA4.0" nell'ambiente del committente:
 * il passo "dichiara di insegnare" qui sotto passa dal form vero (le
 * caselle già segnate restano segnate, non le sovrascrive un DELETE
 * dell'intera riga `classeDocente` del docente), quindi non gli toglie
 * classi che aveva già dichiarato.
 *
 * Pre-requisiti
 * -------------
 *  - Il server di sviluppo del worktree deve già essere in esecuzione
 *    (vedi `playwright.config.ts`, porta 3100), con `docente@scuola.it` e
 *    `studente@scuola.it` seminati da `prisma/seed.ts`.
 *  - Gli esercizi reali `01-equazione-primo-grado` e
 *    `02-scomposizione-polinomi` (da `content/esercizi/`) devono avere
 *    almeno una `EsercizioVersione` in database — seminati con
 *    `npm run seed:esercizi`. Il test non li crea né li cancella: sono
 *    bacino condiviso, non scaffolding di questa prova.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.use({ locale: "it-IT" });

const TEACHER_EMAIL = "docente@scuola.it";
const STUDENT_EMAIL = "studente@scuola.it";
const STUDENT_NAME = "Studente Demo";

// Due esercizi reali del bacino (mai creati né cancellati da questa prova):
// bastano un contenitore che li porti entrambi e una batteria che ne peschi
// esattamente due per avere un compito con un esito deterministico.
const ESERCIZIO_UNO = { id: "01-equazione-primo-grado", title: "Equazione di primo grado" };
const ESERCIZIO_DUE = {
  id: "02-scomposizione-polinomi",
  title: "Scomposizione di una differenza di quadrati",
};

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CLASSE_EMAIL = `e2e-compiti-${RUN_ID}@scuola.it`;
const CLASSE_NOME = `E2E Compiti Classe ${RUN_ID}`;
const CONTENITORE_NOME = `E2E Compiti Contenitore ${RUN_ID}`;
const BATTERIA_NOME = `E2E Compiti Batteria ${RUN_ID}`;

let prisma: PrismaClient;
let classeId: string;
let studentId: string;

test.beforeAll(async () => {
  prisma = new PrismaClient();

  const teacher = await prisma.user.findUnique({ where: { email: TEACHER_EMAIL } });
  if (!teacher) {
    throw new Error(`Seed mancante: utente ${TEACHER_EMAIL} non trovato. Esegui \`npx prisma db seed\`.`);
  }
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  if (!student) {
    throw new Error(`Seed mancante: utente ${STUDENT_EMAIL} non trovato. Esegui \`npx prisma db seed\`.`);
  }
  studentId = student.id;

  const versioni = await prisma.esercizioVersione.findMany({
    where: { esercizioId: { in: [ESERCIZIO_UNO.id, ESERCIZIO_DUE.id] } },
    select: { esercizioId: true },
  });
  const presenti = new Set(versioni.map((v) => v.esercizioId));
  if (!presenti.has(ESERCIZIO_UNO.id) || !presenti.has(ESERCIZIO_DUE.id)) {
    throw new Error(
      `Esercizi mancanti in database (servono ${ESERCIZIO_UNO.id} e ${ESERCIZIO_DUE.id}): esegui \`npm run seed:esercizi\`.`,
    );
  }

  // Scaffolding di dominio scritto a mano (vedi il commento in testa al
  // file): nessuna rotta del prodotto crea una Classe. Il nome porta
  // `RUN_ID`, quindi non collide mai con una classe di un'altra esecuzione
  // né con quelle già presenti nel database di sviluppo.
  const classe = await prisma.classe.create({
    data: { googleGroupEmail: CLASSE_EMAIL, name: CLASSE_NOME, yearLevel: 2 },
  });
  classeId = classe.id;
  await prisma.classeStudente.create({ data: { classeId, studentId } });
});

test.afterAll(async () => {
  // Pulizia per riga/relazione precisa — mai un deleteMany su tabella
  // intera (vedi il commento in testa al file). Se `classeId` non è mai
  // stato assegnato (beforeAll fallito prima di crearla) non c'è niente da
  // pulire.
  if (classeId) {
    const compiti = await prisma.compito.findMany({ where: { classeId }, select: { id: true } });
    const compitoIds = compiti.map((c) => c.id);
    if (compitoIds.length > 0) {
      await prisma.tentativo.deleteMany({ where: { compitoId: { in: compitoIds } } });
      await prisma.compito.deleteMany({ where: { id: { in: compitoIds } } });
    }
    await prisma.classeDocente.deleteMany({ where: { classeId } });
    await prisma.classeStudente.deleteMany({ where: { classeId } });
    await prisma.classe.delete({ where: { id: classeId } }).catch(() => {});
  }

  const batterie = await prisma.batteria.findMany({ where: { name: BATTERIA_NOME }, select: { id: true } });
  const batteriaIds = batterie.map((b) => b.id);
  if (batteriaIds.length > 0) {
    await prisma.batteriaRegola.deleteMany({ where: { batteriaId: { in: batteriaIds } } });
    await prisma.batteria.deleteMany({ where: { id: { in: batteriaIds } } });
  }

  const contenitori = await prisma.contenitore.findMany({ where: { name: CONTENITORE_NOME }, select: { id: true } });
  const contenitoreIds = contenitori.map((c) => c.id);
  if (contenitoreIds.length > 0) {
    await prisma.contenitoreEsercizio.deleteMany({ where: { contenitoreId: { in: contenitoreIds } } });
    await prisma.contenitore.deleteMany({ where: { id: { in: contenitoreIds } } });
  }

  await prisma.$disconnect();
});

// Stesso motivo di `esercizi-player.spec.ts`: il Dev Login accetta
// qualunque email già seminata, senza password, e la sua etichetta dice
// sempre "Entra come docente" anche per uno studente.
async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible({ timeout: 60_000 });
  await emailInput.fill(email);
  await page
    .getByRole("button", { name: /entra come docente|enter as teacher/i })
    .click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

// Cambio di attore nella stessa pagina: si svuotano i cookie di sessione
// invece di aprire un secondo browser context, perché i passi restano in
// ordine stretto (il compito deve esistere prima che lo studente lo veda, e
// deve essere svolto prima che il docente ricarichi le consegne) e un solo
// `page` basta a raccontarli in sequenza.
async function cambiaAttore(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

// Il server di sviluppo (Turbopack) manda al browser, poco dopo il
// caricamento di una pagina, una SECONDA navigazione automatica verso lo
// stesso URL — osservato al banco su `/dashboard/esercizi/contenitori`:
// `page.goto` si risolve, ma un istante dopo arriva un secondo evento
// `framenavigated` verso lo stesso indirizzo che rimpiazza il documento
// (nuovo giro di chunk, nuovo `[HMR] connected`) e con lui azzera qualunque
// stato React nel mezzo — un campo appena riempito con `.fill()` risultava
// vuoto al controllo immediatamente successivo, e un "Crea" premuto in
// quella finestra non produceva nessuna POST. Niente di specifico a
// QUESTA pagina: capita alla prima interazione vera su più di una rotta di
// questa prova, non solo alla primissima visita del processo (un
// pre-riscaldamento fatto a parte, visitando ogni rotta una volta prima di
// interagire, non l'ha eliminato — motivo per cui la guardia sta qui, a
// ogni navigazione vera, non in un giro di riscaldamento separato).
// La guardia: dopo ogni navigazione, si aspetta un'eventuale seconda
// `framenavigated` per una finestra breve; se arriva, se ne aspetta il
// caricamento e si dà una seconda possibilità (capitava anche in catena),
// poi si procede. Se non arriva niente entro la finestra, la pagina era già
// stabile e non si perde tempo.
async function attendiEventualeReload(page: Page) {
  for (let giro = 0; giro < 2; giro++) {
    const secondaNav = await page
      .waitForEvent("framenavigated", { timeout: 3000 })
      .catch(() => null);
    if (!secondaNav) return;
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  }
}

async function gotoStabile(page: Page, url: string) {
  await page.goto(url);
  await attendiEventualeReload(page);
}

async function reloadStabile(page: Page) {
  await page.reload();
  await attendiEventualeReload(page);
}

test.describe("Ciclo compiti — assegna, svolgi, verifica", () => {
  test("il docente vede uno su due dopo che lo studente ne svolge uno solo", async ({ page }) => {
    test.setTimeout(180_000);

    // === Il docente dichiara di insegnare la classe ===
    await login(page, TEACHER_EMAIL);
    await gotoStabile(page, "/dashboard/esercizi/classi");
    const classeRiga = page.locator("li", { hasText: CLASSE_NOME });
    const classeCheckbox = classeRiga.getByRole("checkbox");
    await expect(classeCheckbox).toBeVisible({ timeout: 30_000 });
    // Prima di questo passo il docente non la insegna ancora: la casella
    // arriva scoperta. Se partisse già segnata la prova successiva
    // ("dichiara" cambia qualcosa) sarebbe un'illusione.
    await expect(classeCheckbox).not.toBeChecked();
    await classeCheckbox.check();
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    await expect(page.getByText(/^salvato\.$/i)).toBeVisible({ timeout: 10_000 });
    // Ricarica VERA (non un router.refresh interno): prova che l'insegnamento
    // è stato scritto nel database da `dichiaraInsegnamento`, non solo tenuto
    // nello stato locale del form React.
    await reloadStabile(page);
    await expect(page.locator("li", { hasText: CLASSE_NOME }).getByRole("checkbox")).toBeChecked({
      timeout: 20_000,
    });

    // === Crea un contenitore e ci mette i due esercizi ===
    await gotoStabile(page, "/dashboard/esercizi/contenitori");
    await page.locator("#contenitore-nome").fill(CONTENITORE_NOME);
    await page.getByRole("button", { name: "Crea", exact: true }).click();
    const contenitoreLink = page.getByRole("link", { name: CONTENITORE_NOME });
    await expect(contenitoreLink).toBeVisible({ timeout: 10_000 });
    await contenitoreLink.click();
    await page.waitForURL(/\/dashboard\/esercizi\/contenitori\/[^/]+$/, { timeout: 15_000 });
    await attendiEventualeReload(page);

    for (const esercizio of [ESERCIZIO_UNO, ESERCIZIO_DUE]) {
      const riga = page.locator("li", { hasText: esercizio.title });
      await expect(riga.getByRole("checkbox")).toBeVisible({ timeout: 10_000 });
      await riga.getByRole("checkbox").check();
    }
    await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
    // Confermato: sono passati dalla sezione "fuori" (una casella ciascuno) a
    // quella "dentro" (un bottone "Rimuovi" ciascuno, niente più casella).
    await expect(page.getByRole("button", { name: "Rimuovi", exact: true })).toHaveCount(2, {
      timeout: 10_000,
    });

    // === Compone una batteria che pesca ENTRAMBI gli esercizi ===
    await gotoStabile(page, "/dashboard/esercizi/batterie");
    await page.locator("#batteria-nome").fill(BATTERIA_NOME);
    await page.locator("#batteria-contenitore-0").selectOption({ label: CONTENITORE_NOME });
    await page.locator("#batteria-quantita-0").fill("2");
    await page.getByRole("button", { name: "Crea batteria", exact: true }).click();
    await expect(page.getByText(BATTERIA_NOME)).toBeVisible({ timeout: 10_000 });

    // === Assegna la batteria alla classe ===
    await gotoStabile(page, "/dashboard/esercizi/compiti");
    await page.locator("#compito-batteria").selectOption({ label: BATTERIA_NOME });
    await page.locator("#compito-classe").selectOption({ label: CLASSE_NOME });
    await page.getByRole("button", { name: "Assegna", exact: true }).click();
    await expect(page.getByText(/compito assegnato\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: BATTERIA_NOME })).toBeVisible({ timeout: 10_000 });

    // === Lo studente entra, vede il compito e ne svolge SOLO UNO ===
    await cambiaAttore(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");
    const compitoCard = page.locator("li", { hasText: BATTERIA_NOME });
    await expect(compitoCard).toBeVisible({ timeout: 20_000 });
    // Prima di svolgere niente: zero su due, non un valore qualunque.
    await expect(compitoCard.getByText("0 su 2 esercizi completati")).toBeVisible();

    await compitoCard.getByRole("link", { name: ESERCIZIO_UNO.title }).click();
    await page.waitForURL(new RegExp(`/studente/esercizio/${ESERCIZIO_UNO.id}\\?compitoId=`), {
      timeout: 20_000,
    });
    await attendiEventualeReload(page);

    await expect(page.locator(".katex").first()).toBeVisible({ timeout: 20_000 });
    const campo = page.getByRole("textbox");
    await expect(campo).toHaveCount(1);
    await campo.fill("1");
    const rispostaInviata = page.waitForResponse(
      (r) => r.url().includes("/risposta") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: /^invia$/i }).click();
    await rispostaInviata;

    // Unica parte dell'esercizio, risposta data: il bottone di completamento
    // compare (stesso criterio di `esercizi-player.spec.ts` — è il motore,
    // non l'esito HTTP, a decidere se la parte risulta risposta).
    const completaBtn = page.getByRole("button", { name: /completa il tentativo/i });
    await expect(completaBtn).toBeVisible({ timeout: 15_000 });
    const chiusura = page.waitForResponse(
      (r) => r.url().includes("/completa") && r.request().method() === "POST",
    );
    await completaBtn.click();
    await chiusura;
    await expect(page.getByText(/tentativo completato\./i)).toBeVisible({ timeout: 15_000 });

    // === Il docente ricarica le consegne: uno su due, non due su due ===
    await cambiaAttore(page, TEACHER_EMAIL);
    await gotoStabile(page, "/dashboard/esercizi/compiti");
    await page.getByRole("link", { name: BATTERIA_NOME }).click();
    await page.waitForURL(/\/dashboard\/esercizi\/compiti\/[^/]+$/, { timeout: 15_000 });
    await attendiEventualeReload(page);
    await expect(page.getByRole("heading", { name: BATTERIA_NOME })).toBeVisible({ timeout: 15_000 });

    // Questa è l'asserzione che conta in tutta la prova: il numero che torna
    // dal server dopo un giro vero (creazione, svolgimento, ricarica), non
    // solo il fatto che la tabella compaia. `consegneDelCompito` (dominio)
    // calcola `fatti` contando i `Tentativo` COMPLETED legati a QUESTO
    // compito — un secondo esercizio mai aperto non ne aggiunge nessuno.
    const rigaStudente = page.locator("tr", { hasText: STUDENT_NAME });
    await expect(rigaStudente).toBeVisible({ timeout: 20_000 });
    const celle = rigaStudente.locator("td");
    await expect(celle.nth(1)).toHaveText("1/2");
  });
});
