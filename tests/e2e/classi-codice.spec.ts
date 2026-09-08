/**
 * E2E — Iscrizione con codice: il docente crea la classe, lo studente entra
 * col codice e sopravvive a un accesso successivo (Task 5)
 *
 * Copre il percorso della spec (`docs/superpowers/specs/2026-09-08-classi-
 * codice-iscrizione-design.md`): un docente crea una classe a mano, legge
 * il codice che ne esce, ci assegna un compito. Uno studente inserisce
 * quel codice e vede il compito — la seconda asserzione, perché una classe
 * a cui ci si iscrive senza vederci dentro niente è indistinguibile dal non
 * essersi iscritti.
 *
 * L'ASSERZIONE CHE PORTA IL TASK, e che nessun test unitario può dare da
 * sola: dopo che lo studente si è iscritto col codice, un accesso
 * successivo non lo disiscrive. `allineaClassi` (dominio, classi.ts) è una
 * SOSTITUZIONE INTEGRALE — a ogni sincronizzazione toglie allo studente
 * ogni classe che non ritrova fra i suoi gruppi Google — e senza il filtro
 * sull'origine (Task 1) una classe creata a mano, che non corrisponde a
 * nessun gruppo, sparirebbe sempre al giro successivo. `classi.test.ts`
 * (unitario) prova già che `allineaClassi`, chiamata da sola con righe
 * scritte a mano, rispetta l'origine; questa prova deve dimostrare qualcosa
 * di più forte: che l'iscrizione nata da un vero giro HTTP (click reale
 * sul form dello studente, non una riga inserita con Prisma) sopravvive a
 * un vero, successivo ciclo di accesso dello stesso studente, ed è ancora
 * visibile — non solo presente come riga — dopo.
 *
 * Perché non è un vero accesso Google
 * ------------------------------------
 * `allineaClassi` gira SOLO dentro `signInWithGate` (gate-callbacks.ts), e
 * solo quando `account.provider === "google"`: è lo stesso identico
 * paletto per cui il modello di questa prova (`esercizi-compiti.spec.ts`)
 * deve scrivere una `Classe` a mano con Prisma invece che passare da una
 * rotta — qui non "manca una rotta", manca proprio un modo per il Dev
 * Login (l'unico login che questo ambiente può fare senza un vero account
 * Google Workspace con cui autenticarsi in un browser headless) di
 * raggiungere quel ramo. Chiamare `allineaClassi` da sola — quello che
 * `classi.test.ts` fa già — proverebbe MENO di quei test unitari, non di
 * più: userebbe Prisma per scrivere l'iscrizione invece del vero form
 * dello studente. Qui invece l'iscrizione nasce da un vero POST innescato
 * da un vero click, e la sopravvivenza si verifica con un vero, successivo
 * accesso Dev Login, ricaricando la pagina che lo studente vedrebbe
 * davvero: solo il singolo confine che non si può attraversare offline (la
 * chiamata di rete a Google che decide quali gruppi ha oggi lo studente)
 * è simulato, chiamando `allineaClassi` direttamente nel punto esatto in
 * cui `signInWithGate` la chiamerebbe lei stessa, con l'INSIEME INVARIATO
 * dei gruppi Google che lo studente ha già (letto dalle sue iscrizioni
 * GRUPPO esistenti, non inventato): è la stessa cosa che accadrebbe a un
 * suo prossimo accesso reale se nessuno dei suoi gruppi Google fosse
 * cambiato — lo scenario ordinario, non un caso limite scelto per far
 * passare la prova. Passare un insieme INVENTATO di gruppi, invece,
 * rischierebbe di disiscrivere lo studente dalle classi Google vere del
 * database condiviso (es. "2SIA4.0", seminata) — l'esatto genere di danno
 * che questo worktree deve evitare.
 *
 * Database condiviso con l'ambiente di sviluppo del committente
 * ---------------------------------------------------------------
 * Stessa disciplina del modello: RUN_ID (timestamp + numero casuale) in
 * ogni nome creato da questa prova, cancellazione in `afterAll` per riga o
 * relazione precisa (mai un `deleteMany()` su una tabella intera), mai una
 * pulizia PRIMA di partire — due esecuzioni consecutive, anche su un
 * database già sporco di run precedenti, non collidono mai fra loro né con
 * quello che c'era già, perché il vincolo unico che conta qui
 * (`Classe.name`, fra le classi create a mano e attive) non può mai vedere
 * lo stesso nome due volte.
 *
 * Diversamente dal modello, qui la classe SI PUÒ creare da un vero giro
 * HTTP (Task 3+4: `POST /api/esercizi/classi`, dietro un form reale): non
 * serve scriverla a mano con Prisma. Serve ancora un `PrismaClient` a
 * parte, però, per due cose che nessuna rotta espone: leggere l'origine
 * della riga `ClasseStudente` dopo l'iscrizione (per confermare che è
 * nata `CODICE`, non solo che lo studente "vede" la classe) e chiamare
 * `allineaClassi` per il motivo spiegato sopra.
 *
 * Pre-requisiti
 * -------------
 *  - Il server di sviluppo del worktree deve già essere in esecuzione
 *    (vedi `playwright.config.ts`, porta 3100), con `docente@scuola.it` e
 *    `studente@scuola.it` seminati da `prisma/seed.ts`.
 *  - L'esercizio reale `01-equazione-primo-grado` (da `content/esercizi/`)
 *    deve avere almeno una `EsercizioVersione` in database — seminato con
 *    `npm run seed:esercizi`. Serve solo perché un compito ha bisogno di
 *    un contenitore non vuoto per esistere: questa prova non lo apre né lo
 *    svolge (a differenza di `esercizi-compiti.spec.ts`, qui la seconda
 *    asserzione è la sola VISIBILITÀ del compito, non il suo svolgimento),
 *    e non lo crea né lo cancella: è bacino condiviso.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { allineaClassi } from "@/lib/esercizi/classi";

test.use({ locale: "it-IT" });

const TEACHER_EMAIL = "docente@scuola.it";
const STUDENT_EMAIL = "studente@scuola.it";

// Esercizio reale del bacino, mai creato né cancellato da questa prova:
// basta un contenitore che lo porti per avere un compito assegnabile.
const ESERCIZIO = { id: "01-equazione-primo-grado", title: "Equazione di primo grado" };

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CLASSE_NOME = `E2E Codice Classe ${RUN_ID}`;
const CONTENITORE_NOME = `E2E Codice Contenitore ${RUN_ID}`;
const BATTERIA_NOME = `E2E Codice Batteria ${RUN_ID}`;

let prisma: PrismaClient;
let studentId: string;
let classeId: string | undefined;

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

  const versione = await prisma.esercizioVersione.findFirst({ where: { esercizioId: ESERCIZIO.id } });
  if (!versione) {
    throw new Error(`Esercizio mancante in database (serve ${ESERCIZIO.id}): esegui \`npm run seed:esercizi\`.`);
  }
});

test.afterAll(async () => {
  // Pulizia per riga/relazione precisa — mai un deleteMany su tabella
  // intera (vedi il commento in testa al file). Se `classeId` non è mai
  // stato assegnato (la prova è fallita prima che la classe nascesse) non
  // c'è niente da pulire per essa.
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

// Stesso motivo di `esercizi-compiti.spec.ts`: il Dev Login accetta
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

// Cambio di attore E "nuovo accesso": si svuotano i cookie di sessione e si
// rifà il login da capo, invece di aprire un secondo browser context,
// perché i passi restano in ordine stretto (l'iscrizione deve esistere
// prima che il docente la assegni, il compito deve esistere prima che lo
// studente lo veda) e un solo `page` basta a raccontarli in sequenza. Per
// lo studente, ogni chiamata a questa funzione è anche un vero, nuovo ciclo
// NextAuth (nuovo cookie di sessione, nuova riga di sessione) — non un
// semplice `router.refresh()`.
async function cambiaAttore(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

// Stesso intoppo documentato in `esercizi-compiti.spec.ts`: il server di
// sviluppo (Turbopack) manda al browser, poco dopo il caricamento di una
// pagina, una seconda navigazione automatica verso lo stesso URL che
// azzera qualunque stato React nel mezzo. La guardia: dopo ogni
// navigazione, si aspetta un'eventuale seconda `framenavigated` per una
// finestra breve; se arriva, se ne aspetta il caricamento e si dà una
// seconda possibilità, poi si procede.
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

test.describe("Iscrizione con codice — crea, iscriviti, sopravvivi a un accesso", () => {
  test("un accesso successivo non disiscrive lo studente iscritto col codice", async ({ page }) => {
    test.setTimeout(180_000);

    // === Il docente crea la classe e legge il codice ===
    await login(page, TEACHER_EMAIL);
    await gotoStabile(page, "/dashboard/esercizi/classi");
    await page.locator("#classe-nome").fill(CLASSE_NOME);
    await page.locator("#classe-anno").fill("2");
    await page.getByRole("button", { name: "Crea classe", exact: true }).click();
    await expect(page.getByText(/classe creata: trovi il codice qui sotto\./i)).toBeVisible({ timeout: 10_000 });

    // `creaClasse` (dominio) dichiara da sé che il creatore insegna la
    // classe appena nata: ricompare subito nella sezione "Codice e
    // iscritti" sotto, con la sua card (`data-slot="card"`, shadcn/ui).
    const classeCard = page.locator('[data-slot="card"]', { hasText: CLASSE_NOME });
    await expect(classeCard).toBeVisible({ timeout: 10_000 });
    const codiceFormattato = await classeCard.locator("p.font-mono").innerText();
    // Il codice è mostrato spezzato in due gruppi da tre con uno spazio in
    // mezzo (stesso trucco del PIN delle sessioni live): `iscrivitiConCodice`
    // normalizza solo spazi ai BORDI e maiuscole, non quello interno, quindi
    // va tolto qui prima di scriverlo nel campo dello studente.
    const codice = codiceFormattato.replace(/\s+/g, "");
    expect(codice).toHaveLength(6);

    // === Contenitore con l'esercizio, batteria che lo pesca, compito assegnato ===
    await gotoStabile(page, "/dashboard/esercizi/contenitori");
    await page.locator("#contenitore-nome").fill(CONTENITORE_NOME);
    await page.getByRole("button", { name: "Crea", exact: true }).click();
    const contenitoreLink = page.getByRole("link", { name: CONTENITORE_NOME });
    await expect(contenitoreLink).toBeVisible({ timeout: 10_000 });
    await contenitoreLink.click();
    await page.waitForURL(/\/dashboard\/esercizi\/contenitori\/[^/]+$/, { timeout: 15_000 });
    await attendiEventualeReload(page);

    const rigaEsercizio = page.locator("li", { hasText: ESERCIZIO.title });
    await expect(rigaEsercizio.getByRole("checkbox")).toBeVisible({ timeout: 10_000 });
    await rigaEsercizio.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rimuovi", exact: true })).toHaveCount(1, { timeout: 10_000 });

    await gotoStabile(page, "/dashboard/esercizi/batterie");
    await page.locator("#batteria-nome").fill(BATTERIA_NOME);
    await page.locator("#batteria-contenitore-0").selectOption({ label: CONTENITORE_NOME });
    // Un solo esercizio nel contenitore: il valore predefinito del campo
    // (1) è già la quantità giusta, non serve toccarlo — a differenza del
    // modello (`esercizi-compiti.spec.ts`), questa prova non ha bisogno di
    // un esito deterministico su QUALE esercizio pescare, solo che il
    // compito esista e sia visibile.
    await page.getByRole("button", { name: "Crea batteria", exact: true }).click();
    await expect(page.getByText(BATTERIA_NOME)).toBeVisible({ timeout: 10_000 });

    await gotoStabile(page, "/dashboard/esercizi/compiti");
    await page.locator("#compito-batteria").selectOption({ label: BATTERIA_NOME });
    await page.locator("#compito-classe").selectOption({ label: CLASSE_NOME });
    await page.getByRole("button", { name: "Assegna", exact: true }).click();
    await expect(page.getByText(/compito assegnato\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: BATTERIA_NOME })).toBeVisible({ timeout: 10_000 });

    // === Lo studente si iscrive con un vero POST innescato da un vero click ===
    await cambiaAttore(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");
    // Minuscolo e senza badare agli spazi del codice mostrato: un ragazzo
    // lo scrive così com'è, e `iscrivitiConCodice` normalizza maiuscole e
    // bordi (vedi il commento del dominio).
    await page.locator("#iscrizione-codice").fill(codice.toLowerCase());
    await page.getByRole("button", { name: "Iscriviti", exact: true }).click();
    await expect(page.getByText(new RegExp(`iscritto a ${CLASSE_NOME}\\.`, "i"))).toBeVisible({ timeout: 10_000 });

    // Ora che la classe esiste davvero (creata dal form del docente, non
    // scritta a mano) possiamo risalire al suo id per il resto della prova
    // — nessuna rotta la restituisce dopo la creazione, quindi si legge da
    // Prisma, come lo fa già `iscrizione-classe-form.tsx` lato server per
    // il proprio dominio.
    const classe = await prisma.classe.findFirstOrThrow({ where: { name: CLASSE_NOME } });
    classeId = classe.id;

    // === SECONDA ASSERZIONE: lo studente vede il compito, non solo la classe ===
    // Iscriversi a una classe che non mostra niente è indistinguibile dal
    // non essersi iscritti affatto.
    const compitoCard = page.locator("li", { hasText: BATTERIA_NOME });
    await expect(compitoCard).toBeVisible({ timeout: 20_000 });
    await expect(compitoCard.getByRole("link", { name: ESERCIZIO.title })).toBeVisible();

    // L'iscrizione appena fatta è nata `CODICE`, non `GRUPPO` — è quello
    // che la protegge dal prossimo sync (vedi sotto). Verificato qui, non
    // dato per scontato: se la rotta scrivesse l'origine sbagliata questa
    // prova lo scoprirebbe comunque più sotto (la riga sparirebbe), ma
    // fallire qui indicherebbe subito la causa esatta.
    const iscrizione = await prisma.classeStudente.findUniqueOrThrow({
      where: { classeId_studentId: { classeId, studentId } },
    });
    expect(iscrizione.origine).toBe("CODICE");

    // === L'ASSERZIONE CHE PORTA IL TASK ===
    // Si simula qui, e SOLO qui, il singolo confine che il Dev Login non
    // può attraversare offline (vedi il commento in testa al file):
    // l'insieme dei gruppi Google letto dalla stessa sessione la cui
    // sincronizzazione `signInWithGate` girerebbe al prossimo accesso
    // REALE di questo studente. Si passa l'insieme INVARIATO delle sue
    // iscrizioni GRUPPO già esistenti (non un insieme inventato): è lo
    // scenario ordinario — "niente è cambiato nei suoi gruppi Google da
    // ieri" — non un caso limite scelto per far passare la prova, ed è
    // sicuro per il database condiviso: nessuna classe GRUPPO vera (es.
    // "2SIA4.0", seminata) viene tolta, perché ognuna ricompare intatta
    // nell'insieme che le viene ripassato.
    const iscrizioniDaGruppo = await prisma.classeStudente.findMany({
      where: { studentId, origine: "GRUPPO" },
      include: { classe: true },
    });
    const gruppiInvariati = iscrizioniDaGruppo
      .filter((r) => r.classe.googleGroupEmail !== null)
      .map((r) => ({ email: r.classe.googleGroupEmail!, name: r.classe.name, yearLevel: r.classe.yearLevel }));

    const sync = await allineaClassi(studentId, gruppiInvariati);
    // Nessuna classe GRUPPO tolta (l'insieme passato è lo stesso di prima)
    // e, soprattutto, la classe a codice — che non ha mai un
    // googleGroupEmail e quindi non può mai comparire fra i gruppi voluti
    // — non è fra le uscite: è esattamente ciò che il filtro sull'origine
    // (Task 1) garantisce.
    expect(sync.uscite).not.toContain(classeId);

    const dopoIlSync = await prisma.classeStudente.findUnique({
      where: { classeId_studentId: { classeId, studentId } },
    });
    expect(dopoIlSync).not.toBeNull();
    expect(dopoIlSync!.origine).toBe("CODICE");

    // === Un vero, nuovo accesso dello studente, DOPO il sync ===
    // Questa è la prova che conta: non basta che la riga sopravviva nel
    // database (già verificato sopra, ed è quello che `classi.test.ts`
    // prova già a livello di dominio) — deve sopravvivere anche dal punto
    // di vista dello studente, che rifà un vero login e ricarica la sua
    // pagina reale. Se il filtro sull'origine fosse rotto, la riga sarebbe
    // già sparita dal passo precedente e questa sezione non troverebbe più
    // il compito.
    await cambiaAttore(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");
    const compitoCardDopo = page.locator("li", { hasText: BATTERIA_NOME });
    await expect(compitoCardDopo).toBeVisible({ timeout: 20_000 });
    await expect(compitoCardDopo.getByRole("link", { name: ESERCIZIO.title })).toBeVisible();
  });
});
