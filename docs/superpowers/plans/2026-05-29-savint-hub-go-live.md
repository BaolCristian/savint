# SAVINT Go-Live (hub su savint.it + istanza /demo) — Piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mettere online `savint.it` come hub/repository pubblico sulla radice, con un'istanza "prova" su `savint.it/demo`, dismettendo `friulware.it/savint`.

**Architecture:** Stesso codice, due build/processi PM2: hub (`SAVINT_MODE=hub`, `BASE_PATH=""`, porta 3002) e demo (`SAVINT_MODE=installation` + `DEMO_MODE=true`, `BASE_PATH=/demo`, porta 3001). Il `basePath` `/savint` oggi cablato viene reso configurabile da una singola fonte (`BASE_PATH`). Si aggiunge una home page dedicata per la modalità hub. Database PostgreSQL separati per hub e demo.

**Tech Stack:** Next.js 16 (App Router, custom server), TypeScript, React 19, Tailwind 4, next-intl, NextAuth v5, Socket.io 4, Prisma 6 + PostgreSQL, Vitest, nginx + certbot + PM2.

**Spec di riferimento:** `docs/superpowers/specs/2026-05-29-savint-hub-go-live-design.md`

---

## Struttura dei file

**Fase 1 — basePath configurabile (codice)**
- Modifica: `src/lib/base-path.ts` — fonte unica di `BASE_PATH` da env, default vuoto.
- Modifica: `next.config.ts` — `basePath` da `process.env.BASE_PATH`.
- Modifica: `src/server.ts` — path Socket.io da `BASE_PATH`.
- Modifica: `src/lib/socket/client.ts` — path Socket.io da `BASE_PATH`.
- Modifica: `src/app/api/auth/[...nextauth]/route.ts` — basePath da env.
- Modifica: `src/lib/auth/config.ts:116` — basePath NextAuth da `BASE_PATH`.
- Modifica: `src/components/providers.tsx` — `SessionProvider` basePath da `BASE_PATH`.
- Modifica: redirect/callback cablati: `src/app/(hub)/hub-login/page.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/api/auth/logout/route.ts`, `src/app/api/hub/auth/verify/route.ts`, `src/app/(hub)/hub-register/actions.ts`, `src/app/(hub)/hub-forgot-password/actions.ts`, `src/app/(dashboard)/dashboard/sessions/page.tsx`.
- Test: `src/lib/__tests__/base-path.test.ts` (nuovo).

**Fase 2 — Home page hub**
- Modifica: `src/app/page.tsx` — ramifica per modalità.
- Crea: `src/components/hub/hub-landing.tsx` — landing curata.
- Modifica: `src/messages/it.json`, `src/messages/en.json` — namespace `hubHome`.
- Test: `src/app/__tests__/page.test.tsx` (nuovo).

**Fase 3 — Deploy / operatività**
- Crea: `deploy/nginx-savint.it.conf` (sostituisce la bozza esistente con la config a due location).
- Modifica: `update-server.sh` — due processi.
- Modifica: `DEPLOY-GUIDA.md` — due processi, dominio savint.it.
- Crea: `docs/INSTALLAZIONE-SCUOLA.md` — onboarding scuole (collegamento OAuth).
- Crea sul server (non nel repo): `/opt/savint-hub/.env`, `/opt/savint-demo/.env`.

---

## FASE 1 — basePath configurabile

### Task 1: Fonte unica di BASE_PATH

**Files:**
- Modify: `src/lib/base-path.ts`
- Test: `src/lib/__tests__/base-path.test.ts` (create)

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/lib/__tests__/base-path.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ORIGINAL_NEXT = process.env.__NEXT_ROUTER_BASEPATH;
const ORIGINAL_BASE = process.env.BASE_PATH;

async function loadFresh() {
  // base-path.ts calcola BASE_PATH a import-time: serve un import isolato.
  vi.resetModules();
  return await import("../base-path");
}

