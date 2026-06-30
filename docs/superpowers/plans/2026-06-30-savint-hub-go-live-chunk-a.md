# SAVINT Hub Go-Live — Chunk A (codice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completare i pochi ritocchi di codice che restano per il go-live dell'hub: mostrare il pulsante "Pubblica" nell'editor, fornire uno script per registrare le installazioni, e rendere il `Dockerfile` capace di buildare la variante `/demo`.

**Architecture:** Tre interventi indipendenti e piccoli. A1 (basePath da env) e A2 (home hub) del design erano già implementati: questo piano copre solo A3, A4, A5. Nessuna nuova dipendenza.

**Tech Stack:** Next.js 16, React 19, Prisma 6 (PostgreSQL), bcryptjs, Vitest 3, Docker (node:20-bookworm-slim).

## Global Constraints

- **Node 20**, **Next 16**, **Prisma 6** — versioni esistenti, non aggiornarle.
- **Hash secret**: usare SEMPRE `hashPassword`/`verifyPassword` da `src/lib/auth/password.ts` (bcrypt, cost 12). Mai bcrypt diretto.
- **Random**: usare `randomBytes` da `crypto` (pattern già in uso in `src/lib/hub/*`).
- **Default invariato**: nel `Dockerfile`, `BASE_PATH` di default `""` e `NEXT_PUBLIC_DEMO_MODE` di default `true`, così l'immagine pubblica `:latest` (usata dalle scuole) resta identica a oggi.
- **Test**: girano con `npm run test:run` (Vitest) contro un PostgreSQL di test reale (i test dell'hub usano `prisma` reale con cleanup). Setup in `tests/setup.ts`.
- **Commit**: stile conventional; chiudere il messaggio con il trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Già fatto (non rifare)**: A1 basePath (`src/lib/base-path.ts` + consumatori) e A2 home hub (`src/components/hub/hub-landing.tsx`).

---

### Task A4: Script `register-installation`

Crea uno script che genera `clientId`/`clientSecret` per una scuola, ne salva l'hash e stampa le credenziali una sola volta. È la parte "provisioning manuale" decisa nel design (§4).

**Files:**
- Create: `scripts/register-installation.ts`
- Test: `scripts/__tests__/register-installation.test.ts`

**Interfaces:**
- Consumes: `hashPassword` da `src/lib/auth/password.ts`; `prisma` da `src/lib/db/client`; `randomBytes` da `crypto`.
- Produces: `registerInstallation(input: { name: string; contactEmail: string }): Promise<{ id: string; clientId: string; clientSecret: string }>` — crea un record `Installation` e ritorna le credenziali in chiaro (il secret NON è recuperabile dopo).

- [ ] **Step 1: Scrivi il test che fallisce**

```ts
// scripts/__tests__/register-installation.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { registerInstallation } from "../register-installation";

const createdIds: string[] = [];

afterEach(async () => {
  if (createdIds.length) {
    await prisma.installation.deleteMany({ where: { id: { in: createdIds } } });
    createdIds.length = 0;
  }
});

describe("registerInstallation", () => {
  it("crea un'Installation e ritorna un secret che verifica contro l'hash salvato", async () => {
    const res = await registerInstallation({
      name: "Test School",
      contactEmail: "IT@Test.School",
    });
    createdIds.push(res.id);

    expect(res.clientId).toMatch(/^inst_[0-9a-f]{32}$/);
    expect(res.clientSecret.length).toBeGreaterThanOrEqual(32);

    const row = await prisma.installation.findUnique({ where: { id: res.id } });
    expect(row).not.toBeNull();
    expect(row!.clientId).toBe(res.clientId);
    expect(row!.name).toBe("Test School");
    expect(row!.contactEmail).toBe("it@test.school"); // normalizzato lowercase
    expect(await verifyPassword(res.clientSecret, row!.clientSecretHash)).toBe(true);
    expect(await verifyPassword("wrong", row!.clientSecretHash)).toBe(false);
  });

  it("rifiuta name o email mancanti", async () => {
    await expect(registerInstallation({ name: "", contactEmail: "a@b.c" })).rejects.toThrow();
    await expect(registerInstallation({ name: "X", contactEmail: "" })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Esegui il test per vederlo fallire**

Run: `npx vitest run scripts/__tests__/register-installation.test.ts`
Expected: FAIL — `Cannot find module '../register-installation'` (il file non esiste ancora).

- [ ] **Step 3: Scrivi l'implementazione minima**

```ts
// scripts/register-installation.ts
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";

/**
 * Registra una nuova installazione (scuola) sull'hub: genera clientId/clientSecret
 * OAuth, salva l'hash del secret, e ritorna le credenziali in chiaro.
 * Il clientSecret NON è recuperabile dopo: va consegnato subito alla scuola.
 */
export async function registerInstallation(input: {
  name: string;
  contactEmail: string;
}): Promise<{ id: string; clientId: string; clientSecret: string }> {
  const name = input.name?.trim();
  const contactEmail = input.contactEmail?.trim().toLowerCase();
  if (!name) throw new Error("name is required");
  if (!contactEmail) throw new Error("contactEmail is required");

  const clientId = `inst_${randomBytes(16).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const clientSecretHash = await hashPassword(clientSecret);

  const inst = await prisma.installation.create({
    data: { name, contactEmail, clientId, clientSecretHash },
  });
  return { id: inst.id, clientId, clientSecret };
}

async function main() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const name = get("--name");
  const contactEmail = get("--email");
  if (!name || !contactEmail) {
    // eslint-disable-next-line no-console
    console.error(
      'Usage: tsx scripts/register-installation.ts --name "<scuola>" --email <contatto>',
    );
    process.exit(1);
  }
  const res = await registerInstallation({ name, contactEmail });
  // eslint-disable-next-line no-console
  console.log("Installation creata. Metti queste credenziali nel .env della scuola:");
  // eslint-disable-next-line no-console
  console.log(`HUB_OAUTH_CLIENT_ID=${res.clientId}`);
  // eslint-disable-next-line no-console
  console.log(`HUB_OAUTH_CLIENT_SECRET=${res.clientSecret}`);
  // eslint-disable-next-line no-console
  console.log("(Il secret NON sarà più mostrato: salvalo ora.)");
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
}
```

- [ ] **Step 4: Esegui il test per vederlo passare**

Run: `npx vitest run scripts/__tests__/register-installation.test.ts`
Expected: PASS (2 test). Richiede `DATABASE_URL` verso il DB di test con le migrazioni applicate (come per gli altri test dell'hub).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore.

- [ ] **Step 6: Commit**

```bash
git add scripts/register-installation.ts scripts/__tests__/register-installation.test.ts
git commit -m "feat(hub): script register-installation per il provisioning manuale delle scuole" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A3: Cablare il pulsante "Pubblica" nell'editor

Le pagine editor non passano `hubEnabled`/`hubLink` a `QuizEditor`, quindi `PublishButton` (`if (!hubEnabled) return null`) non si disegna mai. Il pulsante compare solo per quiz esistenti (`initialData?.id`), quindi basta cablare la pagina di **modifica**.

**Files:**
- Modify: `src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx`

**Interfaces:**
- Consumes: `hasHubOAuthConfig()` da `src/lib/hub/oauth-config` (true se `HUB_OAUTH_CLIENT_ID` + `HUB_OAUTH_CLIENT_SECRET` + `SAVINT_HUB_URL` sono presenti a runtime); `prisma.hubLink`.
- Produces: niente di nuovo. `QuizEditor` accetta già `hubEnabled?: boolean` e `hubLink?: { hubAccountEmail: string } | null` (vedi `src/components/quiz/quiz-editor.tsx:39-40`).

> Nota di test: questa è una modifica di wiring in un **server component** (usa `auth()` + `prisma`), per cui non c'è uno unit test sensato nel pattern del repo (le pagine editor non hanno test). La logica di rendering del bottone è già coperta da `src/components/quiz/__tests__/quiz-editor.publish-button.test.tsx`. Verifica quindi via typecheck + quel test esistente + smoke manuale.

- [ ] **Step 1: Conferma la copertura esistente del componente**

Run: `npx vitest run src/components/quiz/__tests__/quiz-editor.publish-button.test.tsx`
Expected: PASS — conferma che con `hubEnabled` true il bottone si renderizza (comportamento che stiamo per attivare dalla pagina).

- [ ] **Step 2: Aggiungi l'import di `hasHubOAuthConfig`**

In `src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx`, dopo gli import esistenti, aggiungi:

```ts
import { hasHubOAuthConfig } from "@/lib/hub/oauth-config";
```

- [ ] **Step 3: Carica l'eventuale HubLink dell'utente e passalo a QuizEditor**

Sostituisci il blocco finale della funzione (dal calcolo di `hasConsent` al `return`):

```ts
  const hasConsent = !!(await prisma.consent.findFirst({
    where: { userId: session.user.id, type: "QUIZ_PUBLISH_DECLARATION" },
  }));

  const hubLink = await prisma.hubLink.findUnique({
    where: { userId: session.user.id },
    select: { hubAccountEmail: true },
  });

  return (
    <QuizEditor
      initialData={initialData}
      hasConsent={hasConsent}
      hubEnabled={hasHubOAuthConfig()}
      hubLink={hubLink}
    />
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: nessun errore (`hubLink` è `{ hubAccountEmail: string } | null`, combacia con il tipo del prop).

- [ ] **Step 5: Lint del file modificato**

Run: `npx eslint "src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx"`
Expected: nessun NUOVO errore introdotto dalla modifica.

- [ ] **Step 6: Commit**

```bash
git add "src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx"
git commit -m "feat(hub): mostra il pulsante Pubblica nell'editor quando l'hub e' configurato" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task A5: Build-arg `BASE_PATH` nel Dockerfile

Per buildare la variante `/demo` serve passare `BASE_PATH=/demo` al `next build` (è build-time). Oggi il `Dockerfile` non lo accetta. Esponiamo `BASE_PATH`, `NEXT_PUBLIC_DEMO_MODE` e `NEXT_PUBLIC_SAVINT_HUB_URL` come `ARG`, con default che lasciano `:latest` invariato.

**Files:**
- Modify: `docker/Dockerfile` (stage `build`)

**Interfaces:**
- Produces: l'immagine accetta `--build-arg BASE_PATH=/demo`, `--build-arg NEXT_PUBLIC_DEMO_MODE=false`, `--build-arg NEXT_PUBLIC_SAVINT_HUB_URL=https://savint.it`. Default: `BASE_PATH=""`, `NEXT_PUBLIC_DEMO_MODE=true`, `NEXT_PUBLIC_SAVINT_HUB_URL=""` (= comportamento attuale).

> Nota di test: un `Dockerfile` non ha unit test. La verifica è una build reale con build-arg e un controllo che il `basePath` sia stato applicato.

- [ ] **Step 1: Aggiorna lo stage build**

In `docker/Dockerfile`, sostituisci il blocco delle variabili fittizie (le righe `ENV DATABASE_URL=... NEXT_PUBLIC_DEMO_MODE=true`) con:

```dockerfile
# Variabili fittizie: prisma generate e next build non devono raggiungere un DB reale
# Build-arg per le varianti: hub (BASE_PATH=""), demo (BASE_PATH=/demo), scuola (default)
ARG BASE_PATH=""
ARG NEXT_PUBLIC_DEMO_MODE=true
ARG NEXT_PUBLIC_SAVINT_HUB_URL=""
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    NEXTAUTH_SECRET=build-only-secret \
    AUTH_TRUST_HOST=true \
    BASE_PATH=$BASE_PATH \
    NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
    NEXT_PUBLIC_SAVINT_HUB_URL=$NEXT_PUBLIC_SAVINT_HUB_URL
```

- [ ] **Step 2: Verifica build default invariata (BASE_PATH vuoto)**

Run: `docker build -f docker/Dockerfile -t savint-test-root --target build .`
Expected: build OK. (Il `next build` gira con `BASE_PATH=""` → app sulla radice, come `:latest` oggi.)

- [ ] **Step 3: Verifica build variante demo**

Run: `docker build -f docker/Dockerfile -t savint-test-demo --build-arg BASE_PATH=/demo --target build .`
Expected: build OK. Conferma che il basePath sia stato applicato:

Run: `docker run --rm savint-test-demo sh -c 'grep -rl "/demo/_next" .next/ | head -1'`
Expected: almeno un file di build referenzia `/demo/_next` (il basePath è compilato dentro).

- [ ] **Step 4: Commit**

```bash
git add docker/Dockerfile
git commit -m "build(docker): build-arg BASE_PATH/NEXT_PUBLIC_* per le varianti hub e demo" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Note di esecuzione

- Le tre task sono indipendenti: ordine consigliato A4 → A3 → A5, ma qualunque ordine va.
- Dopo i commit, il push su `main` farà ripartire la CI (`docker-publish.yml`) e pubblicherà la nuova `:latest` (con A3 incluso). A5 abilita le build hub/demo ma non cambia `:latest`.
- A questo punto si passa al **Chunk B (deploy)**, che è un runbook a mano (hub su `savint.it/`, demo su `/demo` col DB attuale ripristinato), non coperto da questo piano.

## Self-review (coverage vs spec)

- Spec A1 → già implementato (verificato), fuori dal piano. ✅
- Spec A2 → già implementato (verificato), fuori dal piano. ✅
- Spec A3 (pulsante Pubblica) → Task A3. ✅
- Spec A4 (register-installation) → Task A4. ✅
- Spec A5 (build-arg Dockerfile) → Task A5. ✅
- Decisione aperta #1 (immagine hub con `NEXT_PUBLIC_DEMO_MODE=false`): A5 rende il flag un build-arg → si decide al momento della build hub nel Chunk B.
