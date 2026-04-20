/**
 * E2E — Quiz "test mode" (Task 11)
 *
 * Covers the full flow of the "Prova" button:
 *  1. Log in as docente@scuola.it via the dev Credentials form on /savint/login.
 *  2. Navigate to the library/dashboard and click "Prova" on the demo
 *     Geography quiz.
 *  3. Assert that we land on /savint/live/test/<id> with the expected banner
 *     and split-screen host/player panels.
 *  4. Start the game from the host panel (only the split-view's own host
 *     panel button — there's a matching button in both panels after the
 *     lobby, but player panel is "waiting").
 *  5. Answer the first question from the player panel.
 *  6. Assert the reveal UI appears in the player panel WITHOUT the host
 *     having to click "mostra risultati" (auto-advance in test mode, see
 *     Task 5).
 *  7. Navigate to /savint/dashboard/sessions and assert that this test
 *     session / the "Docente (test)" player is filtered out (Task 3).
 *
 * Pre-requisites
 * --------------
 *  - Postgres is up and `npx prisma db seed` has been run (user
 *    docente@scuola.it + a quiz titled "Quiz di Geografia - Capitali Europee"
 *    where the first question's correct answer is "Parigi"). The test
 *    setup below verifies the quiz is present and logs a warning if not —
 *    it does NOT re-seed automatically because the seed script uses
 *    `prisma.quiz.create` (not upsert) and would error on re-runs.
 *  - `NODE_ENV=development` or `DEMO_MODE=true` so the Credentials
 *    provider is enabled. `npm run dev` satisfies the former.
 *
 * Selectors worth noting (can drift)
 *  - The start button label comes from the i18n key `live.startQuiz`
 *    which is "Avvia Quiz (1 giocatore)" for a single player. We match
 *    loosely with /Avvia Quiz/i.
 *  - The feedback text is "Corretto!" or "Sbagliato!" (i18n keys
 *    live.correct / live.wrong). The match is case-insensitive and
 *    allows either.
 */
import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const TEACHER_EMAIL = "docente@scuola.it";
const DEMO_QUIZ_TITLE = "Quiz di Geografia - Capitali Europee";

