/**
 * E2E — Ciclo intero di una verifica (modalità verifica, Task 12)
 *
 * Un docente crea una verifica dal Nuovo compito (blocco sulla raccolta,
 * «prendi 2» a 2 punti, 10 minuti, avvio manuale), la avvia; lo studente la
 * apre dalla home, risponde al primo esercizio, la risposta si salva da sola
 * e sopravvive a un ricaricamento («Riprendi»); il docente vede «1 / 2» nel
 * monitoraggio, chiude, corregge e pubblica; lo studente vede il totale sui
 * 4 punti. In mezzo, a ogni passo dello studente, la regola che conta di
 * più: nessun segnale di giusto/sbagliato o di punteggio prima della
 * pubblicazione.
 *
 * Scaffolding e pulizia come `esercizi-compiti.spec.ts` (vedi il commento
 * lungo in testa a quel file): classe, insegnamento, iscrizione e raccolta
 * scritti col client Prisma, ogni nome porta un `RUN_ID` che non si ripete,
 * la pulizia in `afterAll` è per riga, mai su tabella intera. Qui anche
 * l'insegnamento e la raccolta nascono da Prisma: le loro pagine le prova
 * già quell'altra prova, questa è sulla verifica.
 *
 * Una sola pagina e `cambiaAttore` (cookie svuotati e nuovo login) per i
 * passi in ordine stretto. Lo schermo intero in Chromium senza testa può
 * essere rifiutato: la prova non lo forza, l'applicazione deve continuare a
 * funzionare (un rifiuto è un'uscita registrata, con il riquadro «rientra»
 * che la prova chiude se compare).
 *
 * Pre-requisiti: `docente@scuola.it` e `studente@scuola.it` seminati, e gli
 * esercizi `01-equazione-primo-grado` e `02-scomposizione-polinomi` con
 * almeno una versione (`npm run seed:esercizi`).
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.use({ locale: "it-IT" });

const TEACHER_EMAIL = "docente@scuola.it";
const STUDENT_EMAIL = "studente@scuola.it";
const STUDENT_NAME = "Studente Demo";

const ESERCIZIO_UNO = "01-equazione-primo-grado";
const ESERCIZIO_DUE = "02-scomposizione-polinomi";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CLASSE_EMAIL = `e2e-verifica-${RUN_ID}@scuola.it`;
const CLASSE_NOME = `E2E Verifica Classe ${RUN_ID}`;
const CONTENITORE_NOME = `E2E Verifica Raccolta ${RUN_ID}`;

let prisma: PrismaClient;
let classeId: string;
let contenitoreId: string;
let teacherId: string;
let studentId: string;

test.beforeAll(async () => {
  prisma = new PrismaClient();

  const teacher = await prisma.user.findUnique({ where: { email: TEACHER_EMAIL } });
  const student = await prisma.user.findUnique({ where: { email: STUDENT_EMAIL } });
  if (!teacher || !student) {
    throw new Error(`Seed mancante: servono ${TEACHER_EMAIL} e ${STUDENT_EMAIL}. Esegui \`npx prisma db seed\`.`);
  }
  teacherId = teacher.id;
  studentId = student.id;

  const versioni = await prisma.esercizioVersione.findMany({
    where: { esercizioId: { in: [ESERCIZIO_UNO, ESERCIZIO_DUE] } },
    select: { esercizioId: true },
  });
  const presenti = new Set(versioni.map((v) => v.esercizioId));
  if (!presenti.has(ESERCIZIO_UNO) || !presenti.has(ESERCIZIO_DUE)) {
    throw new Error(
      `Esercizi mancanti in database (servono ${ESERCIZIO_UNO} e ${ESERCIZIO_DUE}): esegui \`npm run seed:esercizi\`.`,
    );
  }

  const classe = await prisma.classe.create({
    data: { googleGroupEmail: CLASSE_EMAIL, name: CLASSE_NOME, yearLevel: 2 },
  });
  classeId = classe.id;
  await prisma.classeStudente.create({ data: { classeId, studentId } });
  await prisma.classeDocente.create({ data: { classeId, teacherId } });

  const contenitore = await prisma.contenitore.create({
    data: { name: CONTENITORE_NOME, createdById: teacherId },
  });
  contenitoreId = contenitore.id;
  await prisma.contenitoreEsercizio.createMany({
    data: [ESERCIZIO_UNO, ESERCIZIO_DUE].map((esercizioId) => ({ contenitoreId, esercizioId, addedById: teacherId })),
  });
});

test.afterAll(async () => {
  // Per riga: la verifica, le prove (con tentativi ed eventi) e le
  // estrazioni vanno via a cascata con il compito; la batteria automatica
  // dopo il compito (`Compito.batteria` è Restrict), la raccolta dopo le
  // regole che la citano.
  let batteriaIds: string[] = [];
  if (classeId) {
    const compiti = await prisma.compito.findMany({ where: { classeId }, select: { id: true, batteriaId: true } });
    const compitoIds = compiti.map((c) => c.id);
    batteriaIds = compiti.map((c) => c.batteriaId);
    if (compitoIds.length > 0) {
      await prisma.tentativo.deleteMany({ where: { compitoId: { in: compitoIds } } });
      await prisma.compito.deleteMany({ where: { id: { in: compitoIds } } });
    }
    await prisma.misurePdp.deleteMany({ where: { classeId } });
    await prisma.classeDocente.deleteMany({ where: { classeId } });
    await prisma.classeStudente.deleteMany({ where: { classeId } });
    await prisma.classe.delete({ where: { id: classeId } }).catch(() => {});
  }
  if (batteriaIds.length > 0) {
    await prisma.batteriaRegola.deleteMany({ where: { batteriaId: { in: batteriaIds } } });
    await prisma.batteria.deleteMany({ where: { id: { in: batteriaIds } } });
  }
  if (contenitoreId) {
    await prisma.contenitoreEsercizio.deleteMany({ where: { contenitoreId } });
    await prisma.contenitore.delete({ where: { id: contenitoreId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

// Helper copiati da `esercizi-compiti.spec.ts` (vedi lì il perché di ognuno).
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

async function cambiaAttore(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

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

/** Lo schermo intero rifiutato apre il riquadro «rientra»: lo si chiude,
 * l'uscita resta registrata e la prova continua. */