describe("base-path", () => {
  beforeEach(() => {
    delete process.env.__NEXT_ROUTER_BASEPATH;
    delete process.env.BASE_PATH;
  });
  afterEach(() => {
    if (ORIGINAL_NEXT === undefined) delete process.env.__NEXT_ROUTER_BASEPATH;
    else process.env.__NEXT_ROUTER_BASEPATH = ORIGINAL_NEXT;
    if (ORIGINAL_BASE === undefined) delete process.env.BASE_PATH;
    else process.env.BASE_PATH = ORIGINAL_BASE;
  });

  it("defaults to empty base path (root)", async () => {
    const { BASE_PATH, withBasePath } = await loadFresh();
    expect(BASE_PATH).toBe("");
    expect(withBasePath("/logo.png")).toBe("/logo.png");
  });

  it("uses __NEXT_ROUTER_BASEPATH when set", async () => {
    process.env.__NEXT_ROUTER_BASEPATH = "/demo";
    const { BASE_PATH, withBasePath } = await loadFresh();
    expect(BASE_PATH).toBe("/demo");
    expect(withBasePath("/logo.png")).toBe("/demo/logo.png");
  });

  it("falls back to BASE_PATH env (custom server context)", async () => {
    process.env.BASE_PATH = "/demo";
    const { BASE_PATH } = await loadFresh();
    expect(BASE_PATH).toBe("/demo");
  });

  it("does not double-prefix an already-prefixed path", async () => {
    process.env.__NEXT_ROUTER_BASEPATH = "/demo";
    const { withBasePath } = await loadFresh();
    expect(withBasePath("/demo/logo.png")).toBe("/demo/logo.png");
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:run -- src/lib/__tests__/base-path.test.ts`
Expected: FAIL — il primo test fallisce perché il default attuale è `"/savint"`, non `""`.

- [ ] **Step 3: Implementa il cambiamento minimo**

Sostituisci `src/lib/base-path.ts` con:

```typescript
/**
 * Base path prefix per asset statici e chiamate API.
 * Fonte unica: Next inietta __NEXT_ROUTER_BASEPATH (client + server runtime)
 * a partire da next.config.basePath; BASE_PATH copre il custom server (server.ts).
 * Default vuoto = montato sulla radice del dominio.
 */
export const BASE_PATH =
  process.env.__NEXT_ROUTER_BASEPATH || process.env.BASE_PATH || "";

/** Prepend del basePath a un path assoluto (es. "/logo.png" → "/demo/logo.png"). */
export function withBasePath(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH || path.startsWith(BASE_PATH + "/")) return path;
  return `${BASE_PATH}${path}`;
}
```

- [ ] **Step 4: Esegui il test e verifica che passi**

Run: `npm run test:run -- src/lib/__tests__/base-path.test.ts`
Expected: PASS (4 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/base-path.ts src/lib/__tests__/base-path.test.ts
git commit -m "refactor(base-path): make basePath env-driven, default root"
```

---

### Task 2: next.config.ts legge basePath da env

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Applica la modifica**

Sostituisci il corpo di `next.config.ts`:

```typescript
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// basePath build-time: "" = radice (hub), "/demo" = istanza prova.
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 2: Verifica build con basePath vuoto**

Run: `BASE_PATH="" npm run build`
Expected: build OK (nessun warning su basePath). Termina con "Compiled successfully" / route list.

- [ ] **Step 3: Verifica build con basePath /demo**

Run: `BASE_PATH=/demo npm run build`
Expected: build OK; nella route list i path risultano serviti sotto `/demo`.

- [ ] **Step 4: Commit**

```bash
git add next.config.ts
git commit -m "refactor(config): read basePath from BASE_PATH env"
```

---

### Task 3: Path Socket.io da BASE_PATH (server + client)

**Files:**
- Modify: `src/server.ts:18-24`
- Modify: `src/lib/socket/client.ts:15-16`

- [ ] **Step 1: Modifica il server**

In `src/server.ts`, aggiungi in cima (dopo gli import) il calcolo del basePath e usalo nel path Socket.io. Sostituisci il blocco `new SocketIOServer(...)`:

```typescript
const dev = process.env.NODE_ENV !== "production";
const basePath = process.env.BASE_PATH || "";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(
    httpServer,
    {
      cors: { origin: "*" },
      path: `${basePath}/api/socketio`,
    }
  );
```

(Le righe successive — `setupSocketHandlers`, `listen` — restano invariate.)

- [ ] **Step 2: Modifica il client**

In `src/lib/socket/client.ts`, aggiungi l'import e usa `BASE_PATH`:

```typescript
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@/types";
import { BASE_PATH } from "@/lib/base-path";
```

e cambia la riga del path:

```typescript
    const socket: TypedSocket = io({
      path: `${BASE_PATH}/api/socketio`,
```

- [ ] **Step 3: Verifica che la suite non si rompa**

Run: `npm run test:run`
Expected: PASS (nessun test dipende dal path hardcoded; se qualcuno fallisce, è un test da aggiornare — vedi Task 6).

- [ ] **Step 4: Commit**

```bash
git add src/server.ts src/lib/socket/client.ts
git commit -m "refactor(socket): derive socket.io path from basePath"
```

---

### Task 4: basePath NextAuth da env (route, config, provider)

**Files:**
- Modify: `src/app/api/auth/[...nextauth]/route.ts:4`
- Modify: `src/lib/auth/config.ts:116`
- Modify: `src/components/providers.tsx:6`

- [ ] **Step 1: route.ts**

In `src/app/api/auth/[...nextauth]/route.ts`, sostituisci la riga 4:

```typescript
const basePath = process.env.BASE_PATH || "";
```

(Il resto della funzione `rewriteRequest` funziona con basePath vuoto: l'URL ricostruito diventa `${proto}//${host}${pathname}${search}`.)

- [ ] **Step 2: auth/config.ts**

In `src/lib/auth/config.ts`, aggiungi l'import in cima:

```typescript
import { BASE_PATH } from "@/lib/base-path";
```

e cambia la riga 116:

```typescript
  basePath: `${BASE_PATH}/api/auth`,
```

- [ ] **Step 3: providers.tsx**

Sostituisci `src/components/providers.tsx`:

```typescript
"use client";

import { SessionProvider } from "next-auth/react";
import { BASE_PATH } from "@/lib/base-path";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider basePath={`${BASE_PATH}/api/auth`}>{children}</SessionProvider>
  );
}
```

- [ ] **Step 4: Verifica build**

Run: `BASE_PATH="" npm run build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/auth/[...nextauth]/route.ts src/lib/auth/config.ts src/components/providers.tsx
git commit -m "refactor(auth): derive NextAuth basePath from env"
```

---

### Task 5: Redirect e link cablati → basePath dinamico

**Files:**
- Modify: `src/app/(hub)/hub-login/page.tsx:23,38`
- Modify: `src/app/(auth)/login/page.tsx:19,36`
- Modify: `src/app/api/auth/logout/route.ts`
- Modify: `src/app/api/hub/auth/verify/route.ts:10,14,20`
- Modify: `src/app/(hub)/hub-register/actions.ts:55`
- Modify: `src/app/(hub)/hub-forgot-password/actions.ts:30`
- Modify: `src/app/(dashboard)/dashboard/sessions/page.tsx:80`

- [ ] **Step 1: hub-login/page.tsx**

Aggiungi import `import { withBasePath } from "@/lib/base-path";` e sostituisci entrambe le occorrenze `"/savint/hub-account"` con `withBasePath("/hub-account")`.

- [ ] **Step 2: (auth)/login/page.tsx**

Aggiungi import `import { withBasePath } from "@/lib/base-path";` e sostituisci `"/savint/dashboard"` (righe 19 e 36) con `withBasePath("/dashboard")`.

- [ ] **Step 3: dashboard/sessions/page.tsx**

Aggiungi import `import { withBasePath } from "@/lib/base-path";` e cambia la riga 80:

```tsx
                          href={withBasePath(`/live/host/${s.id}`)}
```

- [ ] **Step 4: api/auth/logout/route.ts**

Aggiungi import `import { withBasePath } from "@/lib/base-path";`. Cambia la riga di redirect:

```typescript
  const baseUrl = process.env.AUTH_URL || process.env.HUB_BASE_URL || "https://savint.it";
  const origin = new URL(baseUrl).origin;
  const response = NextResponse.redirect(new URL(withBasePath("/login"), origin));
```

- [ ] **Step 5: api/hub/auth/verify/route.ts**

Aggiungi import `import { withBasePath } from "@/lib/base-path";`. Sostituisci le 3 occorrenze `${base}/savint/hub-login?verified=...` con `` `${base}${withBasePath("/hub-login")}?verified=...` ``. Esempio per la riga 10:

```typescript
    return NextResponse.redirect(`${base}${withBasePath("/hub-login")}?verified=0`);
```

(idem per `verified=0` riga 14 e `verified=1` riga 20).

- [ ] **Step 6: hub-register/actions.ts**

Aggiungi import `import { withBasePath } from "@/lib/base-path";`. Cambia la riga 55:

```typescript
  const link = `${base}${withBasePath("/api/hub/auth/verify")}?token=${plainToken}`;
```

- [ ] **Step 7: hub-forgot-password/actions.ts**

Aggiungi import `import { withBasePath } from "@/lib/base-path";`. Cambia la riga 30:

```typescript
  const link = `${base}${withBasePath("/hub-reset-password")}?token=${plainToken}`;
```

- [ ] **Step 8: Verifica build + grep di controllo**

Run: `BASE_PATH="" npm run build`
Expected: build OK.

Run: `grep -rn "/savint" src --include="*.ts" --include="*.tsx" | grep -v "import" | grep -v "savint.it" | grep -v "__tests__"`
Expected: nessun risultato di codice attivo (solo eventuali commenti/test).

- [ ] **Step 9: Commit**

```bash
git add src/app/\(hub\)/hub-login/page.tsx src/app/\(auth\)/login/page.tsx \
  src/app/api/auth/logout/route.ts src/app/api/hub/auth/verify/route.ts \
  src/app/\(hub\)/hub-register/actions.ts src/app/\(hub\)/hub-forgot-password/actions.ts \
  src/app/\(dashboard\)/dashboard/sessions/page.tsx
git commit -m "refactor(routes): replace hardcoded /savint redirects with withBasePath"
```

---

### Task 6: Verifica completa Fase 1 (suite + due build)

**Files:** nessuna modifica (salvo test rotti da aggiornare)

- [ ] **Step 1: Suite completa**

Run: `npm run test:run`
Expected: tutti i test PASS. Se `src/lib/email/__tests__/send.test.ts` fallisce (usa link letterali con `/savint`), aggiorna le sue stringhe attese rimuovendo `/savint` (es. `https://savint.it/api/hub/auth/verify?token=xyz`) — è un test sul template, il link è un input arbitrario.

- [ ] **Step 2: Build hub (radice)**

Run: `BASE_PATH="" npm run build`
Expected: build OK, nessun warning `env-url-basepath-mismatch`.

- [ ] **Step 3: Build demo (/demo)**

Run: `BASE_PATH=/demo npm run build`
Expected: build OK; route servite sotto `/demo`.

- [ ] **Step 4: Smoke locale hub**

Run (in un terminale): `SAVINT_MODE=hub HUB_BASE_URL=http://localhost:3000 BASE_PATH="" PORT=3000 npm run dev:custom`
Poi: `curl -sI http://localhost:3000/explore | head -1`
Expected: `HTTP/1.1 200 OK` (la pagina esplora risponde sulla radice). Ferma il server.

- [ ] **Step 5: Commit (se test aggiornati)**

```bash
git add -A && git commit -m "test: drop hardcoded /savint from email template expectations"
```

---

## FASE 2 — Home page dell'hub

### Task 7: Home page mode-aware + landing curata

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/components/hub/hub-landing.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: `src/app/__tests__/page.test.tsx` (create)

- [ ] **Step 1: Scrivi il test che fallisce**

Crea `src/app/__tests__/page.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/components/live/player-view", () => ({
  PlayerView: () => <div data-testid="player-view" />,
}));
vi.mock("@/components/hub/hub-landing", () => ({
  HubLanding: () => <div data-testid="hub-landing" />,
}));

const setMode = (m: "hub" | "installation") =>
  vi.doMock("@/lib/config/savint-mode", () => ({
    getSavintMode: () => m,
    isHubMode: () => m === "hub",
    isInstallationMode: () => m === "installation",
  }));

describe("HomePage", () => {
  beforeEach(() => vi.resetModules());

  it("renders the hub landing in hub mode", async () => {
    setMode("hub");
    const { default: HomePage } = await import("../page");
    const out = await HomePage();
    expect(out.type.name ?? out.type).toBeDefined();
    // Il componente reso deve essere HubLanding
    expect(JSON.stringify(out)).toContain("HubLanding");
  });

  it("renders the player view in installation mode", async () => {
    setMode("installation");
    const { default: HomePage } = await import("../page");
    const out = await HomePage();
    expect(JSON.stringify(out)).toContain("PlayerView");
  });
});
```

- [ ] **Step 2: Esegui il test e verifica che fallisca**

Run: `npm run test:run -- src/app/__tests__/page.test.tsx`
Expected: FAIL — `page.tsx` oggi rende sempre `PlayerView` e non importa `HubLanding`.

- [ ] **Step 3: Crea il componente landing**

Crea `src/components/hub/hub-landing.tsx`:

```tsx
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { withBasePath } from "@/lib/base-path";
import { searchHubQuizzes } from "@/lib/hub/search";

export async function HubLanding() {
  const t = await getTranslations("hubHome");

  let featured: Awaited<ReturnType<typeof searchHubQuizzes>>["items"] = [];
  try {
    const res = await searchHubQuizzes({ sort: "popular", page: 1, perPage: 6 });
    featured = res.items;
  } catch {
    featured = [];
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4">
          {t("heroTitle")}
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
          {t("heroSubtitle")}
        </p>
        <form action={withBasePath("/explore")} className="flex max-w-xl mx-auto gap-2">
          <input
            type="search"
            name="q"
            placeholder={t("searchPlaceholder")}
            className="flex-1 rounded-lg border border-slate-300 px-4 py-3 text-slate-900"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700"
          >
            {t("searchButton")}
          </button>
        </form>
        <div className="mt-6 flex justify-center gap-4 text-sm">
          <Link href={withBasePath("/explore")} className="text-indigo-700 underline">
            {t("browseAll")}
          </Link>
          <Link href={withBasePath("/hub-register")} className="text-indigo-700 underline">
            {t("signUp")}
          </Link>
        </div>
      </section>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("featuredTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((q) => (
              <Link
                key={q.id}
                href={withBasePath(`/q/${q.id}`)}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:shadow-md transition"
              >
                <h3 className="font-semibold text-slate-900 line-clamp-2">{q.title}</h3>
                {q.description && (
                  <p className="mt-1 text-sm text-slate-600 line-clamp-2">{q.description}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Porta SAVINT a scuola */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16">
        <div className="rounded-2xl bg-slate-900 text-white p-8 sm:p-10">
          <h2 className="text-2xl font-bold mb-2">{t("schoolTitle")}</h2>
          <p className="text-slate-300 mb-4 max-w-2xl">{t("schoolBody")}</p>
          <div className="flex gap-4">
            <Link href={withBasePath("/demo")} className="rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900">
              {t("tryItButton")}
            </Link>
          </div>
        </div>
        <p className="mt-8 text-center text-xs text-slate-400">{t("footer")}</p>
      </section>
    </main>
  );
}
```

> Nota: `searchHubQuizzes` accetta i parametri usati anche in `src/app/explore/page.tsx`. Verifica che gli `items` espongano `id`, `title`, `description` (lo stesso shape usato da `HubExploreClient`); se i nomi differiscono, allinea i campi al tipo di ritorno reale.

- [ ] **Step 4: Aggiorna page.tsx**

Sostituisci `src/app/page.tsx`:

```tsx
import { isHubMode } from "@/lib/config/savint-mode";
import { PlayerView } from "@/components/live/player-view";
import { HubLanding } from "@/components/hub/hub-landing";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (isHubMode()) {
    return <HubLanding />;
  }
  return <PlayerView />;
}
```

- [ ] **Step 5: Aggiungi le traduzioni**

In `src/messages/it.json` aggiungi una chiave top-level `"hubHome"`:

```json
  "hubHome": {
    "heroTitle": "Quiz pronti per la tua classe",
    "heroSubtitle": "SAVINT è il repository libero di quiz interattivi per la scuola. Cerca, prova e scarica quiz creati dai docenti.",
    "searchPlaceholder": "Cerca un quiz per materia, argomento…",
    "searchButton": "Cerca",
    "browseAll": "Sfoglia tutti i quiz",
    "signUp": "Registrati",
    "featuredTitle": "Quiz in evidenza",
    "schoolTitle": "Porta SAVINT nella tua scuola",
    "schoolBody": "Installa SAVINT sui tuoi server e collegalo a savint.it per cercare, scaricare e pubblicare quiz. Oppure provalo subito senza installare niente.",
    "tryItButton": "Prova il sistema",
    "footer": "SAVINT — software libero per la scuola (AGPL-3.0)."
  }
```

In `src/messages/en.json` aggiungi l'equivalente:

```json
  "hubHome": {
    "heroTitle": "Ready-made quizzes for your classroom",
    "heroSubtitle": "SAVINT is the free repository of interactive school quizzes. Search, try and download quizzes made by teachers.",
    "searchPlaceholder": "Search a quiz by subject, topic…",
    "searchButton": "Search",
    "browseAll": "Browse all quizzes",
    "signUp": "Sign up",
    "featuredTitle": "Featured quizzes",
    "schoolTitle": "Bring SAVINT to your school",
    "schoolBody": "Install SAVINT on your own servers and connect it to savint.it to search, download and publish quizzes. Or try it right now without installing anything.",
    "tryItButton": "Try the system",
    "footer": "SAVINT — free software for schools (AGPL-3.0)."
  }
```

- [ ] **Step 6: Esegui il test e verifica che passi**

Run: `npm run test:run -- src/app/__tests__/page.test.tsx`
Expected: PASS (2 test).

- [ ] **Step 7: Verifica build + suite**

Run: `BASE_PATH="" npm run build && npm run test:run`
Expected: build OK, suite PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/components/hub/hub-landing.tsx src/messages/it.json src/messages/en.json src/app/__tests__/page.test.tsx
git commit -m "feat(hub): mode-aware home with hub landing page"
```

---

## FASE 3 — Deploy / operatività (eseguire sul server)

> Da qui in poi i passi si eseguono **sul server** (la VPS di savint.it). Non sono test automatici: ogni passo ha un comando e l'output atteso. Presuppone Node 20+, PostgreSQL 16, nginx, certbot, pm2 già installati (vedi prerequisiti in `DEPLOY-GUIDA.md`).

### Task 8: Database separati (hub + demo)

- [ ] **Step 1: Crea utenti e DB**

Run:
```bash
sudo -u postgres psql <<'SQL'
CREATE USER savint WITH PASSWORD 'CAMBIA_PASSWORD_HUB';
CREATE DATABASE savint_hub OWNER savint;
CREATE USER savint_demo WITH PASSWORD 'CAMBIA_PASSWORD_DEMO';
CREATE DATABASE savint_demo OWNER savint_demo;
SQL
```
Expected: `CREATE ROLE` / `CREATE DATABASE` per ciascuno.

- [ ] **Step 2: Verifica**

Run: `sudo -u postgres psql -l | grep savint`
Expected: compaiono `savint_hub` e `savint_demo`.

---

### Task 9: Checkout e .env dei due processi

- [ ] **Step 1: Due checkout**

Run:
```bash
sudo mkdir -p /opt/savint-hub /opt/savint-demo
sudo chown "$USER" /opt/savint-hub /opt/savint-demo
git clone https://github.com/BaolCristian/savint.git /opt/savint-hub
git clone https://github.com/BaolCristian/savint.git /opt/savint-demo
```
Expected: due cloni completati.

- [ ] **Step 2: `.env` dell'hub** (`/opt/savint-hub/.env`)

```env
SAVINT_MODE=hub
BASE_PATH=
PORT=3002
DATABASE_URL=postgresql://savint:CAMBIA_PASSWORD_HUB@localhost:5432/savint_hub

HUB_BASE_URL=https://savint.it
AUTH_URL=https://savint.it/api/auth
AUTH_TRUST_HOST=true
NEXTAUTH_SECRET=<openssl rand -base64 32>

GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxx

# Email (Task 13)
HUB_EMAIL_FROM=no-reply@savint.it
HUB_SMTP_HOST=...
HUB_SMTP_PORT=587
HUB_SMTP_USER=...
HUB_SMTP_PASS=...
HUB_IP_HASH_SECRET=<openssl rand -base64 32>
```

- [ ] **Step 3: `.env` della demo** (`/opt/savint-demo/.env`)

```env
SAVINT_MODE=installation
DEMO_MODE=true
NEXT_PUBLIC_DEMO_MODE=true
BASE_PATH=/demo
PORT=3001
DATABASE_URL=postgresql://savint_demo:CAMBIA_PASSWORD_DEMO@localhost:5432/savint_demo

SAVINT_HUB_URL=https://savint.it
AUTH_URL=https://savint.it/demo/api/auth
AUTH_TRUST_HOST=true
NEXTAUTH_SECRET=<openssl rand -base64 32 (diverso da quello hub)>
```

- [ ] **Step 4: Migrazioni + seed**

Run (hub):
```bash
cd /opt/savint-hub && npm install && npx prisma migrate deploy && npx prisma generate
```
Run (demo):
```bash
cd /opt/savint-demo && npm install && npx prisma migrate deploy && npx prisma generate && npx prisma db seed
```
Expected: migrazioni applicate su entrambi i DB; seed crea il docente demo solo sulla demo.

> Per l'hub serve un account admin di moderazione: crealo dopo il primo deploy promuovendo un `HubAccount` a `HUB_ADMIN` (vedi `src/lib/auth/require-hub-admin.ts` per il campo `role`).

---

### Task 10: Build e processi PM2

- [ ] **Step 1: Build hub**

Run: `cd /opt/savint-hub && BASE_PATH= npm run build`
Expected: build OK.

- [ ] **Step 2: Build demo**

Run: `cd /opt/savint-demo && BASE_PATH=/demo npm run build`
Expected: build OK.

- [ ] **Step 3: Avvia i due processi**

Run:
```bash
cd /opt/savint-hub && pm2 start npm --name savint-hub -- run start:custom
cd /opt/savint-demo && pm2 start npm --name savint-demo -- run start:custom
pm2 save
```
Expected: due processi `online` in `pm2 list`.

- [ ] **Step 4: Smoke locale**

Run: `curl -sI http://127.0.0.1:3002/ | head -1 && curl -sI http://127.0.0.1:3001/demo | head -1`
Expected: due `HTTP/1.1 200 OK`.

---

### Task 11: nginx (savint.it: / → hub, /demo → demo)

**Files:** Crea/sostituisci `deploy/nginx-savint.it.conf` nel repo (documentazione) e installa sul server.

- [ ] **Step 1: Scrivi la config**

Contenuto del server block savint.it (HTTP; certbot aggiungerà SSL):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name savint.it www.savint.it;
    client_max_body_size 100M;

    # Istanza "prova" — DEVE precedere la location "/" per priorità di prefisso
    location /demo {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Hub (radice)
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

- [ ] **Step 2: Installa e ricarica**

Run:
```bash
sudo cp deploy/nginx-savint.it.conf /etc/nginx/sites-available/savint.it
sudo ln -sf /etc/nginx/sites-available/savint.it /etc/nginx/sites-enabled/savint.it
sudo nginx -t && sudo systemctl reload nginx
```
Expected: `nginx: configuration file ... test is successful`.

- [ ] **Step 3: Dismetti friulware.it/savint**

Nel file nginx di friulware.it (`/etc/nginx/sites-available/friulware.it` o `default`), **rimuovi il blocco `location /savint { ... }`**. Poi:
```bash
sudo nginx -t && sudo systemctl reload nginx
pm2 delete savint    # vecchio processo condiviso (se ancora presente)
pm2 save
```
Expected: nginx OK; `pm2 list` non mostra più `savint` (restano `savint-hub`, `savint-demo`).

---

### Task 12: HTTPS (certbot)

- [ ] **Step 1: Emetti il certificato**

Run: `sudo certbot --nginx -d savint.it -d www.savint.it`
Expected: certificato emesso; certbot riscrive il server block con `listen 443 ssl` e aggiunge il redirect 80→443.

- [ ] **Step 2: Verifica**

Run: `curl -sI https://savint.it/ | head -1 && curl -sI https://savint.it/demo | head -1`
Expected: due `HTTP/2 200`.

---

### Task 13: Google OAuth + SMTP

- [ ] **Step 1: Google OAuth redirect URI**

Nella Google Cloud Console, alle credenziali OAuth del progetto aggiungi gli URI di reindirizzamento autorizzati:
```
https://savint.it/api/auth/callback/google
https://savint.it/demo/api/auth/callback/google
```
Expected: salvataggio OK (propagazione fino a ~5 min).

- [ ] **Step 2: SMTP**

Compila `HUB_SMTP_*` e `HUB_EMAIL_FROM` in `/opt/savint-hub/.env` con le credenziali del provider scelto, poi `pm2 restart savint-hub`.

- [ ] **Step 3: Verifica recapito email**

Registra un account di prova su `https://savint.it/hub-register` e verifica di ricevere l'email con il link `https://savint.it/api/hub/auth/verify?token=...`. Cliccando il link l'account risulta verificato.
Expected: email ricevuta, link funzionante, login riuscito.

---

### Task 14: Script di aggiornamento per i due processi

**Files:**
- Modify: `update-server.sh`

- [ ] **Step 1: Generalizza lo script**

Sostituisci `update-server.sh` per accettare nome/dir/basePath via env, così da poterlo invocare per ciascun processo:

```bash
#!/usr/bin/env bash
# Aggiornamento di UN processo SAVINT dopo un push su main.
# Uso:
#   APP_NAME=savint-hub  APP_DIR=/opt/savint-hub  BASE_PATH=     ./update-server.sh
#   APP_NAME=savint-demo APP_DIR=/opt/savint-demo BASE_PATH=/demo ./update-server.sh
set -euo pipefail

APP_NAME="${APP_NAME:?set APP_NAME}"
APP_DIR="${APP_DIR:?set APP_DIR}"
export BASE_PATH="${BASE_PATH:-}"

cd "$APP_DIR"
echo "==> git pull ($APP_NAME)"
git pull --ff-only
echo "==> npm install"
npm install --include=dev --no-audit --no-fund
echo "==> prisma migrate deploy"
./node_modules/.bin/prisma migrate deploy
echo "==> prisma generate"
./node_modules/.bin/prisma generate
echo "==> npm run build (BASE_PATH='${BASE_PATH}')"
npm run build
echo "==> pm2 restart ${APP_NAME}"
pm2 restart "$APP_NAME" --update-env
echo "==> fatto. Log:"
pm2 logs "$APP_NAME" --lines 20 --nostream
```

- [ ] **Step 2: Verifica esecuzione (hub)**

Run sul server: `APP_NAME=savint-hub APP_DIR=/opt/savint-hub BASE_PATH= ./update-server.sh`
Expected: pull/build/restart OK, `savint-hub` torna `online`.

- [ ] **Step 3: Commit (in locale, nel repo)**

```bash
git add update-server.sh
git commit -m "chore(deploy): parametrize update-server.sh per-process"
```

---

### Task 15: Documentazione (deploy + onboarding scuole)

**Files:**
- Modify: `DEPLOY-GUIDA.md`
- Create: `docs/INSTALLAZIONE-SCUOLA.md`

- [ ] **Step 1: Aggiorna DEPLOY-GUIDA.md**

Sostituisci i riferimenti a `friulware.it` con `savint.it`, documenta i **due processi** (`savint-hub` su `/` porta 3002, `savint-demo` su `/demo` porta 3001), i due `.env` (con `SAVINT_MODE`, `BASE_PATH`, DB separati), e il redirect URI Google per radice e `/demo`. Rimuovi le istruzioni del singolo processo `savint` e del `location /savint`.

- [ ] **Step 2: Crea la guida scuola**

Crea `docs/INSTALLAZIONE-SCUOLA.md` con: come installare SAVINT in modalità `installation` (Docker o PM2), e come collegarla all'hub impostando nel `.env`:
```env
SAVINT_MODE=installation
SAVINT_HUB_URL=https://savint.it
HUB_OAUTH_CLIENT_ID=<fornito dall'admin savint.it>
HUB_OAUTH_CLIENT_SECRET=<fornito dall'admin savint.it>
```
e seguendo dall'app il flusso "Collega a savint.it" (`/api/hub/oauth/start`). Per l'MVP le credenziali OAuth sono fornite manualmente dall'amministratore dell'hub.

- [ ] **Step 3: Commit**

```bash
git add DEPLOY-GUIDA.md docs/INSTALLAZIONE-SCUOLA.md
git commit -m "docs: deploy guide for two processes + school onboarding"
```

---

## Verifica finale (criteri di successo dello spec)

- [ ] `https://savint.it/` mostra la home hub curata; `/explore`, `/q/<id>`, self-practice, `/u/<id>`, account funzionano sulla radice (basePath vuoto).
- [ ] Registrazione hub con email di verifica realmente recapitata (SMTP).
- [ ] `https://savint.it/demo` consente di provare il sistema (login demo, crea quiz, sessione live) — verifica anche che il quiz live (Socket.io) si connetta su `/demo/api/socketio`.
- [ ] Una scuola può installare la propria copia, collegarla via OAuth e cercare/scaricare/caricare quiz.
- [ ] HTTPS valido; `pm2 list` mostra `savint-hub` e `savint-demo` `online`; `pm2 startup` configurato per il reboot.
- [ ] `friulware.it/savint` non risponde più (location rimossa, processo `savint` eliminato).
```
