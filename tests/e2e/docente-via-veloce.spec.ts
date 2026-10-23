/**
 * E2E — La via veloce: assegnare in una schermata sola (Task 6, docente-via-
 * veloce; riscritta nel Task 7 del Nuovo compito)
 *
 * Copre il motivo per cui l'intero programma esiste (design doc,
 * `docs/superpowers/specs/2026-09-09-docente-via-veloce-design.md`): prima
 * di questo lavoro un docente che voleva "dieci equazioni alla 2A entro
 * venerdì" doveva dichiarare la classe, scrivere o raccogliere esercizi,
 * metterli in un Contenitore, comporli in una Batteria, e SOLO ALLORA
 * assegnarla — cinque schermate travestite da scelta. Questa prova dimostra
 * che il percorso è uno solo: dalla Panoramica, "Nuovo compito"; lì classe,
 * un blocco "argomento" con quanti esercizi, entro quando — sulla stessa
 * pagina, senza passare né da una raccolta né da un modello — e che lo
 * studente li vede davvero dall'altra parte.
 *
 * Fino al Task 7 del Nuovo compito questa strada era il modulo
 * `AssegnaForm` in cima alla Panoramica (rotta `compiti/diretto`): tolto,
 * la Panoramica porta con un grande link alla pagina Nuovo compito, l'unico
 * posto dove si dà un compito (spec 2026-10-22).
 *
 * L'ASSERZIONE CHE PORTA IL TASK (brief): l'intera composizione avviene su
 * UNA schermata sola. Non basta "non ho cliccato un link verso
 * /contenitori": bisogna dimostrarlo strutturalmente. Qui lo si fa in due
 * modi indipendenti, entrambi verificati fino al clic su "Assegna":
 *  1. l'URL del browser resta quello del Nuovo compito (nessuna
 *     `page.goto`, nessun clic su un link) fino all'arrivo sul compito
 *     appena assegnato;
 *  2. l'insieme delle richieste HTTP verso `/api/esercizi/*` osservate in
 *     quella finestra non include mai `contenitori`, `batterie` o
 *     `modelli`, e l'unica scrittura è la POST di `/api/esercizi/compiti`
 *     (le POST di `/compiti/estrai` sono il riepilogo, che non scrive).
 *     La batteria automatica del compito nasce dentro quella stessa rotta
 *     (`assegnaCompito`, compiti.ts), mai da un secondo giro HTTP.
 *
 * SECONDA ASSERZIONE (brief): chiedere più esercizi di quanti ne esistano
 * viene rifiutato con ENTRAMBI i numeri — non un errore generico. Nel Nuovo
 * compito il rifiuto arriva prima di assegnare: il riepilogo segna il
 * blocco ("ne chiedi 11, ce ne sono 10") e "Assegna" resta disabilitato,
 * quindi nessuna POST di assegnazione parte e nessuna batteria nasce.
 *
 * Perché un argomento con prefisso RUN_ID, non "prova"
 * -------------------------------------------------------
 * A differenza di un Contenitore — un elenco esplicito di id — una regola a
 * filtro (`bacinoRegola`, batterie.ts) interroga l'INTERA tabella
 * `Esercizio` su `topic` (+ `yearLevel` esatto). Il database di sviluppo
 * condiviso porta già 16 esercizi con l'argomento "prova" — la convenzione
 * di quasi ogni fixture di questo repository — quindi filtrare su "prova" pescherebbe in silenzio righe mai
 * create da questa esecuzione, e il conteggio "10 disponibili" atteso più
 * sotto non sarebbe più garantito. L'argomento qui (`ARGOMENTO`) porta
 * `RUN_ID`: nessun'altra riga nel database, di questa esecuzione o di una
 * precedente mai ripulita, può condividerlo.
 *
 * Il conteggio è una fotografia, non un totale
 * ----------------------------------------------
 * Il conteggio accanto all'argomento (`argomentiDisponibili`) legge lo stato
 * del database nell'istante in cui il docente sceglie, non un valore
 * fissato una volta per tutte (design doc, "Rischi accettati": "il
 * conteggio... è una fotografia"). Le asserzioni qui sotto non assumono mai
 * un totale astratto ("il numero di esercizi con questo argomento"): quel
 * numero, per costruzione, è ESATTAMENTE quanti questa esecuzione ne ha
 * creati (10, `QUANTI_CREATI`), perché `ARGOMENTO` è unico per questa
 * esecuzione — nessuna riga concorrente di un'altra esecuzione può mai
 * aggiungersi o togliersi da quell'insieme.
 *
 * Perché gli esercizi si scrivono a mano con Prisma, non dall'editor vero
 * --------------------------------------------------------------------------
 * Esiste una rotta per creare un esercizio (`POST /api/esercizi/redazione`,
 * dietro l'editor ricco — variabili, parti, LaTeX). Usarla per produrre
 * dieci esercizi usa e getta, il cui unico scopo è avere un argomento e un
 * anno su cui filtrare, testerebbe l'editor — già coperto altrove
 * (`esercizi-editor.spec.ts`) — non l'assegnazione. `Esercizio` e
 * `EsercizioVersione` si scrivono direttamente, con `content: {}`: una
 * versione c'è (è quello che serve per contare come "disponibile"), e il
 * riepilogo del Nuovo compito ne mostra solo i titoli — nessuno apre né
 * corregge quel contenuto vuoto. Lo studente non apre né
 * svolge nessuno di questi esercizi (il brief chiede solo che li VEDA):
 * `esercizi-compiti.spec.ts` (il modello di questa prova) copre già lo
 * svolgimento vero, con gli esercizi reali del bacino condiviso.
 *
 * Perché l'insegnamento della classe si scrive a mano, non dal form
 * ----------------------------------------------------------------------
 * `ClasseDocente` ha una rotta vera (pagina "Le mie classi",
 * `dichiaraInsegnamento`) — a differenza di `Classe` stessa, per cui NESSUNA
 * rotta esiste (solo Google o scrittura diretta, vedi il commento di testa
 * di `esercizi-compiti.spec.ts`). Ma dichiarare l'insegnamento è un
 * PRESUPPOSTO di questa prova, non la cosa che sta dimostrando — è già
 * verificato da solo in `esercizi-compiti.spec.ts` (il docente spunta la
 * casella, salva, ricarica, la trova ancora spuntata). Passare da quel form
 * qui aggiungerebbe una pagina in più all'inizio di OGNI esecuzione senza
 * rendere più vera l'asserzione che conta: che l'ASSEGNAZIONE — una volta
 * che classe e argomento esistono — sta su una schermata sola. La riga
 * `ClasseDocente` si scrive con Prisma, esattamente come `Classe` e
 * `ClasseStudente` nel modello: un docente che insegna già una classe reale
 * (`docente@scuola.it` insegna "2SIA4.0") non perde nulla, perché questa
 * prova AGGIUNGE una riga con la propria `classeId` (univoca per
 * `RUN_ID`), non sostituisce l'elenco.
 *
 * Database condiviso con l'ambiente di sviluppo del committente
 * ---------------------------------------------------------------
 * Stessa disciplina del modello: `RUN_ID` (timestamp + numero casuale) in
 * ogni nome/argomento/email creato da questa prova, nessuna pulizia PRIMA
 * di partire, pulizia in `afterAll` per riga o relazione precisa (mai un
 * `deleteMany()` su una tabella intera — ogni filtro qui sotto è ristretto
 * a id o a `RUN_ID`), e ripetibilità garantita dall'unicità di `RUN_ID`
 * anche contro un database già sporco di run precedenti mai ripulite.
 *
 * Pre-requisiti
 * -------------
 *  - Il server di sviluppo del worktree deve già essere in esecuzione
 *    (vedi `playwright.config.ts`, porta 3100), con `docente@scuola.it` e
 *    `studente@scuola.it` seminati da `prisma/seed.ts`.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

test.use({ locale: "it-IT" });

const TEACHER_EMAIL = "docente@scuola.it";
const STUDENT_EMAIL = "studente@scuola.it";

const RUN_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const CLASSE_EMAIL = `e2e-viaveloce-${RUN_ID}@scuola.it`;
const CLASSE_NOME = `E2E Via Veloce Classe ${RUN_ID}`;
// L'argomento raggiunge sia `Esercizio.topic` (scrittura) sia la voce del
// menu "+ Aggiungi da un argomento" (lettura): stessa stringa, mai
// normalizzata nel mezzo (vedi il commento su `argomentiDisponibili` in
// batterie.ts — grafie diverse restano voci diverse).
const ARGOMENTO = `E2E Via Veloce ${RUN_ID}`;
const ANNO = 2; // La classe porta questo stesso anno: gli argomenti del
// menu sono quelli del suo anno (design doc: "preso dalla classe, non
// chiesto").
const QUANTI_CREATI = 10; // "dieci esercizi" — esattamente il numero del brief.

let prisma: PrismaClient;
let classeId: string;
const esercizioIds: string[] = [];

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

  // Scaffolding di dominio scritto a mano (vedi il commento in testa al
  // file): la classe e l'insegnamento, come nel modello — nessuna rotta
  // crea una `Classe` senza Google. `yearLevel` fisso: senza anno il menu
  // degli argomenti non si apre, e questa prova non deve testare quel ramo
  // secondario.
  const classe = await prisma.classe.create({
    data: { googleGroupEmail: CLASSE_EMAIL, name: CLASSE_NOME, yearLevel: ANNO },
  });
  classeId = classe.id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: teacher.id } });
  await prisma.classeStudente.create({ data: { classeId, studentId: student.id } });

  // Dieci esercizi reali nel database (non nel filesystem — vedi il
  // commento in testa al file su perché non passano dall'editor), tutti
  // con lo stesso ARGOMENTO e lo stesso ANNO: esattamente il bacino che il
  // blocco "argomento" del Nuovo compito deve trovare e contare.
  for (let i = 1; i <= QUANTI_CREATI; i++) {
    const esercizio = await prisma.esercizio.create({
      data: {
        title: `${ARGOMENTO} — esercizio ${i}`,
        yearLevel: ANNO,
        topic: ARGOMENTO,
        tags: [],
        difficulty: 2,
      },
    });
    esercizioIds.push(esercizio.id);
    await prisma.esercizioVersione.create({
      data: { esercizioId: esercizio.id, version: 1, content: {}, hash: `e2e-viaveloce-${RUN_ID}-${i}` },
    });
  }
});

test.afterAll(async () => {
  // Pulizia per riga/relazione precisa — mai un deleteMany su tabella
  // intera (vedi il commento in testa al file).
  if (classeId) {
    const compiti = await prisma.compito.findMany({ where: { classeId }, select: { id: true, batteriaId: true } });
    const compitoIds = compiti.map((c) => c.id);
    const batteriaIds = [...new Set(compiti.map((c) => c.batteriaId))];
    if (compitoIds.length > 0) {
      await prisma.tentativo.deleteMany({ where: { compitoId: { in: compitoIds } } });
      await prisma.compito.deleteMany({ where: { id: { in: compitoIds } } });
    }
    // La batteria AUTOMATICA che l'assegnazione ha creato per il compito
    // riuscito (Test 1): il Test 2 non assegna niente (il riepilogo blocca
    // prima), quindi qui resta al più UNA batteria, quella del compito
    // appena cancellato sopra (il vincolo `onDelete: Restrict` da `Compito`
    // a `Batteria` è già libero, essendo stato cancellato lui per primo).
    if (batteriaIds.length > 0) {
      await prisma.batteriaRegola.deleteMany({ where: { batteriaId: { in: batteriaIds } } });
      await prisma.batteria.deleteMany({ where: { id: { in: batteriaIds } } });
    }
    await prisma.classeDocente.deleteMany({ where: { classeId } });
    await prisma.classeStudente.deleteMany({ where: { classeId } });
    await prisma.classe.delete({ where: { id: classeId } }).catch(() => {});
  }

  if (esercizioIds.length > 0) {
    await prisma.esercizioVersione.deleteMany({ where: { esercizioId: { in: esercizioIds } } });
    await prisma.esercizio.deleteMany({ where: { id: { in: esercizioIds } } });
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

// Stessa guardia di `esercizi-compiti.spec.ts` (vedi il suo commento esteso):
// il server di sviluppo (Turbopack) manda al browser una SECONDA navigazione
// automatica poco dopo il caricamento di una pagina, che azzera lo stato
// React nel mezzo se non se ne aspetta la fine.
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

test.describe("Via veloce — assegnare in una schermata sola", () => {
  test("il docente assegna dieci esercizi di un argomento alla classe, con una scadenza, senza toccare raccolte né modelli — e lo studente li vede", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await login(page, TEACHER_EMAIL);

    // === La prova di rete: cosa raggiunge l'API durante l'intera
    // assegnazione (vedi il commento in testa al file, punto 2) ===
    const chiamateApi: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.pathname.startsWith("/api/esercizi/")) {
        chiamateApi.push(`${req.method()} ${url.pathname}`);
      }
    });

    // === Dalla Panoramica, il grande link "Nuovo compito" ===
    await gotoStabile(page, "/dashboard/esercizi");
    // Nessun modulo sulla Panoramica: c'è solo il link.
    await expect(page.locator("#assegna-classe")).toHaveCount(0);
    // Il link della carta (titolo e riga che spiega le tre zone), non la
    // voce omonima del menu laterale.
    await page.getByRole("link", { name: /^Nuovo compito\s*Per chi/ }).click();
    await page.waitForURL(/\/dashboard\/esercizi\/compiti\/nuovo$/, { timeout: 15_000 });
    await attendiEventualeReload(page);
    const urlNuovo = new URL(page.url()).pathname;

    // === Classe (per id: nessuna ambiguità col nome) ===
    await expect(page.locator("#nc-classe")).toBeVisible({ timeout: 20_000 });
    await page.locator("#nc-classe").selectOption(classeId);

    // === Un blocco "argomento": la voce porta il conteggio, la fotografia
    // (vedi il commento in testa al file) — con ARGOMENTO unico per questa
    // esecuzione, deve valere esattamente QUANTI_CREATI ===
    await page.getByRole("button", { name: "+ Aggiungi da un argomento", exact: true }).click();
    await page.getByRole("button", { name: `${ARGOMENTO} — ${QUANTI_CREATI} disponibili`, exact: true }).click();

    // === Quanti esercizi, ed entro quando (scadenza — il brief la vuole
    // esplicitamente) ===
    await page.getByRole("spinbutton", { name: `Quanti esercizi prendere da ${ARGOMENTO}` }).fill(String(QUANTI_CREATI));
    const scadenza = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator("#nc-scadenza").fill(scadenza);
    await expect(page.getByText(`Ogni studente riceverà ${QUANTI_CREATI} esercizi.`)).toBeVisible({ timeout: 15_000 });

    // 1) Fino a qui l'URL non si è mai mosso dal Nuovo compito.
    expect(new URL(page.url()).pathname).toBe(urlNuovo);

    const assegnazioneInviata = page.waitForResponse((r) => {
      const url = new URL(r.url());
      return url.pathname === "/api/esercizi/compiti" && r.request().method() === "POST";
    });
    await page.getByRole("button", { name: `Assegna a ${CLASSE_NOME}`, exact: true }).click();
    const rispostaAssegnazione = await assegnazioneInviata;
    expect(rispostaAssegnazione.status()).toBe(201);
    // Assegnato, si arriva al compito appena dato.
    await page.waitForURL(/\/dashboard\/esercizi\/compiti\/(?!nuovo)[^/?]+$/, { timeout: 15_000 });

    // 2) Nessuna richiesta verso raccolte, batterie o modelli è mai partita
    // — non "non l'ho cliccato", ma "nessuna chiamata di rete li ha mai
    // raggiunti" (copre anche un prefetch automatico dei <Link>). E l'unica
    // scrittura osservata è stata quella vera, una volta sola: le POST di
    // `/compiti/estrai` sono il riepilogo, che non scrive niente.
    const percorsiVietati = chiamateApi.filter((c) => /\/api\/esercizi\/(contenitori|batterie|modelli)\b/.test(c));
    expect(percorsiVietati).toEqual([]);
    expect(chiamateApi.filter((c) => c.startsWith("POST") && c !== "POST /api/esercizi/compiti/estrai")).toEqual([
      "POST /api/esercizi/compiti",
    ]);

    // === Lo studente entra e vede il compito, con tutti e dieci gli
    // esercizi e la scadenza — senza averne svolto nessuno ===
    await page.context().clearCookies();
    await login(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");

    // Il nome del compito, per lo studente, è quello che il Nuovo compito
    // genera: l'etichetta del blocco e quanti (`nomeDelCompito`,
    // compiti.ts) — non un nome che questa prova sceglie. Se cambia, è QUI
    // che va aggiornato, e questa prova è ciò che se ne accorge.
    const compitoCard = page.locator("li", { hasText: `${ARGOMENTO} (${QUANTI_CREATI})` });
    await expect(compitoCard).toBeVisible({ timeout: 20_000 });
    await expect(compitoCard.getByText(`0 su ${QUANTI_CREATI} esercizi completati`)).toBeVisible();
    // Una scadenza reale, non "Nessuna scadenza": la seconda metà del
    // brief ("con una scadenza") arrivata fino allo studente.
    await expect(compitoCard.getByText(/^Scade il /)).toBeVisible();
    // Tutti e dieci, non nove né undici: i link agli esercizi pescati.
    await expect(compitoCard.locator('a[href*="/studente/esercizio/"]')).toHaveCount(QUANTI_CREATI);
  });

  test("chiedere più esercizi di quanti ne esistano è segnato con entrambi i numeri, e non si può assegnare", async ({
    page,
  }) => {
    await login(page, TEACHER_EMAIL);

    const scritture: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (req.method() === "POST" && url.pathname === "/api/esercizi/compiti") scritture.push(url.pathname);
    });

    // Classe e argomento arrivano già dall'indirizzo, come da "Assegna
    // questo argomento" nel catalogo: il blocco c'è, con cinque esercizi.
    await gotoStabile(
      page,
      `/dashboard/esercizi/compiti/nuovo?classe=${encodeURIComponent(classeId)}&argomento=${encodeURIComponent(ARGOMENTO)}`,
    );
    const quanti = page.getByRole("spinbutton", { name: `Quanti esercizi prendere da ${ARGOMENTO}` });
    await expect(quanti).toHaveValue("5", { timeout: 20_000 });

    // Uno in più di quanti questa esecuzione ne abbia creati per questo
    // argomento — non un numero a caso: QUANTI_CREATI è il totale del
    // nostro argomento, unico per questa esecuzione.
    const richiesti = QUANTI_CREATI + 1;
    await quanti.fill(String(richiesti));

    // La stringa esatta che il docente legge: entrambi i numeri, non un
    // errore generico che li perderebbe.
    await expect(page.getByText(`${ARGOMENTO}: ne chiedi ${richiesti}, ce ne sono ${QUANTI_CREATI}`, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: `Assegna a ${CLASSE_NOME}`, exact: true })).toBeDisabled();

    // Nessuna assegnazione tentata, quindi nessun compito e nessuna
    // batteria nuova: la pulizia di questo file in `afterAll` non deve
    // trovare più di UNA batteria automatica per questo argomento (quella
    // del primo test, riuscito).
    expect(scritture).toEqual([]);
    const batterieResidue = await prisma.batteria.findMany({
      where: { name: `${ARGOMENTO} (${QUANTI_CREATI})` },
      select: { id: true },
    });
    expect(batterieResidue.length).toBe(1);
  });
});
