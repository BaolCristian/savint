/**
 * E2E — La via veloce: assegnare in una schermata sola (Task 6, docente-via-
 * veloce)
 *
 * Copre il motivo per cui l'intero programma esiste (design doc,
 * `docs/superpowers/specs/2026-09-09-docente-via-veloce-design.md`): prima
 * di questo lavoro un docente che voleva "dieci equazioni alla 2A entro
 * venerdì" doveva dichiarare la classe, scrivere o raccogliere esercizi,
 * metterli in un Contenitore, comporli in una Batteria, e SOLO ALLORA
 * assegnarla — cinque schermate travestite da scelta. Questa prova dimostra
 * che il percorso nuovo è uno solo: classe, argomento, quanti esercizi,
 * entro quando — sulla stessa pagina, senza passare né da una raccolta né
 * da una batteria — e che lo studente li vede davvero dall'altra parte.
 *
 * L'ASSERZIONE CHE PORTA IL TASK (brief): l'intero percorso avviene su UNA
 * schermata sola. Non basta "non ho cliccato un link verso /contenitori":
 * bisogna dimostrarlo strutturalmente. Qui lo si fa in due modi indipendenti,
 * entrambi verificati per tutta la durata dell'assegnazione:
 *  1. l'URL del browser non cambia mai (nessuna `page.goto`, nessun click su
 *     un link diverso da "Assegna" fra l'apertura della pagina e il "Compito
 *     assegnato.");
 *  2. l'insieme delle richieste HTTP verso `/api/esercizi/*` osservate in
 *     quella finestra non include mai `contenitori` o `batterie` — non solo
 *     "non li ho cliccati", ma "nessuna chiamata di rete li ha mai
 *     raggiunti", il che copre anche un eventuale prefetch automatico dei
 *     `<Link>` di Next.js verso le sezioni rimaste in fondo alla pagina
 *     (Task 4). La batteria automatica che `assegnaDiretto` crea per questa
 *     assegnazione (dominio, compiti.ts — vedi il suo commento) nasce da una
 *     chiamata Prisma diretta dentro la stessa route `/api/esercizi/compiti
 *     /diretto`, mai da un secondo giro HTTP verso `/api/esercizi/batterie`:
 *     la prova di rete la rende osservabile dall'esterno, non solo vera per
 *     costruzione.
 *
 * SECONDA ASSERZIONE (brief): chiedere più esercizi di quanti ne esistano
 * viene rifiutato con ENTRAMBI i numeri nel messaggio — non un errore
 * generico. `assegnaDiretto` (dominio) → la rotta (`/api/esercizi/compiti/
 * diretto`) → `AssegnaForm` (`messaggioErrore`) portano `dettaglio:
 * {contenitore, richiesti, disponibili}` attraverso tre livelli senza
 * perderlo: qui si verifica che sopravviva fino allo schermo, parola per
 * parola (stringa esatta, non solo "contiene i due numeri da qualche
 * parte").
 *
 * Perché un argomento con prefisso RUN_ID, non "prova"
 * -------------------------------------------------------
 * A differenza di un Contenitore — un elenco esplicito di id — una regola a
 * filtro (`bacinoRegola`, batterie.ts) interroga l'INTERA tabella
 * `Esercizio` su `topic` (+ `yearLevel` esatto). Il database di sviluppo
 * condiviso porta già 16 esercizi con l'argomento "prova" — la convenzione
 * di quasi ogni fixture di questo repository (vedi il commento omologo in
 * `assegna-diretto.test.ts`, l'integrazione di dominio più vicina a questa
 * prova) — quindi filtrare su "prova" pescherebbe in silenzio righe mai
 * create da questa esecuzione, e il conteggio "10 disponibili" atteso più
 * sotto non sarebbe più garantito. L'argomento qui (`ARGOMENTO`) porta
 * `RUN_ID`: nessun'altra riga nel database, di questa esecuzione o di una
 * precedente mai ripulita, può condividerlo.
 *
 * Il conteggio è una fotografia, non un totale
 * ----------------------------------------------
 * "Quanti esercizi corrispondono" (`quantiCorrispondono`) legge lo stato
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
 * (`esercizi-editor.spec.ts`) — non l'assegnazione. Stessa scelta già presa
 * da `assegna-diretto.test.ts` (integrazione di dominio) per lo stesso
 * identico motivo: `Esercizio` e `EsercizioVersione` scritti direttamente,
 * con `content: {}` — un contenuto Numbas vuoto che `daNumbas`
 * (`elencoRedazione`, chiamata dalla pagina `/dashboard/esercizi`) rifiuta
 * con un motivo ("l'esercizio non ha nessuna domanda al suo interno"),
 * MAI lanciando un'eccezione: la pagina si carica comunque, l'esercizio
 * compare comunque nell'elenco con `ultimaVersione: 1` (quello che serve
 * per contare come "disponibile" e per finire fra i `candidati`
 * dell'anteprima), semplicemente non è "modificabile" dall'editor — cosa
 * che questa prova non gli chiede mai di essere. Lo studente non apre né
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
// L'argomento raggiunge sia `Esercizio.topic` (scrittura) sia il valore
// dell'opzione nel `<select>` del modulo (lettura): stessa stringa, mai
// normalizzata nel mezzo (vedi il commento su `argomentiDisponibili` in
// batterie.ts — grafie diverse restano voci diverse).
const ARGOMENTO = `E2E Via Veloce ${RUN_ID}`;
const ANNO = 2; // La classe porta questo stesso anno: il campo "anno" del
// modulo non deve mai comparire (design doc: "preso dalla classe, non
// chiesto").
const QUANTI_CREATI = 10; // "dieci esercizi" — esattamente il numero del brief.

let prisma: PrismaClient;
let classeId: string;
let esercizioIds: string[] = [];

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
  // crea una `Classe` senza Google. `yearLevel` fisso: il modulo chiede
  // l'anno SOLO quando la classe non ne porta uno, e questa prova non
  // deve testare quel ramo secondario.
  const classe = await prisma.classe.create({
    data: { googleGroupEmail: CLASSE_EMAIL, name: CLASSE_NOME, yearLevel: ANNO },
  });
  classeId = classe.id;
  await prisma.classeDocente.create({ data: { classeId, teacherId: teacher.id } });
  await prisma.classeStudente.create({ data: { classeId, studentId: student.id } });

  // Dieci esercizi reali nel database (non nel filesystem — vedi il
  // commento in testa al file su perché non passano dall'editor), tutti
  // con lo stesso ARGOMENTO e lo stesso ANNO: esattamente il bacino che il
  // modulo di assegnazione diretta deve trovare e contare.
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
    // La batteria AUTOMATICA che `assegnaDiretto` ha creato per il compito
    // riuscito (Test 1): un tentativo rifiutato (Test 2, capienza
    // insufficiente) si pulisce già da sé dentro `assegnaDiretto` — vedi il
    // suo commento — quindi qui resta al più UNA batteria, quella del
    // compito appena cancellato sopra (il vincolo `onDelete: Restrict` da
    // `Compito` a `Batteria` è già libero, essendo stato cancellato lui per
    // primo).
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
  test("il docente assegna dieci esercizi di un argomento alla classe, con una scadenza, senza toccare raccolte né batterie — e lo studente li vede", async ({
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

    await gotoStabile(page, "/dashboard/esercizi");
    const urlPagina = new URL(page.url());
    expect(urlPagina.pathname).toBe("/dashboard/esercizi");

    // Il modulo (Task 5) è montato in cima alla pagina, non dietro un link:
    // se questa sezione non ci fosse la prova fallirebbe qui, non più
    // avanti — la stessa garanzia che il Task 5 si è dato da solo.
    await expect(page.locator("#assegna-classe")).toBeVisible({ timeout: 20_000 });

    // === Classe (per id: nessuna ambiguità col nome, niente normalizzato
    // da confrontare) ===
    await page.locator("#assegna-classe").selectOption(classeId);

    // === Argomento: aspetta che l'elenco (GET senza `argomento`) porti la
    // nostra voce prima di selezionarla — `selectOption` non aspetta che
    // un'opzione COMPAIA, solo che l'elemento sia azionabile ===
    const opzioneArgomento = page.locator(`#assegna-argomento option[value="${ARGOMENTO}"]`);
    await expect(opzioneArgomento).toBeAttached({ timeout: 15_000 });
    // Nessun campo "anno" in vista: la classe scelta porta già un anno
    // (design doc: "preso dalla classe, non chiesto").
    await expect(page.locator("#assegna-anno")).toHaveCount(0);
    await page.locator("#assegna-argomento").selectOption(ARGOMENTO);

    // === "Quanti esercizi corrispondono", la fotografia (vedi il commento
    // in testa al file): con ARGOMENTO unico per questa esecuzione, deve
    // valere esattamente QUANTI_CREATI — non un totale, il NOSTRO totale ===
    await expect(page.getByText(`${QUANTI_CREATI} esercizi disponibili`)).toBeVisible({ timeout: 10_000 });

    // === Quanti esercizi, ed entro quando (scadenza — il brief la vuole
    // esplicitamente) ===
    await page.locator("#assegna-quanti").fill(String(QUANTI_CREATI));
    const scadenza = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.locator("#assegna-scadenza").fill(scadenza);

    const assegnazioneInviata = page.waitForResponse(
      (r) => r.url().includes("/api/esercizi/compiti/diretto") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Assegna", exact: true }).click();
    const rispostaAssegnazione = await assegnazioneInviata;
    expect(rispostaAssegnazione.status()).toBe(201);
    await expect(page.getByText(/^compito assegnato\.$/i)).toBeVisible({ timeout: 10_000 });

    // === La prova che porta il task: UNA schermata sola ===
    // 1) l'URL non si è MAI mosso da /dashboard/esercizi durante l'intera
    // sequenza sopra (nessuna page.goto, nessun click su un link diverso da
    // "Assegna" prima di questo punto).
    expect(new URL(page.url()).pathname).toBe("/dashboard/esercizi");
    // 2) nessuna richiesta verso /api/esercizi/contenitori o
    // /api/esercizi/batterie è mai partita — non "non l'ho cliccato", ma
    // "nessuna chiamata di rete li ha mai raggiunti" (copre anche un
    // eventuale prefetch automatico dei <Link> verso quelle sezioni,
    // rimaste in fondo alla pagina dal Task 4).
    const percorsiVietati = chiamateApi.filter((c) => /\/api\/esercizi\/(contenitori|batterie)\b/.test(c));
    expect(percorsiVietati).toEqual([]);
    // E l'unica scrittura osservata è stata quella vera: la rotta della via
    // veloce, una volta sola.
    expect(chiamateApi.filter((c) => c.startsWith("POST"))).toEqual(["POST /api/esercizi/compiti/diretto"]);

    // === Lo studente entra e vede il compito, con tutti e dieci gli
    // esercizi e la scadenza — senza averne svolto nessuno ===
    await page.context().clearCookies();
    await login(page, STUDENT_EMAIL);
    await gotoStabile(page, "/studente");

    // Il nome del compito, per lo studente, è quello della batteria
    // automatica che `assegnaDiretto` ha generato: "Assegnazione diretta:
    // {argomento}" (compiti.ts) — non un nome che questa prova sceglie.
    const compitoCard = page.locator("li", { hasText: `Assegnazione diretta: ${ARGOMENTO}` });
    await expect(compitoCard).toBeVisible({ timeout: 20_000 });
    await expect(compitoCard.getByText(`0 su ${QUANTI_CREATI} esercizi completati`)).toBeVisible();
    // Una scadenza reale, non "Nessuna scadenza": la seconda metà del
    // brief ("con una scadenza") arrivata fino allo studente.
    await expect(compitoCard.getByText(/^Scade il /)).toBeVisible();
    // Tutti e dieci, non nove né undici: i link agli esercizi pescati.
    await expect(compitoCard.locator('a[href*="/studente/esercizio/"]')).toHaveCount(QUANTI_CREATI);
  });

  test("chiedere più esercizi di quanti ne esistano è rifiutato con entrambi i numeri nel messaggio", async ({
    page,
  }) => {
    await login(page, TEACHER_EMAIL);
    await gotoStabile(page, "/dashboard/esercizi");

    await page.locator("#assegna-classe").selectOption(classeId);
    const opzioneArgomento = page.locator(`#assegna-argomento option[value="${ARGOMENTO}"]`);
    await expect(opzioneArgomento).toBeAttached({ timeout: 15_000 });
    await page.locator("#assegna-argomento").selectOption(ARGOMENTO);
    await expect(page.getByText(`${QUANTI_CREATI} esercizi disponibili`)).toBeVisible({ timeout: 10_000 });

    // Uno in più di quanti questa esecuzione ne abbia creati per questo
    // argomento — non un numero a caso: QUANTI_CREATI è quello che il
    // conteggio appena verificato sopra dichiara disponibile.
    const richiesti = QUANTI_CREATI + 1;
    await page.locator("#assegna-quanti").fill(String(richiesti));

    const rispostaRifiutata = page.waitForResponse(
      (r) => r.url().includes("/api/esercizi/compiti/diretto") && r.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Assegna", exact: true }).click();
    const risposta = await rispostaRifiutata;
    expect(risposta.status()).toBe(409);
    const corpo = await risposta.json();
    // I due numeri, verificati anche nel corpo grezzo della risposta HTTP —
    // non solo nel testo che lo schermo mostra: la garanzia parte dal
    // dominio (`assegna`, compiti.ts), non da come il modulo la formatta.
    expect(corpo).toMatchObject({
      error: "esercizi_insufficienti",
      dettaglio: { contenitore: ARGOMENTO, richiesti, disponibili: QUANTI_CREATI },
    });

    // La stringa esatta che il docente legge: entrambi i numeri, non un
    // errore generico che li perderebbe (messaggioErrore, assegna-form.tsx).
    // Scoperto qui: Next.js porta un SECONDO elemento con `role="alert"` a
    // livello di root layout (`__next-route-announcer__`, per i lettori di
    // schermo sui cambi di rotta) — `getByRole("alert")` da solo è ambiguo.
    // Il nostro è dentro il `<form>` del modulo, l'unico su questa pagina.
    const messaggio = page.locator("form").getByRole("alert");
    await expect(messaggio).toBeVisible({ timeout: 10_000 });
    await expect(messaggio).toHaveText(
      `Per "${ARGOMENTO}" non ci sono abbastanza esercizi: richiesti ${richiesti}, disponibili ${QUANTI_CREATI}.`,
    );

    // Nessun compito creato da un tentativo rifiutato, e nessuna batteria
    // orfana lasciata indietro (Fix round 1 del Task 3, riverificato qui
    // dall'esterno): la pulizia di questo file in `afterAll` non deve
    // trovare più di UNA batteria automatica per questo run (quella del
    // primo test, riuscito).
    const batterieResidue = await prisma.batteria.findMany({
      where: { name: `Assegnazione diretta: ${ARGOMENTO}` },
      select: { id: true },
    });
    expect(batterieResidue.length).toBe(1);
  });
});
