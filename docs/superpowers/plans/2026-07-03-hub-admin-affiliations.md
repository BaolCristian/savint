# Console admin affiliazioni — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'admin dell'hub una console per vedere le scuole collegate, tutte le richieste, e disattivare (reversibile) o eliminare (definitivo) le affiliazioni.

**Architecture:** Nuove route `/api/hub/admin/*` gated `requireHubAdmin` per disable/enable installazione ed eliminazione richiesta; pagina `/admin/hub/affiliations` riscritta in tre sezioni (collegate / in attesa / storico) con stile brand; layout admin con tab per la raggiungibilità + link "Admin" nell'header per gli HUB_ADMIN.

**Tech Stack:** Next.js 16 (route handlers + server/client components), Prisma, next-intl, vitest, Tailwind token brand.

## Global Constraints

- Solo hub. Ogni route e pagina admin gated **HUB_ADMIN** (`requireHubAdmin` per le API, `getHubSessionFromCookies` + redirect per le pagine).
- **Nessuna migrazione Prisma.** `HubAccessToken`/`OAuthAuthorizationCode` hanno `onDelete: Cascade` da `Installation`: eliminare l'Installation cancella i token in cascata.
- Il token endpoint (`api/hub/oauth/token/route.ts:26`) rifiuta già le installazioni non `ACTIVE`: disattivare = `status DISABLED` + revoca token esistenti.
- Stile: solo token brand (`bg-brand-*`, tinte `-50`), niente indaco. Azioni distruttive con conferma.
- i18n in **entrambe** le lingue (parità chiavi). Guardrail per task: `npm run lint` + `npm run test:run` verdi; `npm run build` alla fine.
- Un commit per task sul branch `hub-admin-affiliations`, trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Route disable/enable installazione + test

**Files:**
- Create: `src/app/api/hub/admin/installations/[id]/disable/route.ts`
- Create: `src/app/api/hub/admin/installations/[id]/enable/route.ts`
- Test: `src/app/api/hub/admin/installations/__tests__/toggle.test.ts`

**Interfaces:**
- Produces: `POST /api/hub/admin/installations/[id]/disable` e `/enable` → `{ ok: true }` (200), `{ error: "not_found" }` (404), 401/403 dal guard.

- [ ] **Step 1: Test (mock getHubSession, DB reale)**

Create `src/app/api/hub/admin/installations/__tests__/toggle.test.ts`:

```ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { POST as disable } from "../[id]/disable/route";
import { POST as enable } from "../[id]/enable/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const req = () => new NextRequest("http://localhost/x", { method: "POST" });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const ids: { accounts: string[]; installations: string[] } = { accounts: [], installations: [] };

async function admin(role: "HUB_ADMIN" | "HUB_USER" = "HUB_ADMIN") {
  const a = await prisma.hubAccount.create({
    data: { email: `a-${rid()}@x.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"], role },
  });
  ids.accounts.push(a.id);
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a);
  return a;
}
async function installation() {
  const acc = await admin(); // reused as token owner
  const inst = await prisma.installation.create({
    data: { name: "Scuola", contactEmail: "s@x.it", clientId: `inst_${rid()}`, clientSecretHash: "h" },
  });
  ids.installations.push(inst.id);
  await prisma.hubAccessToken.create({
    data: {
      hubAccountId: acc.id, installationId: inst.id,
      accessTokenHash: `at-${rid()}`, refreshTokenHash: `rt-${rid()}`,
      accessTokenExpiresAt: new Date(Date.now() + 3600e3), refreshTokenExpiresAt: new Date(Date.now() + 7200e3),
      scopes: [],
    },
  });
  return inst;
}

afterAll(async () => {
  await prisma.installation.deleteMany({ where: { id: { in: ids.installations } } });
  await prisma.hubAccount.deleteMany({ where: { id: { in: ids.accounts } } });
});