async function chiudiEventualeUscita(page: Page) {
  const rientra = page.getByRole("button", { name: "Rientra", exact: true });
  if (await rientra.isVisible().catch(() => false)) await rientra.click();
}

/** I campi dell'esercizio mostrato adesso nella prova: gli altri esercizi
 * sono montati ma nascosti. */
function esercizioCorrente(page: Page) {
  const prova = page.locator("main main");
  return {
    campi: prova.getByRole("textbox").filter({ visible: true }),
    scelte: prova.getByRole("radio").filter({ visible: true }),
  };
}

/** Nessun segnale di correzione o di punteggio a schermo. */
async function nienteCorrezione(page: Page) {
  await expect(page.getByText(/Risposta corretta/i)).toHaveCount(0);
  await expect(page.getByText(/Punteggio/i)).toHaveCount(0);
}

test.describe("Ciclo verifica — crea, avvia, svolgi, chiudi, pubblica", () => {
  test("lo studente vede il totale sui 4 punti solo dopo la pubblicazione", async ({ page }) => {
    test.setTimeout(240_000);

    // === Il docente crea la verifica dal Nuovo compito ===
    await login(page, TEACHER_EMAIL);
    await gotoStabile(page, `/dashboard/esercizi/compiti/nuovo?raccolta=${contenitoreId}`);
    await page.locator("label", { has: page.locator('input[name="nc-tipo"][value="VERIFICA"]') }).click();
    await page.locator("#nc-classe").selectOption({ label: CLASSE_NOME });
    await expect(
      page.getByRole("spinbutton", { name: `Quanti esercizi prendere da ${CONTENITORE_NOME}` }),
    ).toHaveValue("2", { timeout: 15_000 });
    await page.getByRole("spinbutton", { name: `Punti per esercizio di ${CONTENITORE_NOME}` }).fill("2");
    await page.locator("#nc-durata").fill("10");
    await page.getByRole("radio", { name: "quando premo Avvia" }).check();
    await expect(page.getByText("Totale della verifica: 4 punti")).toBeVisible();

    await page.getByRole("button", { name: `Crea la verifica per ${CLASSE_NOME}`, exact: true }).click();
    await page.waitForURL(/\/dashboard\/esercizi\/verifiche\/[^/?]+$/, { timeout: 15_000 });
    const verificaId = new URL(page.url()).pathname.split("/").pop()!;
    await attendiEventualeReload(page);
    await expect(page.getByText("Preparata", { exact: true })).toBeVisible({ timeout: 15_000 });

    // === Avvia ===
    await page.getByRole("button", { name: "Avvia", exact: true }).click();
    await page.getByRole("button", { name: "Sì, avvia", exact: true }).click();
    await expect(page.getByText("In corso", { exact: true })).toBeVisible({ timeout: 15_000 });

    // === Lo studente la trova «In corso» nella home e la apre ===
    const linkVerifica = (p: Page) => p.locator(`a[href$="/studente/verifica/${verificaId}"]`);
    await cambiaAttore(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");
    const riga = page.locator("li", { has: linkVerifica(page) });
    await expect(riga).toBeVisible({ timeout: 20_000 });
    await expect(riga.getByText("In corso", { exact: true })).toBeVisible();
    await linkVerifica(page).click();
    await page.waitForURL(new RegExp(`/studente/verifica/${verificaId}$`), { timeout: 20_000 });
    await attendiEventualeReload(page);

    await page.getByRole("button", { name: "Inizia la verifica", exact: true }).click();
    const nav = page.getByRole("navigation", { name: "Esercizi della verifica" });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    await chiudiEventualeUscita(page);
    await expect(page.getByRole("button", { name: "Esercizio 1: non risposto" })).toBeVisible();

    // === Risponde al primo esercizio: si salva da sé, nessuna correzione ===
    // L'ordine degli esercizi è per studente: il primo può essere l'equazione
    // (un campo di testo) o la scomposizione (una scelta multipla).
    const esercizio = esercizioCorrente(page);
    await expect(esercizio.campi.or(esercizio.scelte).first()).toBeVisible({ timeout: 20_000 });
    const conCampo = (await esercizio.campi.count()) > 0;
    const salvataggio = page.waitForResponse(
      (r) => r.url().includes(`/verifiche/${verificaId}/prova/risposte`) && r.request().method() === "PUT",
    );
    if (conCampo) await esercizio.campi.first().fill("1");
    else await esercizio.scelte.first().check();
    expect((await salvataggio).status()).toBe(200);
    await expect(page.getByText("Salvato", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Esercizio 1: risposto" })).toBeVisible();
    await nienteCorrezione(page);

    // === Ricarica: «Riprendi» e la risposta è ancora lì ===
    await reloadStabile(page);
    await page.getByRole("button", { name: "Riprendi la verifica", exact: true }).click();
    await expect(nav).toBeVisible({ timeout: 20_000 });
    await chiudiEventualeUscita(page);
    if (conCampo) await expect(esercizio.campi.first()).toHaveValue("1", { timeout: 10_000 });
    else await expect(esercizio.scelte.first()).toBeChecked({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Esercizio 1: risposto" })).toBeVisible();
    await nienteCorrezione(page);

    // === Il docente vede «1 / 2» nel monitoraggio e chiude ===
    await cambiaAttore(page, TEACHER_EMAIL);
    await gotoStabile(page, `/dashboard/esercizi/verifiche/${verificaId}`);
    const rigaMonitor = page.locator("tr", { hasText: STUDENT_NAME });
    await expect(rigaMonitor).toContainText("1 / 2", { timeout: 10_000 });
    await page.getByRole("button", { name: "Chiudi", exact: true }).click();
    await page.getByRole("button", { name: "Sì, chiudi", exact: true }).click();
    await expect(page.getByText("Chiusa", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

    // === Lo studente, ricaricando, la trova consegnata ===
    // Una prova consegnata (qui dalla chiusura del docente) apre la pagina
    // dei risultati: «Risultati non ancora pubblicati», che dice che la
    // verifica è consegnata. La schermata «Verifica consegnata» è quella
    // della prova aperta, senza ricaricare.
    await cambiaAttore(page, STUDENT_EMAIL);
    await gotoStabile(page, `/studente/verifica/${verificaId}`);
    await expect(page.getByRole("heading", { name: "Risultati non ancora pubblicati" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/La tua verifica è consegnata/)).toBeVisible();
    await expect(page.getByText(/\/ 4 punti/)).toHaveCount(0);
    await nienteCorrezione(page);

    // === Il docente: risultati con un totale, poi «Pubblica i risultati» ===
    await cambiaAttore(page, TEACHER_EMAIL);
    await gotoStabile(page, `/dashboard/esercizi/verifiche/${verificaId}`);
    const rigaRisultati = page.locator("tr", { has: page.getByRole("rowheader", { name: new RegExp(STUDENT_NAME) }) });
    await expect(rigaRisultati).toBeVisible({ timeout: 20_000 });
    await expect(rigaRisultati).toContainText(/\d+(,\d+)?%/);
    await page.getByRole("button", { name: "Pubblica i risultati", exact: true }).click();
    await expect(page.getByText("Risultati pubblicati: gli studenti li vedono.")).toBeVisible({ timeout: 15_000 });

    // === Lo studente vede i risultati sui 4 punti ===
    await cambiaAttore(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");
    const rigaPubblicata = page.locator("li", { has: linkVerifica(page) });
    await expect(rigaPubblicata.getByText("Risultati pubblicati", { exact: true })).toBeVisible({ timeout: 20_000 });
    await rigaPubblicata.getByRole("link", { name: "Vedi i risultati" }).click();
    await page.waitForURL(new RegExp(`/studente/verifica/${verificaId}$`), { timeout: 20_000 });
    await attendiEventualeReload(page);
    await expect(page.getByRole("heading", { name: "Risultati della verifica" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\/ 4 punti/)).toBeVisible();
  });
});