test.describe("Quiz test mode", () => {
  test.beforeAll(async () => {
    const prisma = new PrismaClient();
    try {
      const teacher = await prisma.user.findUnique({
        where: { email: TEACHER_EMAIL },
      });
      if (!teacher) {
        throw new Error(
          `Seed missing: user ${TEACHER_EMAIL} not found. Run \`npx prisma db seed\`.`,
        );
      }
      const quiz = await prisma.quiz.findFirst({
        where: { authorId: teacher.id, title: DEMO_QUIZ_TITLE },
      });
      if (!quiz) {
        throw new Error(
          `Seed missing: quiz "${DEMO_QUIZ_TITLE}" not found for ${TEACHER_EMAIL}. Run \`npx prisma db seed\`.`,
        );
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  async function loginAsTeacher(page: Page) {
    await page.goto("/savint/login", { waitUntil: "domcontentloaded" });
    // Dev server first-compile can be slow; wait generously for the
    // credentials form to hydrate.
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 60_000 });
    await emailInput.fill(TEACHER_EMAIL);
    // Match the button regardless of locale: Italian "Entra come docente"
    // or English "Enter as teacher".
    await page
      .getByRole("button", { name: /entra come docente|enter as teacher/i })
      .click();
    await page.waitForURL(/\/savint\/dashboard/, { timeout: 30_000 });

  }

  async function dismissTermsModalIfPresent(page: Page) {
    // First-time users see a Terms acceptance modal (TermsGuard) that
    // overlays the UI. The backdrop uses `fixed inset-0 bg-black/60`.
    // The modal fetches /api/user/terms-status so it renders async —
    // give it a generous window to appear.
    const modal = page.locator("div.fixed.inset-0.bg-black\\/60").first();
    const modalAppeared = await modal
      .waitFor({ state: "visible", timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!modalAppeared) return;

    const termsCheckbox = modal.locator('input[type="checkbox"]').first();
    await termsCheckbox.check();
    const acceptBtn = modal
      .getByRole("button", { name: /^accetta$|^accept$/i })
      .first();
    await expect(acceptBtn).toBeEnabled({ timeout: 5_000 });
    await acceptBtn.click();
    await expect(modal).toBeHidden({ timeout: 10_000 });
  }

  test("teacher can run a quiz in test mode end-to-end", async ({ page }) => {
    test.setTimeout(180_000);

    // 1 & 2. Log in, land on the dashboard, then navigate to the
    //        quiz library where the cards (with "Prova") live.
    await loginAsTeacher(page);
    await dismissTermsModalIfPresent(page);
    await page.goto("/savint/dashboard/quiz");
    await dismissTermsModalIfPresent(page);

    // 3. Find the demo quiz card, click "Prova". The dashboard may
    //    render the quiz in multiple layouts (list/grid/mobile), so
    //    narrow by the heading and take the first matching Prova.
    const heading = page
      .getByRole("heading", { name: DEMO_QUIZ_TITLE })
      .first();
    await expect(heading).toBeVisible({ timeout: 15_000 });
    // The Prova button is in the same card as the heading. Walk up to
    // a card ancestor and scope the query to it.
    const card = heading.locator(
      "xpath=ancestor::*[.//button[normalize-space()='Prova']][1]",
    );
    await card.getByRole("button", { name: /^Prova$/ }).first().click();

    // 4. Assertions on the test-mode live page.
    await page.waitForURL(/\/savint\/live\/test\//, { timeout: 15_000 });
    await expect(page.getByText(/Modalità test/i)).toBeVisible();

    const hostPanel = page.getByRole("region", { name: "Host panel" });
    const playerPanel = page.getByRole("region", { name: "Player panel" });
    await expect(hostPanel).toBeVisible();
    await expect(playerPanel).toBeVisible();

    // 5. Player auto-joins as "Docente (test)". Wait until the host
    //    panel actually shows "1 giocatore" in the start button — the
    //    socket join is async.
    const startBtn = hostPanel.getByRole("button", {
      name: /Avvia Quiz|Start Quiz/i,
    });
    // The player auto-joins as "Docente (test)". The host button
    // starts as "Waiting for players..." and switches to
    // "Start Quiz (1 player)" once the socket sees the join.
    await expect(startBtn).toBeVisible({ timeout: 30_000 });
    await expect(startBtn).toBeEnabled({ timeout: 30_000 });

    await startBtn.click();

    // 6. Answer the first question. After the "Pronti, Partenza, Via!"
    //    countdown, the player panel shows the MC options. The first
    //    question is "Qual è la capitale della Francia?" — click
    //    "Parigi" (correct answer).
    const parigiBtn = playerPanel.getByRole("button", { name: /^Parigi$/ });
    await expect(parigiBtn).toBeVisible({ timeout: 20_000 });
    await parigiBtn.click();

    // 7. Reveal appears WITHOUT the host clicking "mostra risultati":
    //    the socket server auto-emits questionResult in test mode (T5).
    //    The player panel should display "Corretto!" (or "Sbagliato!",
    //    to be robust to future seed changes).
    await expect(
      playerPanel.getByText(/Corretto!|Sbagliato!|Correct!|Wrong!/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 8. The test session must NOT appear in the Sessions list.
    await page.goto("/savint/dashboard/sessions");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByText("Docente (test)")).toHaveCount(0);
    // And no card for this quiz should show up either — there are no
    // real sessions for docente in the seed. Match defensively: if
    // sessions do appear, none should link to a /live/test/ page.
    const sessionLinks = page.locator('a[href*="/dashboard/sessions/"]');
    const count = await sessionLinks.count();
    for (let i = 0; i < count; i++) {
      const href = await sessionLinks.nth(i).getAttribute("href");
      expect(href ?? "").not.toContain("/live/test/");
    }
  });
});
