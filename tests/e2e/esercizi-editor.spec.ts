/**
 * E2E — Dall'editor allo studente: un esercizio casuale, dalla scrittura
 * alla soluzione (Task 9)
 *
 * L'intero motivo per cui questo sotto-progetto esiste: un docente scrive
 * UNA FAMIGLIA di esercizi, non un esercizio — perché due studenti seduti
 * vicini non possano copiarsi la risposta. Una prova che si fermasse a
 * verificare che l'editor salva e che il player carica una pagina non
 * proverebbe questo; qui si arriva fino in fondo, per pagine vere:
 *
 * **L'asserzione che conta**: due studenti diversi, sullo stesso esercizio
 * appena scritto, ricevono due NUMERI diversi. Non "due pagine diverse", non
 * "due tentativi diversi" — il valore letto dalla formula che il motore ha
 * generato per ciascuno, estratto dal DOM vero dopo un giro completo
 * (editor -> salvataggio -> contenitore -> batteria -> compito -> player).
 * Il docente dichiara una variabile `n` casuale su un intervallo di un
 * milione di valori (`random(1..1000000)`, vedi `ESERCIZIO_BUONO` sotto):
 * con un intervallo così largo la probabilità che due sorteggi indipendenti
 * (un `randomUUID()` per tentativo, vedi `tentativo.ts`) collidano è
 * trascurabile (~1 su un milione), quindi un'uguaglianza qui sarebbe quasi
 * certamente un difetto vero, non sfortuna statistica.
 *
 * **La seconda asserzione**: un esercizio che si rompe per un seme non si
 * salva, e il rifiuto nomina QUEL seme. `ESERCIZIO_ROTTO` sotto dichiara
 * `n = random(-2..2)` e una parte numerica di risposta `1/n`: per un seme la
 * cui n cade a zero, l'estremo della parte diventa infinito
 * (`estremiFiniti`, verifica.ts) e la verifica a venti semi si ferma lì.
 * Verificato PRIMA di scrivere questa prova, girando `verificaSuSemi` a
 * mano fuori da Playwright sullo stesso identico esercizio: si rompe
 * SEMPRE al seme 14, fase "risposta" — deterministico perché ogni seme
 * numerico produce sempre lo stesso flusso di numeri casuali (stesso motivo
 * per cui la prova può girare due volte di fila e fermarsi sempre allo
 * stesso punto, vedi sotto). La prova non si limita a leggere il corpo
 * della risposta HTTP (422, `dettaglio.seme === 14`): legge anche lo
 * `[data-seme]` che il docente vede davvero in pagina, perché un docente
 * non legge il JSON della rotta.
 *
 * Perché il seme è deterministico e non "un seme qualunque, purché ce ne
 * sia uno": `verificaSuSemi` (Task 3) prova i semi "0".."19" in ordine fisso
 * e si ferma al primo che rompe — lo stesso identico esercizio produce
 * sempre lo stesso primo seme rotto, ad ogni esecuzione. Asserire il valore
 * esatto (14), non solo "un numero è presente", è quello che rende
 * ripetibile la seconda esecuzione della prova (vedi sotto) e cattura una
 * regressione vera se `verificaSuSemi` cambiasse ordine o smettesse di
 * fermarsi al primo difetto.
 *
 * Database condiviso con l'ambiente di sviluppo del committente
 * ---------------------------------------------------------------
 * Stesso principio di `esercizi-compiti.spec.ts` (il modello più vicino a
 * questa prova, da cui riusa la porta 3100, `locale: "it-IT"`, il Dev
 * Login, e la scelta di scrivere `Classe`/`ClasseStudente`/`ClasseDocente`
 * direttamente col client Prisma prima del test — nessuna rotta del
 * prodotto crea una `Classe`, e il cancello Google che le allineerebbe si
 * salta per qualunque provider diverso da "google", Dev Login compreso).
 * In più, qui, DUE studenti nuovi (mai due nomi che il committente possa
 * già avere seminato): l'asserzione che conta ha bisogno di DUE persone
 * distinte sullo STESSO esercizio, e riusare `studente@scuola.it` da solo
 * non basterebbe a produrre un secondo numero indipendente. Sono utenti
 * scritti da questa prova (mai un `deleteMany()` su tabella intera:
 * cancellati per id preciso in `afterAll`), non scaffolding che il
 * prodotto avrebbe comunque bisogno di avere.
 *
 * L'esercizio scritto dall'editor (`ESERCIZIO_BUONO`) porta un titolo unico
 * per `RUN_ID`: due esecuzioni consecutive, anche su un database sporco di
 * esecuzioni precedenti mai ripulite, non si confondono a vicenda né
 * collidono su un vincolo UNIQUE — stesso ragionamento del modello.
 *
 * Pre-requisiti
 * -------------
 *  - Il server di sviluppo del worktree deve già essere in esecuzione
 *    (porta 3100), con `docente@scuola.it` seminato da `prisma/seed.ts`.
 *  - Nessun esercizio del bacino condiviso viene toccato: questa prova
 *    scrive solo esercizi propri, mai `content/esercizi/`.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient, Role } from "@prisma/client";

test.use({ locale: "it-IT" });

const TEACHER_EMAIL = "docente@scuola.it";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const STUDENT_A_EMAIL = `e2e-editor-a-${RUN_ID}@scuola.it`;
const STUDENT_A_NAME = `E2E Editor Studente A ${RUN_ID}`;
const STUDENT_B_EMAIL = `e2e-editor-b-${RUN_ID}@scuola.it`;
const STUDENT_B_NAME = `E2E Editor Studente B ${RUN_ID}`;

const CLASSE_EMAIL = `e2e-editor-${RUN_ID}@scuola.it`;
const CLASSE_NOME = `E2E Editor Classe ${RUN_ID}`;
const CONTENITORE_NOME = `E2E Editor Contenitore ${RUN_ID}`;
const BATTERIA_NOME = `E2E Editor Batteria ${RUN_ID}`;

// L'esercizio vero: una variabile casuale su un intervallo enorme e una
// parte numerica la cui risposta corretta È quella variabile — lo stesso
// numero che il testo mostra via `\var{n}` è quello che lo studente deve
// scrivere, così leggere il numero dalla pagina e verificare che la
// risposta sia giudicata corretta sono la STESSA operazione (vedi
// `leggiNumeroDallaFormula` e `rispondiECompleta`).
const ESERCIZIO_BUONO = {
  titolo: `E2E Editor Esercizio ${RUN_ID}`,
  argomento: "Prova E2E",
  testo: "Sia \\(n = \\var{n}\\) il numero da calcolare.",
  variabileNome: "n",
  variabileDefinizione: "random(1..1000000)",
  parteConsegna: "Quanto vale n?",
  parteValore: "n",
};

// L'esercizio rotto: `n` può cadere a zero, e allora `1/n` (l'estremo della
// parte numerica) diventa infinito — verificato a mano fuori da Playwright
// (vedi il commento in testa al file): si rompe SEMPRE al seme 14, fase
// "risposta". Non deve MAI arrivare a esistere una riga `Esercizio` con
// questo titolo: è esattamente ciò che la seconda asserzione controlla.
const ESERCIZIO_ROTTO = {
  titolo: `E2E Editor Rotto ${RUN_ID}`,
  argomento: "Prova E2E",
  testo: "Calcola $1/n$ con $n = \\var{n}$.",
  variabileNome: "n",
  variabileDefinizione: "random(-2..2)",
  parteConsegna: "Il valore di 1/n",
  parteValore: "1/n",
};
const SEME_ROTTURA = "14";
const FASE_ROTTURA = "risposta";

let prisma: PrismaClient;
let teacherId: string;
let studentAId: string;
let studentBId: string;
let classeId: string;
let esercizioBuonoId: string | undefined;

test.beforeAll(async () => {
  prisma = new PrismaClient();

  const teacher = await prisma.user.findUnique({ where: { email: TEACHER_EMAIL } });
  if (!teacher) {
    throw new Error(`Seed mancante: utente ${TEACHER_EMAIL} non trovato. Esegui \`npx prisma db seed\`.`);
  }
  teacherId = teacher.id;

  const studentA = await prisma.user.create({
    data: { email: STUDENT_A_EMAIL, name: STUDENT_A_NAME, role: Role.STUDENT },
  });
  studentAId = studentA.id;
  const studentB = await prisma.user.create({
    data: { email: STUDENT_B_EMAIL, name: STUDENT_B_NAME, role: Role.STUDENT },
  });
  studentBId = studentB.id;

  // Scaffolding di dominio scritto a mano, come in `esercizi-compiti.spec.ts`
  // (vedi il commento in testa al file): nessuna rotta del prodotto crea una
  // `Classe`. `ClasseDocente` scritta direttamente invece che passando dal
  // modulo "dichiara insegnamento" (già provato da quella prova): qui la
  // relazione classe/docente è solo una precondizione per assegnare un
  // compito, non una delle due asserzioni che contano in questa prova.
  const classe = await prisma.classe.create({
    data: { googleGroupEmail: CLASSE_EMAIL, name: CLASSE_NOME, yearLevel: 2 },
  });
  classeId = classe.id;
  await prisma.classeDocente.create({ data: { classeId, teacherId } });
  await prisma.classeStudente.create({ data: { classeId, studentId: studentAId } });
  await prisma.classeStudente.create({ data: { classeId, studentId: studentBId } });
});

test.afterAll(async () => {
  // Pulizia per riga/relazione precisa — mai un `deleteMany()` su una
  // tabella intera (stesso principio di `esercizi-compiti.spec.ts`, dove
  // quel pattern ha già destabilizzato la suite una volta).
  const studentIds = [studentAId, studentBId].filter((id): id is string => !!id);
  if (studentIds.length > 0) {
    await prisma.tentativo.deleteMany({ where: { studentId: { in: studentIds } } });
  }

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

  if (esercizioBuonoId) {
    await prisma.esercizioVersione.deleteMany({ where: { esercizioId: esercizioBuonoId } });
    await prisma.esercizio.delete({ where: { id: esercizioBuonoId } }).catch(() => {});
  }

  // Difensivo, non correttivo: l'esercizio rotto non dovrebbe MAI esistere
  // (è l'assunto stesso della seconda asserzione). Se una futura regressione
  // lo lasciasse comunque scritto a metà prova, questo lo ripulisce per
  // titolo esatto — mai un `deleteMany()` più largo.
  const rottoEsistente = await prisma.esercizio.findFirst({
    where: { title: ESERCIZIO_ROTTO.titolo },
    select: { id: true },
  });
  if (rottoEsistente) {
    await prisma.esercizioVersione.deleteMany({ where: { esercizioId: rottoEsistente.id } });
    await prisma.esercizio.delete({ where: { id: rottoEsistente.id } }).catch(() => {});
  }

  if (studentIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: studentIds } } });
  }

  await prisma.$disconnect();
});

// Stesso motivo di `esercizi-compiti.spec.ts`: il Dev Login accetta
// qualunque email già seminata (qui: già scritta da `beforeAll`), senza
// password, e la sua etichetta dice sempre "Entra come docente" anche per
// uno studente.
async function login(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[type="email"]');
  await expect(emailInput).toBeVisible({ timeout: 60_000 });
  await emailInput.fill(email);
  await page.getByRole("button", { name: /entra come docente|enter as teacher/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
}

// Cambio di attore nella stessa pagina: si svuotano i cookie di sessione
// invece di aprire un secondo browser context, perché i passi restano in
// ordine stretto (l'esercizio deve esistere ed essere assegnato prima che
// uno studente lo apra) e un solo `page` basta a raccontarli in sequenza.
async function cambiaAttore(page: Page, email: string) {
  await page.context().clearCookies();
  await login(page, email);
}

// Il server di sviluppo (Turbopack) manda al browser, poco dopo il
// caricamento di una pagina, una SECONDA navigazione automatica verso lo
// stesso URL (vedi il commento gemello, più esteso, in
// `esercizi-compiti.spec.ts`): senza aspettarla, la prima interazione vera
// su una pagina appena aperta rischia di scrivere in un modulo che sta per
// essere rimontato da capo.
async function attendiEventualeReload(page: Page) {
  for (let giro = 0; giro < 2; giro++) {
    const secondaNav = await page.waitForEvent("framenavigated", { timeout: 3000 }).catch(() => null);
    if (!secondaNav) return;
    await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
  }
}

async function gotoStabile(page: Page, url: string) {
  await page.goto(url);
  await attendiEventualeReload(page);
}

interface DatiEsercizio {
  titolo: string;
  argomento: string;
  testo: string;
  variabileNome: string;
  variabileDefinizione: string;
  parteConsegna: string;
  parteValore: string;
}

// Compila il modulo di redazione (Task 6/7): metadati, testo, una variabile,
// una parte numerica. Presuppone di essere già su
// `/dashboard/esercizi/redazione/nuovo`, appena stabilizzata da
// `gotoStabile`. `#parte-numerica-valore` non è indicizzato per parte (vedi
// `parte-numerica.tsx`): funziona qui solo perché questa prova aggiunge
// sempre e sole UNA parte per esercizio, mai un id duplicato in pagina. La
// consegna della parte non ha invece un id proprio (l'`<label>` in
// `parte-numerica.tsx` non porta un `htmlFor`): si individua il suo
// contenitore dal titolo "Parte 1" che l'editor genera per la prima parte
// (`t("parti.numeroParte", {numero: 1})`), non dall'ordine nel DOM da solo.
async function compilaEsercizio(page: Page, dati: DatiEsercizio) {
  await page.locator("#redazione-titolo").fill(dati.titolo);
  await page.locator("#redazione-argomento").fill(dati.argomento);
  await page.locator("#redazione-testo").fill(dati.testo);

  await page.getByRole("button", { name: "Aggiungi variabile", exact: true }).click();
  await page.locator("#variabile-0-nome").fill(dati.variabileNome);
  await page.locator("#variabile-0-definizione").fill(dati.variabileDefinizione);

  await page.getByRole("button", { name: "Aggiungi parte", exact: true }).click();
  const contenitoreParte1 = page.locator('h3:has-text("Parte 1") + div');
  await contenitoreParte1.locator("textarea").fill(dati.parteConsegna);
  await page.locator("#parte-numerica-valore").fill(dati.parteValore);
}

// Il numero che il motore ha davvero generato per QUESTO tentativo, letto
// dalla formula resa da KaTeX (`\(n = \var{n}\)` nel testo di
// `ESERCIZIO_BUONO`) — non un valore assunto o riletto dal seme del
// tentativo, ma il testo che finisce davvero sotto gli occhi dello
// studente. Il testo concatenato di un nodo `.katex` include sia il
// rendering visivo sia l'annotazione MathML col sorgente TeX originale
// (verificato a mano fuori da Playwright, vedi il commento in testa al
// file): la cifra cercata compare comunque, sempre nello stesso ordine,
// quindi il primo blocco di cifre nel testo è sempre quello giusto. Un solo
// zona matematica nel testo dell'esercizio (niente altre `\( \)`): non
// c'è ambiguità su quale `.katex` della pagina sia questo.
async function leggiNumeroDallaFormula(page: Page): Promise<string> {
  const formula = page.locator(".katex").first();
  await expect(formula).toBeVisible({ timeout: 20_000 });
  const testo = (await formula.textContent()) ?? "";
  const trovato = testo.match(/\d+/);
  expect(trovato, `nessun numero trovato nella formula: "${testo}"`).not.toBeNull();
  return trovato![0];
}

// Risponde con `valore` (letto da `leggiNumeroDallaFormula`: per
// `ESERCIZIO_BUONO` la risposta corretta È il numero mostrato, vedi il
// commento su `ESERCIZIO_BUONO`), controlla che il motore lo giudichi
// esattamente giusto (1/1 — non un punteggio qualunque: se fosse diverso da
// 1/1 vorrebbe dire che il numero letto dalla pagina non è quello che il
// motore si aspettava, lo stesso difetto che l'asserzione principale deve
// poter scoprire) e completa il tentativo.
async function rispondiECompleta(page: Page, valore: string) {
  const campo = page.getByRole("textbox");
  await expect(campo).toHaveCount(1);
  await campo.fill(valore);
  const rispostaInviata = page.waitForResponse(
    (r) => r.url().includes("/risposta") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: /^invia$/i }).click();
  await rispostaInviata;

  await expect(page.getByText(/Punteggio:\s*1\s*\/\s*1/)).toBeVisible({ timeout: 15_000 });

  const completaBtn = page.getByRole("button", { name: /completa il tentativo/i });
  await expect(completaBtn).toBeVisible({ timeout: 15_000 });
  const chiusura = page.waitForResponse(
    (r) => r.url().includes("/completa") && r.request().method() === "POST",
  );
  await completaBtn.click();
  await chiusura;
  await expect(page.getByText(/tentativo completato\./i)).toBeVisible({ timeout: 15_000 });
}

test.describe("Editor esercizi — dalla scrittura alla soluzione dello studente", () => {
  test("due studenti diversi ricevono numeri diversi; un esercizio rotto non si salva", async ({ page }) => {
    test.setTimeout(240_000);

    // === Il docente scrive l'esercizio: variabile casuale, parte numerica ===
    await login(page, TEACHER_EMAIL);
    await gotoStabile(page, "/dashboard/esercizi/redazione/nuovo");
    await compilaEsercizio(page, ESERCIZIO_BUONO);

    // Vede l'anteprima: lo stesso player dello studente, tre semi diversi
    // affiancati (Task 7) — la prova qui in appoggio è solo che i tre
    // pannelli renderizzano davvero una formula, non che i tre numeri
    // differiscano fra loro (quella prova, la sola che conta davvero, è
    // sul motore reale più avanti — vedi il commento in testa al file).
    const pannelliAnteprima = page.locator("[data-anteprima]");
    await expect(pannelliAnteprima).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(pannelliAnteprima.nth(i).locator(".katex").first()).toBeVisible({ timeout: 20_000 });
    }

    // Controlla: nessun problema sui venti semi di prova.
    const verificaInviata = page.waitForResponse(
      (r) => r.url().endsWith("/api/esercizi/redazione/verifica") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Controlla", exact: true }).click();
    const verificaRes = await verificaInviata;
    expect(verificaRes.status()).toBe(200);
    expect((await verificaRes.json()).ok).toBe(true);
    await expect(page.getByText(/nessun problema nei venti semi di prova\./i)).toBeVisible({ timeout: 10_000 });

    // Salva: prima versione dell'esercizio.
    const creazioneInviata = page.waitForResponse(
      (r) => r.url().endsWith("/api/esercizi/redazione") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    const creazioneRes = await creazioneInviata;
    expect(creazioneRes.status()).toBe(201);
    const creazioneCorpo = (await creazioneRes.json()) as { esercizioId: string; versione: number };
    esercizioBuonoId = creazioneCorpo.esercizioId;
    expect(creazioneCorpo.versione).toBe(1);
    await expect(page.getByText(/esercizio salvato\./i)).toBeVisible({ timeout: 10_000 });
    await page.waitForURL(new RegExp(`/dashboard/esercizi/redazione/${esercizioBuonoId}$`), { timeout: 15_000 });

    // === Lo mette in un contenitore ===
    await gotoStabile(page, "/dashboard/esercizi/contenitori");
    await page.locator("#contenitore-nome").fill(CONTENITORE_NOME);
    await page.getByRole("button", { name: "Crea", exact: true }).click();
    const contenitoreLink = page.getByRole("link", { name: CONTENITORE_NOME });
    await expect(contenitoreLink).toBeVisible({ timeout: 10_000 });
    await contenitoreLink.click();
    await page.waitForURL(/\/dashboard\/esercizi\/contenitori\/[^/]+$/, { timeout: 15_000 });
    await attendiEventualeReload(page);

    const rigaEsercizio = page.locator("li", { hasText: ESERCIZIO_BUONO.titolo });
    await expect(rigaEsercizio.getByRole("checkbox")).toBeVisible({ timeout: 10_000 });
    await rigaEsercizio.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
    await expect(page.getByRole("button", { name: "Rimuovi", exact: true })).toHaveCount(1, { timeout: 10_000 });

    // === Compone una batteria che lo pesca (un solo esercizio nel
    // contenitore, quantità 1: nessuna scelta casuale da indovinare — stesso
    // principio di `esercizi-compiti.spec.ts`) ===
    await gotoStabile(page, "/dashboard/esercizi/batterie");
    await page.locator("#batteria-nome").fill(BATTERIA_NOME);
    await page.locator("#batteria-contenitore-0").selectOption({ label: CONTENITORE_NOME });
    await page.locator("#batteria-quantita-0").fill("1");
    await page.getByRole("button", { name: "Crea batteria", exact: true }).click();
    await expect(page.getByText(BATTERIA_NOME)).toBeVisible({ timeout: 10_000 });

    // === Lo assegna alla classe (due studenti, scritti in beforeAll) ===
    await gotoStabile(page, "/dashboard/esercizi/compiti");
    await page.locator("#compito-batteria").selectOption({ label: BATTERIA_NOME });
    await page.locator("#compito-classe").selectOption({ label: CLASSE_NOME });
    await page.getByRole("button", { name: "Assegna", exact: true }).click();
    await expect(page.getByText(/compito assegnato\./i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("link", { name: BATTERIA_NOME })).toBeVisible({ timeout: 10_000 });

    // === Studente A apre l'esercizio e legge il SUO numero ===
    await cambiaAttore(page, STUDENT_A_EMAIL);
    await gotoStabile(page, "/studente");
    const compitoCardA = page.locator("li", { hasText: BATTERIA_NOME });
    await expect(compitoCardA).toBeVisible({ timeout: 20_000 });
    // Prima di svolgere niente: zero su uno, non un valore qualunque.
    await expect(compitoCardA.getByText("0 su 1 esercizi completati")).toBeVisible();
    await compitoCardA.getByRole("link", { name: ESERCIZIO_BUONO.titolo }).click();
    await page.waitForURL(new RegExp(`/studente/esercizio/${esercizioBuonoId}\\?compitoId=`), { timeout: 20_000 });
    await attendiEventualeReload(page);
    const numeroA = await leggiNumeroDallaFormula(page);

    // === Studente B apre LO STESSO esercizio e legge il SUO numero ===
    await cambiaAttore(page, STUDENT_B_EMAIL);
    await gotoStabile(page, "/studente");
    const compitoCardB = page.locator("li", { hasText: BATTERIA_NOME });
    await expect(compitoCardB).toBeVisible({ timeout: 20_000 });
    await expect(compitoCardB.getByText("0 su 1 esercizi completati")).toBeVisible();
    await compitoCardB.getByRole("link", { name: ESERCIZIO_BUONO.titolo }).click();
    await page.waitForURL(new RegExp(`/studente/esercizio/${esercizioBuonoId}\\?compitoId=`), { timeout: 20_000 });
    await attendiEventualeReload(page);
    const numeroB = await leggiNumeroDallaFormula(page);

    // *** L'ASSERZIONE CHE CONTA IN TUTTA LA PROVA ***
    // Stesso esercizio (stessa `EsercizioVersione`, stesso `drawnVersionIds`
    // del compito), due tentativi indipendenti (`randomUUID()` per
    // tentativo, vedi `tentativo.ts`): il motore deve aver pescato due
    // valori diversi per `n`. Con un intervallo di un milione di valori
    // (vedi `ESERCIZIO_BUONO`) una collisione qui sarebbe una sorpresa
    // statistica enorme (~1 su un milione) — un'uguaglianza indicherebbe un
    // difetto reale (un seme non usato, una cache condivisa fra tentativi),
    // non sfortuna.
    expect(numeroA).not.toBe(numeroB);

    // Studente B risolve col SUO numero (il campo era ancora vuoto: nessuna
    // risposta di A per un tentativo diverso dal suo può esserci finita
    // dentro).
    await rispondiECompleta(page, numeroB);

    // === Torna a Studente A e risolve col SUO numero ===
    // Di nuovo dal link del compito, non da un URL scritto a mano: senza il
    // vero `compitoId` nella query, `avviaORiprendi` (dominio) cerca un
    // tentativo con `compitoId: null` — non troverebbe quello aperto sopra
    // (che porta il `compitoId` vero) e ne apre uno NUOVO, con un seme
    // diverso: il numero letto più avanti non sarebbe più `numeroA`. Il
    // link del compito è l'unico modo di riaprire lo STESSO tentativo.
    await cambiaAttore(page, STUDENT_A_EMAIL);
    await gotoStabile(page, "/studente");
    const compitoCardA2 = page.locator("li", { hasText: BATTERIA_NOME });
    await expect(compitoCardA2).toBeVisible({ timeout: 20_000 });
    await compitoCardA2.getByRole("link", { name: ESERCIZIO_BUONO.titolo }).click();
    await page.waitForURL(new RegExp(`/studente/esercizio/${esercizioBuonoId}\\?compitoId=`), { timeout: 20_000 });
    await attendiEventualeReload(page);
    await expect(page.locator(".katex").first()).toBeVisible({ timeout: 20_000 });
    await rispondiECompleta(page, numeroA);

    // === Seconda asserzione: l'esercizio rotto non si salva, e il rifiuto
    // nomina il seme (vedi il commento in testa al file) ===
    await cambiaAttore(page, TEACHER_EMAIL);
    await gotoStabile(page, "/dashboard/esercizi/redazione/nuovo");
    await compilaEsercizio(page, ESERCIZIO_ROTTO);

    const salvataggioRifiutato = page.waitForResponse(
      (r) => r.url().endsWith("/api/esercizi/redazione") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Salva", exact: true }).click();
    const rifiutoRes = await salvataggioRifiutato;
    expect(rifiutoRes.status()).toBe(422);
    const rifiutoCorpo = (await rifiutoRes.json()) as {
      error?: string;
      dettaglio?: { seme: number; fase: string; messaggio: string };
    };
    expect(rifiutoCorpo.error).toBe("verifica_fallita");
    expect(rifiutoCorpo.dettaglio?.seme).toBe(Number(SEME_ROTTURA));
    expect(rifiutoCorpo.dettaglio?.fase).toBe(FASE_ROTTURA);

    // Non solo la rotta: quello che il docente legge DAVVERO in pagina. Un
    // docente non guarda il corpo JSON — vede questo `role="alert"` (filtrato
    // per testo: Next.js pubblica un secondo `role="alert"` invisibile, il
    // suo "route announcer" per screen reader, sempre presente in pagina).
    const alertVerifica = page.locator('[role="alert"]').filter({ hasText: "Verifica non superata" });
    await expect(alertVerifica).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-seme]")).toHaveText(SEME_ROTTURA);
    await expect(page.locator("[data-fase]")).toHaveText(FASE_ROTTURA);

    // Nessuna navigazione: un salvataggio rifiutato non porta alla pagina di
    // modifica di un esercizio che non esiste.
    expect(page.url()).toContain("/dashboard/esercizi/redazione/nuovo");

    // E soprattutto: nessuna riga scritta. Non "il messaggio dice che non si
    // salva", ma il database non ha nessun esercizio con questo titolo.
    const esercizioRottoCount = await prisma.esercizio.count({ where: { title: ESERCIZIO_ROTTO.titolo } });
    expect(esercizioRottoCount).toBe(0);
  });
});