describe("installations disable/enable", () => {
  it("disable: DISABLED + token revocati", async () => {
    const inst = await installation();
    const res = await disable(req(), p(inst.id));
    expect(res.status).toBe(200);
    const after = await prisma.installation.findUnique({ where: { id: inst.id } });
    expect(after?.status).toBe("DISABLED");
    expect(await prisma.hubAccessToken.count({ where: { installationId: inst.id } })).toBe(0);
  });
  it("enable: torna ACTIVE", async () => {
    const inst = await installation();
    await disable(req(), p(inst.id));
    const res = await enable(req(), p(inst.id));
    expect(res.status).toBe(200);
    expect((await prisma.installation.findUnique({ where: { id: inst.id } }))?.status).toBe("ACTIVE");
  });
  it("404 se assente", async () => {
    await admin();
    expect((await disable(req(), p("nope"))).status).toBe(404);
  });
  it("401 senza sessione, 403 se non admin", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await disable(req(), p("x"))).status).toBe(401);
    await admin("HUB_USER");
    expect((await disable(req(), p("x"))).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run src/app/api/hub/admin/installations` → moduli route inesistenti).

- [ ] **Step 3: Implementare le route**

`src/app/api/hub/admin/installations/[id]/disable/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const inst = await prisma.installation.findUnique({ where: { id } });
  if (!inst) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.$transaction([
    prisma.installation.update({ where: { id }, data: { status: "DISABLED" } }),
    prisma.hubAccessToken.deleteMany({ where: { installationId: id } }),
  ]);
  return NextResponse.json({ ok: true });
}
```

`src/app/api/hub/admin/installations/[id]/enable/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const inst = await prisma.installation.findUnique({ where: { id } });
  if (!inst) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.installation.update({ where: { id }, data: { status: "ACTIVE" } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(hub-admin): route disable/enable installazione`.

---

### Task 2: Route DELETE affiliazione + test

**Files:**
- Create: `src/app/api/hub/admin/affiliations/[id]/route.ts`
- Test: `src/app/api/hub/admin/affiliations/__tests__/delete.test.ts`

**Interfaces:**
- Produces: `DELETE /api/hub/admin/affiliations/[id]` → `{ ok: true }` (200), 404, 401/403.

- [ ] **Step 1: Test**

```ts
import { describe, it, expect, afterAll, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { DELETE } from "../[id]/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const req = () => new NextRequest("http://localhost/x", { method: "DELETE" });
const p = (id: string) => ({ params: Promise.resolve({ id }) });
const accIds: string[] = [];

async function admin() {
  const a = await prisma.hubAccount.create({
    data: { email: `a-${rid()}@x.it`, name: "A", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
  });
  accIds.push(a.id);
  (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a);
  return a;
}
afterAll(async () => { await prisma.hubAccount.deleteMany({ where: { id: { in: accIds } } }); });

describe("DELETE affiliation", () => {
  it("elimina richiesta + installazione (cascade token)", async () => {
    const acc = await admin();
    const inst = await prisma.installation.create({
      data: { name: "S", contactEmail: "s@x.it", clientId: `inst_${rid()}`, clientSecretHash: "h" },
    });
    await prisma.hubAccessToken.create({
      data: { hubAccountId: acc.id, installationId: inst.id, accessTokenHash: `at-${rid()}`, refreshTokenHash: `rt-${rid()}`,
        accessTokenExpiresAt: new Date(Date.now() + 3600e3), refreshTokenExpiresAt: new Date(Date.now() + 7200e3), scopes: [] },
    });
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "S", province: "UD", installationUrl: "https://s.it", contactEmail: "s@x.it", status: "REDEEMED", installationId: inst.id },
    });
    const res = await DELETE(req(), p(r.id));
    expect(res.status).toBe(200);
    expect(await prisma.affiliationRequest.findUnique({ where: { id: r.id } })).toBeNull();
    expect(await prisma.installation.findUnique({ where: { id: inst.id } })).toBeNull();
    expect(await prisma.hubAccessToken.count({ where: { installationId: inst.id } })).toBe(0);
  });
  it("elimina richiesta senza installazione (es. REJECTED)", async () => {
    await admin();
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "S", province: "UD", installationUrl: "https://s.it", contactEmail: "s@x.it", status: "REJECTED" },
    });
    expect((await DELETE(req(), p(r.id))).status).toBe(200);
    expect(await prisma.affiliationRequest.findUnique({ where: { id: r.id } })).toBeNull();
  });
  it("404 se assente", async () => { await admin(); expect((await DELETE(req(), p("nope"))).status).toBe(404); });
  it("401/403", async () => {
    (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect((await DELETE(req(), p("x"))).status).toBe(401);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementare**

`src/app/api/hub/admin/affiliations/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const row = await prisma.affiliationRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    // deleteMany = idempotente; il delete dell'Installation cascata su token/authcode.
    if (row.installationId) {
      await tx.installation.deleteMany({ where: { id: row.installationId } });
    }
    await tx.affiliationRequest.delete({ where: { id } });
  });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(hub-admin): route DELETE affiliazione (cascade installazione+token)`.

---

### Task 3: i18n `adminAffiliations` + nav/header (IT+EN)

**Files:**
- Modify: `src/messages/it.json`, `src/messages/en.json`

**Interfaces:**
- Produces: namespace `adminAffiliations` con le chiavi usate in Task 5, e chiavi `adminNav`/`headerAdmin` in `hub` per Task 4.

- [ ] **Step 1: Aggiungere il namespace `adminAffiliations`** (IT; EN speculare) — inserirlo accanto ad `affiliation` in `it.json`:

```json
"adminAffiliations": {
  "title": "Console admin — Affiliazioni",
  "connectedTitle": "Scuole collegate",
  "pendingTitle": "Richieste in attesa",
  "historyTitle": "Storico",
  "none": "Nessuna voce.",
  "colSchool": "Scuola",
  "colProvince": "Provincia",
  "colUrl": "URL",
  "colEmail": "Email",
  "colStatus": "Stato",
  "colLastSeen": "Ultimo accesso",
  "colConnectedAt": "Collegata il",
  "colDate": "Data",
  "colDetail": "Dettaglio",
  "colActions": "Azioni",
  "statusActive": "Attiva",
  "statusDisabled": "Disattivata",
  "statusApproved": "Codice inviato, in attesa di riscatto",
  "statusRejected": "Rifiutata",
  "codeExpires": "Scade il {date}",
  "rejectedReason": "Motivo: {reason}",
  "never": "Mai",
  "disable": "Disattiva",
  "enable": "Riattiva",
  "delete": "Elimina",
  "confirmDeleteTitle": "Eliminare definitivamente?",
  "confirmDeleteBody": "Questa azione elimina la richiesta e, se presente, l'installazione collegata con le sue credenziali. Non è reversibile.",
  "confirmDeleteAction": "Elimina",
  "cancel": "Annulla",
  "actionError": "Operazione non riuscita."
}
```

EN corrispondente (stesse chiavi): title "Admin console — Affiliations", connectedTitle "Connected schools", pendingTitle "Pending requests", historyTitle "History", none "No entries.", colSchool "School", colProvince "Province", colUrl "URL", colEmail "Email", colStatus "Status", colLastSeen "Last seen", colConnectedAt "Connected on", colDate "Date", colDetail "Detail", colActions "Actions", statusActive "Active", statusDisabled "Disabled", statusApproved "Code sent, awaiting redemption", statusRejected "Rejected", codeExpires "Expires on {date}", rejectedReason "Reason: {reason}", never "Never", disable "Disable", enable "Enable", delete "Delete", confirmDeleteTitle "Delete permanently?", confirmDeleteBody "This deletes the request and, if present, the linked installation with its credentials. It cannot be undone.", confirmDeleteAction "Delete", cancel "Cancel", actionError "Operation failed.".

- [ ] **Step 2: In `hub` (entrambe le lingue) aggiungere:**

IT: `"adminNav": { "affiliations": "Affiliazioni", "reports": "Segnalazioni" }, "headerAdmin": "Admin"`
EN: `"adminNav": { "affiliations": "Affiliations", "reports": "Reports" }, "headerAdmin": "Admin"`

- [ ] **Step 3: Verifica parità**

Run:
```bash
node -e "for(const n of ['adminAffiliations']){const it=require('./src/messages/it.json')[n],en=require('./src/messages/en.json')[n];if(JSON.stringify(Object.keys(it).sort())!==JSON.stringify(Object.keys(en).sort()))throw new Error('MISMATCH '+n);}console.log('PARITY OK')"
```
Expected: `PARITY OK`. Poi `npm run test:run` verde.

- [ ] **Step 4: Commit** `feat(i18n): stringhe console admin affiliazioni`.

---

### Task 4: Layout admin (tab + guard) + link "Admin" nell'header

**Files:**
- Create: `src/app/admin/hub/layout.tsx`
- Modify: `src/components/hub/hub-header.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Layout admin con guard + tab**

`src/app/admin/hub/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";

export const dynamic = "force-dynamic";

export default async function AdminHubLayout({ children }: { children: React.ReactNode }) {
  const account = await getHubSessionFromCookies();
  if (!account) redirect("/hub-login?next=/admin/hub/affiliations");
  if (account.role !== "HUB_ADMIN") redirect("/");
  const t = await getTranslations("hub.adminNav");

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <nav className="mb-6 flex gap-2">
        <Link href="/admin/hub/affiliations" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-brand-blue-50 hover:text-brand-blue">
          {t("affiliations")}
        </Link>
        <Link href="/admin/hub/reports" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-brand-blue-50 hover:text-brand-blue">
          {t("reports")}
        </Link>
      </nav>
      {children}
    </div>
  );
}
```

> Nota: il guard nel layout copre entrambe le pagine; il guard duplicato dentro `reports/page.tsx`/`affiliations/page.tsx` può restare (innocuo).

- [ ] **Step 2: Link "Admin" nell'header (prop `isAdmin`)**

In `src/components/hub/hub-header.tsx`: aggiungere la prop e il link. Firma:

```tsx
export function HubHeader({ isAdmin = false }: { isAdmin?: boolean }) {
```

Dentro il `<nav>` (accanto al link Esplora), aggiungere:

```tsx
{isAdmin && (
  <Link href={withBasePath("/admin/hub/affiliations")} className="text-slate-600 transition-colors hover:text-brand-blue">
    {t("headerAdmin")}
  </Link>
)}
```

- [ ] **Step 3: Calcolare `isAdmin` nel root layout (solo hub)**

In `src/app/layout.tsx`, dove c'è `const hub = isHubMode();` e `{hub && <HubHeader />}`:

```tsx
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
// ...
const hub = isHubMode();
const isAdmin = hub ? (await getHubSessionFromCookies())?.role === "HUB_ADMIN" : false;
// ...
{hub && <HubHeader isAdmin={isAdmin} />}
```

(Per utenti anonimi `getHubSessionFromCookies` è null senza query DB: nessun costo.)

- [ ] **Step 4: Verifica** `npm run lint && npm run test:run && npx tsc --noEmit` verdi.
- [ ] **Step 5: Commit** `feat(hub-admin): layout admin con tab + link Admin nell'header`.

---

### Task 5: Pagina affiliazioni riscritta + componenti azioni

**Files:**
- Rewrite: `src/app/admin/hub/affiliations/page.tsx`
- Rewrite: `src/app/admin/hub/affiliations/affiliation-actions.tsx`
- Create: `src/app/admin/hub/affiliations/installation-actions.tsx`
- Create: `src/app/admin/hub/affiliations/confirm-delete.tsx`

**Interfaces:**
- Consumes: le route dei Task 1–2 e le chiavi `adminAffiliations` (Task 3).

- [ ] **Step 1: `confirm-delete.tsx` (client, dialog di conferma riusabile)**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Bottone "Elimina" che apre un dialog di conferma e fa DELETE su affiliationId. */
export function ConfirmDelete({ affiliationId }: { affiliationId: string }) {
  const t = useTranslations("adminAffiliations");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/hub/admin/affiliations/${affiliationId}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setError(t("actionError")); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
      >
        {t("delete")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteBody")}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={busy}>{t("confirmDeleteAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: `installation-actions.tsx` (Disattiva/Riattiva + Elimina)**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDelete } from "./confirm-delete";

export function InstallationActions({
  affiliationId, installationId, active,
}: { affiliationId: string; installationId: string; active: boolean }) {
  const t = useTranslations("adminAffiliations");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    const action = active ? "disable" : "enable";
    const res = await fetch(`/api/hub/admin/installations/${installationId}/${action}`, { method: "POST" });
    if (!res.ok) { setError(t("actionError")); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={toggle}
        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        {active ? t("disable") : t("enable")}
      </button>
      <ConfirmDelete affiliationId={affiliationId} />
    </div>
  );
}
```

- [ ] **Step 3: `affiliation-actions.tsx` riscritto (Approva/Rifiuta brand + Elimina)**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmDelete } from "./confirm-delete";

export default function AffiliationActions({ id }: { id: string }) {
  const t = useTranslations("affiliation");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setError(null);
    const res = await fetch(`/api/hub/affiliation/${id}/approve`, { method: "POST" });
    if (!res.ok) { setError(t("approveError")); return; }
    router.refresh();
  }
  async function handleReject() {
    setError(null);
    const reason = window.prompt(t("rejectReasonPrompt")) ?? undefined;
    const res = await fetch(`/api/hub/affiliation/${id}/reject`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
    });
    if (!res.ok) { setError(t("rejectError")); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button onClick={handleApprove} className="rounded-lg bg-brand-green px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 transition">
        {t("approve")}
      </button>
      <button onClick={handleReject} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
        {t("reject")}
      </button>
      <ConfirmDelete affiliationId={id} />
    </div>
  );
}
```

- [ ] **Step 4: `page.tsx` riscritta (tre sezioni)**

Query: `REDEEMED` (join installazioni), `PENDING_REVIEW`, e `APPROVED`+`REJECTED`. Codice:

```tsx
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import AffiliationActions from "./affiliation-actions";
import { InstallationActions } from "./installation-actions";
import { ConfirmDelete } from "./confirm-delete";

export const dynamic = "force-dynamic";

function Badge({ tone, children }: { tone: "green" | "slate" | "orange" | "red"; children: React.ReactNode }) {
  const cls = {
    green: "bg-brand-green-50 text-brand-green",
    slate: "bg-slate-100 text-slate-600",
    orange: "bg-brand-orange-50 text-brand-orange",
    red: "bg-red-50 text-red-600",
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export default async function Page() {
  const t = await getTranslations("adminAffiliations");
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("it-IT") : t("never"));

  const [redeemed, pending, history] = await Promise.all([
    prisma.affiliationRequest.findMany({ where: { status: "REDEEMED" }, orderBy: { redeemedAt: "desc" } }),
    prisma.affiliationRequest.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" } }),
    prisma.affiliationRequest.findMany({ where: { status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const instIds = redeemed.map((r) => r.installationId).filter((x): x is string => Boolean(x));
  const installations = await prisma.installation.findMany({ where: { id: { in: instIds } } });
  const instById = new Map(installations.map((i) => [i.id, i]));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-slate-900">{t("title")}</h1>

      {/* Scuole collegate */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("connectedTitle")} ({redeemed.length})</h2>
        {redeemed.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colStatus"), t("colLastSeen"), t("colConnectedAt"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {redeemed.map((r) => {
                  const inst = r.installationId ? instById.get(r.installationId) : undefined;
                  const active = inst?.status === "ACTIVE";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}<div className="text-xs text-slate-400">{r.contactEmail}</div></td>
                      <td className="px-4 py-3 text-slate-600">{r.province}</td>
                      <td className="px-4 py-3">{active ? <Badge tone="green">{t("statusActive")}</Badge> : <Badge tone="slate">{t("statusDisabled")}</Badge>}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(inst?.lastSeenAt ?? null)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(r.redeemedAt)}</td>
                      <td className="px-4 py-3">
                        {inst ? <InstallationActions affiliationId={r.id} installationId={inst.id} active={active} /> : <ConfirmDelete affiliationId={r.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Richieste in attesa */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("pendingTitle")} ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colUrl"), t("colDate"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}<div className="text-xs text-slate-400">{r.contactEmail}</div></td>
                    <td className="px-4 py-3 text-slate-600">{r.province}</td>
                    <td className="px-4 py-3"><a href={r.installationUrl} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline break-all">{r.installationUrl}</a></td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                    <td className="px-4 py-3"><AffiliationActions id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Storico */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("historyTitle")} ({history.length})</h2>
        {history.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colStatus"), t("colDetail"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}<div className="text-xs text-slate-400">{r.contactEmail}</div></td>
                    <td className="px-4 py-3 text-slate-600">{r.province}</td>
                    <td className="px-4 py-3">{r.status === "APPROVED" ? <Badge tone="orange">{t("statusApproved")}</Badge> : <Badge tone="red">{t("statusRejected")}</Badge>}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.status === "APPROVED" && r.setupCodeExpiresAt ? t("codeExpires", { date: fmt(r.setupCodeExpiresAt) })
                        : r.status === "REJECTED" && r.rejectionReason ? t("rejectedReason", { reason: r.rejectionReason }) : "—"}
                    </td>
                    <td className="px-4 py-3"><ConfirmDelete affiliationId={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Verifica** `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` verdi. A schermo (seed locale + login admin): tre sezioni, azioni funzionanti.
- [ ] **Step 6: Commit** `feat(hub-admin): pagina affiliazioni a tre sezioni + azioni disattiva/elimina`.

## Self-review (autore del piano)

- **Copertura spec**: disable/enable→T1; delete→T2; i18n→T3; layout+header+isAdmin→T4; pagina 3 sezioni + confirm delete + installation actions→T5. Token endpoint già gata (nessun task). Cascade via schema (nessuna migrazione).
- **Placeholder**: nessuno; codice completo per route, test, componenti, pagina.
- **Coerenza tipi**: le route `/disable|/enable|/affiliations/[id]` e le chiavi i18n usate in T5 combaciano con T1–T3; `ConfirmDelete` firma `{affiliationId}`, `InstallationActions` `{affiliationId, installationId, active}` usate coerentemente.
