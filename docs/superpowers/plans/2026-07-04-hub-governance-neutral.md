# Governance neutrale hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare all'hub un proprietario/admin neutro (account SAVINT) e la capacità di trasferirgli i quiz di un docente, più una conferma di eliminazione scuola che nomina la voce.

**Architecture:** L'account di sistema è un normale `HubAccount` risolto per email da env; una route admin sposta i `HubQuiz` di un docente sull'account SAVINT via `updateMany`; la UI vive nella tab *Amministratori* già esistente. Nessuna migrazione.

**Tech Stack:** Next.js route handlers + server/client components, Prisma, next-intl, vitest.

## Global Constraints

- Nessuna modifica allo schema Prisma (nessuna migrazione).
- Account SAVINT risolto per email da `SAVINT_SYSTEM_ACCOUNT_EMAIL` (default `cvirgili@sterpo.it`, confrontato in minuscolo).
- Ogni route admin gated **HUB_ADMIN** via `requireHubAdmin`.
- Solo hub. Stile brand (token `--brand-*`), niente indaco.
- i18n in **entrambe** le lingue (parità chiavi), namespace `adminAccounts`.
- Guardrail per task: `npm run lint` + `npx tsc --noEmit` + `npm run test:run` verdi (falliscono solo i pre-esistenti sotto `.worktrees/`); `npm run build` a fine.
- Branch `hub-governance-neutral`; un commit per task; trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Helper account di sistema

**Files:**
- Create: `src/lib/hub/system-account.ts`
- Test: `src/lib/hub/__tests__/system-account.test.ts`

**Interfaces:**
- Produces: `SYSTEM_ACCOUNT_EMAIL: string` (minuscolo) e `getSystemHubAccount(): Promise<HubAccount | null>`.

- [ ] **Step 1: Test**

Create `src/lib/hub/__tests__/system-account.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
import { SYSTEM_ACCOUNT_EMAIL, getSystemHubAccount } from "../system-account";

afterEach(async () => {
  await prisma.hubAccount.deleteMany({ where: { email: SYSTEM_ACCOUNT_EMAIL } });
});

describe("getSystemHubAccount", () => {
  it("null quando l'account non esiste", async () => {
    expect(await getSystemHubAccount()).toBeNull();
  });
  it("ritorna l'account SAVINT quando esiste", async () => {
    await prisma.hubAccount.create({
      data: { email: SYSTEM_ACCOUNT_EMAIL, name: "SAVINT", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
    });
    const acc = await getSystemHubAccount();
    expect(acc?.email).toBe(SYSTEM_ACCOUNT_EMAIL);
    expect(acc?.name).toBe("SAVINT");
  });
});
```

- [ ] **Step 2: Run → FAIL** (modulo inesistente).

- [ ] **Step 3: Implementare**

Create `src/lib/hub/system-account.ts`:

```ts
import type { HubAccount } from "@prisma/client";
import { prisma } from "@/lib/db/client";

/** Email dell'account neutro "SAVINT" (super partes + proprietario contenuti adottati). */
export const SYSTEM_ACCOUNT_EMAIL = (
  process.env.SAVINT_SYSTEM_ACCOUNT_EMAIL ?? "cvirgili@sterpo.it"
).toLowerCase();

export async function getSystemHubAccount(): Promise<HubAccount | null> {
  return prisma.hubAccount.findUnique({ where: { email: SYSTEM_ACCOUNT_EMAIL } });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(hub): helper account di sistema SAVINT (per email)`.

---

### Task 2: Route trasferimento contenuti a SAVINT

**Files:**
- Create: `src/app/api/hub/admin/accounts/transfer-content/route.ts`
- Test: `src/app/api/hub/admin/accounts/__tests__/transfer-content.test.ts`

**Interfaces:**
- Consumes: `getSystemHubAccount` (Task 1), `requireHubAdmin`.
- Produces: `POST /api/hub/admin/accounts/transfer-content` `{ email }` → `{ ok: true, moved }` (200); 409 `system_account_missing`; 404 email ignota; 400 `cannot_transfer_self` / email vuota; 401/403.

- [ ] **Step 1: Test**

Create `src/app/api/hub/admin/accounts/__tests__/transfer-content.test.ts`:

```ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db/client";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
import { POST as transfer } from "../transfer-content/route";
import { getHubSession } from "@/lib/auth/hub-session";
import { SYSTEM_ACCOUNT_EMAIL } from "@/lib/hub/system-account";
import { NextRequest } from "next/server";

const rid = () => Math.random().toString(36).slice(2);
const accIds: string[] = [];
const req = (email: unknown) =>
  new NextRequest("http://localhost/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });

async function account(email: string) {
  const a = await prisma.hubAccount.create({
    data: { email, name: email === SYSTEM_ACCOUNT_EMAIL ? "SAVINT" : "T", authMethod: "PASSWORD", linkedProviders: ["password"], role: "HUB_ADMIN" },
  });
  accIds.push(a.id);
  return a;
}
function asAdmin(a: { id: string }) { (getHubSession as ReturnType<typeof vi.fn>).mockResolvedValue(a); }

async function quiz(hubAccountId: string) {
  return prisma.hubQuiz.create({
    data: {
      hubAccountId, title: "Q", schoolLevel: "PRIMARIA", subject: "storia", language: "it",
      questionCount: 1, estimatedDurationSec: 60, payloadBlob: Buffer.from("x"), payloadHash: `h-${rid()}`, payloadSize: 1,
    },
  });
}

afterEach(async () => {
  await prisma.hubAccount.deleteMany({ where: { id: { in: accIds } } }); // cascata su HubQuiz
  accIds.length = 0;
});

describe("transfer-content", () => {
  it("sposta i quiz del docente su SAVINT", async () => {
    const savint = await account(SYSTEM_ACCOUNT_EMAIL);
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    const teacher = await account(`t-${rid()}@x.it`);
    await quiz(teacher.id); await quiz(teacher.id);
    const res = await transfer(req(teacher.email));
    expect(res.status).toBe(200);
    expect((await res.json()).moved).toBe(2);
    expect(await prisma.hubQuiz.count({ where: { hubAccountId: teacher.id } })).toBe(0);
    expect(await prisma.hubQuiz.count({ where: { hubAccountId: savint.id } })).toBe(2);
  });
  it("409 se l'account SAVINT non esiste", async () => {
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    expect((await transfer(req(`t-${rid()}@x.it`))).status).toBe(409);
  });
  it("400 se trasferisci da SAVINT a se stesso", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    expect((await transfer(req(SYSTEM_ACCOUNT_EMAIL))).status).toBe(400);
  });
  it("404 se l'email non esiste", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    const admin = await account(`a-${rid()}@x.it`); asAdmin(admin);
    expect((await transfer(req(`nobody-${rid()}@x.it`))).status).toBe(404);
  });
  it("403 se non admin", async () => {
    await account(SYSTEM_ACCOUNT_EMAIL);
    const u = await account(`u-${rid()}@x.it`);
    await prisma.hubAccount.update({ where: { id: u.id }, data: { role: "HUB_USER" } });
    asAdmin(u);
    expect((await transfer(req(`x@x.it`))).status).toBe(403);
  });
});
```

- [ ] **Step 2: Run → FAIL** (route inesistente).

- [ ] **Step 3: Implementare la route**

Create `src/app/api/hub/admin/accounts/transfer-content/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { getSystemHubAccount } from "@/lib/hub/system-account";

/**
 * Reassign all of a teacher's published quizzes to the neutral SAVINT account,
 * so content survives when the teacher/school leaves. The displayed author
 * becomes "SAVINT" because it derives from HubAccount.name.
 */
export async function POST(req: NextRequest) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const email = String((body as { email?: unknown })?.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 });

  const savint = await getSystemHubAccount();
  if (!savint) return NextResponse.json({ error: "system_account_missing" }, { status: 409 });

  const teacher = await prisma.hubAccount.findUnique({ where: { email } });
  if (!teacher) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (teacher.id === savint.id) {
    return NextResponse.json({ error: "cannot_transfer_self" }, { status: 400 });
  }

  const { count } = await prisma.hubQuiz.updateMany({
    where: { hubAccountId: teacher.id },
    data: { hubAccountId: savint.id },
  });
  return NextResponse.json({ ok: true, moved: count });
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(hub-admin): route trasferimento quiz a SAVINT`.

---

### Task 3: i18n sezione trasferimento + label eliminazione

**Files:**
- Modify: `src/messages/it.json`, `src/messages/en.json`

**Interfaces:**
- Produces: chiavi `adminAccounts.transfer*` e `adminAffiliations.confirmDeleteNamed` usate nei Task 4-5.

- [ ] **Step 1: In `adminAccounts` (IT e EN) aggiungere:**

IT:
```json
"transferTitle": "Trasferisci contenuti a SAVINT",
"transferHelp": "Sposta tutti i quiz pubblicati da un docente all'account neutro SAVINT (utile quando un docente o una scuola lascia). L'autore mostrato diventa «SAVINT».",
"transferAction": "Trasferisci a SAVINT",
"transferConfirmTitle": "Trasferire tutti i quiz?",
"transferConfirmBody": "Tutti i quiz pubblicati da {email} passeranno all'account SAVINT. L'operazione non riassegna automaticamente indietro.",
"transferConfirmAction": "Trasferisci",
"transferSuccess": "{count} quiz trasferiti a SAVINT.",
"transferNotFound": "Nessun account registrato con questa email.",
"transferSystemMissing": "Account SAVINT non configurato sull'hub."
```
EN:
```json
"transferTitle": "Transfer content to SAVINT",
"transferHelp": "Move all quizzes published by a teacher to the neutral SAVINT account (useful when a teacher or school leaves). The displayed author becomes “SAVINT”.",
"transferAction": "Transfer to SAVINT",
"transferConfirmTitle": "Transfer all quizzes?",
"transferConfirmBody": "All quizzes published by {email} will move to the SAVINT account. This does not automatically reassign them back.",
"transferConfirmAction": "Transfer",
"transferSuccess": "{count} quizzes transferred to SAVINT.",
"transferNotFound": "No account registered with this email.",
"transferSystemMissing": "SAVINT account not configured on the hub."
```

- [ ] **Step 2: In `adminAffiliations` (IT e EN) aggiungere la variante con nome:**

IT: `"confirmDeleteNamed": "Eliminare definitivamente «{name}»? Questa azione cancella la scuola e, se presente, l'installazione collegata con le sue credenziali. Non è reversibile."`
EN: `"confirmDeleteNamed": "Permanently delete “{name}”? This deletes the school and, if present, the linked installation with its credentials. It cannot be undone."`

- [ ] **Step 3: Verifica parità**

Run:
```bash
node -e "const it=require('./src/messages/it.json'),en=require('./src/messages/en.json');for(const k of ['transferTitle','transferHelp','transferAction','transferConfirmTitle','transferConfirmBody','transferConfirmAction','transferSuccess','transferNotFound','transferSystemMissing']){if(!it.adminAccounts[k]||!en.adminAccounts[k])throw new Error('manca '+k)}if(!it.adminAffiliations.confirmDeleteNamed||!en.adminAffiliations.confirmDeleteNamed)throw new Error('manca confirmDeleteNamed');console.log('i18n OK')"
```
Expected: `i18n OK`.

- [ ] **Step 4: Commit** `feat(i18n): stringhe trasferimento SAVINT + conferma eliminazione nominata`.

---

### Task 4: UI — sezione "Trasferisci a SAVINT" nella tab Amministratori

**Files:**
- Modify: `src/app/admin/hub/admins/admin-account-actions.tsx` (nuovo componente `TransferForm`)
- Modify: `src/app/admin/hub/admins/page.tsx` (nuova sezione)

**Interfaces:**
- Consumes: route Task 2, chiavi Task 3.

- [ ] **Step 1: Aggiungere `TransferForm`** in `admin-account-actions.tsx` (in fondo, dopo `DemoteButton`). Riusa il dialog shadcn:

```tsx
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Form: trasferisci tutti i quiz di un docente (per email) all'account SAVINT. */
export function TransferForm() {
  const t = useTranslations("adminAccounts");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onConfirm() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/hub/admin/accounts/transfer-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setBusy(false);
    setOpen(false);
    if (res.ok) {
      const data = await res.json();
      setMsg({ ok: true, text: t("transferSuccess", { count: data.moved }) });
      setEmail("");
      router.refresh();
    } else if (res.status === 404) {
      setMsg({ ok: false, text: t("transferNotFound") });
    } else if (res.status === 409) {
      setMsg({ ok: false, text: t("transferSystemMissing") });
    } else {
      setMsg({ ok: false, text: t("actionError") });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("transferHelp")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMsg(null); }}
          placeholder={t("emailPlaceholder")}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
        <button
          type="button"
          disabled={busy || !email.trim()}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {t("transferAction")}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-brand-green" : "text-red-600"}`}>{msg.text}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transferConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("transferConfirmBody", { email: email.trim() })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={onConfirm} disabled={busy}>{t("transferConfirmAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

> Nota: `t("cancel")` non esiste in `adminAccounts`; aggiungere `"cancel": "Annulla"` (IT) / `"Cancel"` (EN) in `adminAccounts` in Task 3 Step 1 se assente, oppure usare una stringa dedicata `transferCancel`. Verificare le chiavi esistenti prima; se `cancel` manca, aggiungerla in entrambe le lingue e nel controllo di parità.

- [ ] **Step 2: Aggiungere la sezione in `page.tsx`** — importare `TransferForm` e inserire una nuova `<section>` dopo "Amministratori attuali":

```tsx
import { PromoteForm, DemoteButton, TransferForm } from "./admin-account-actions";
```
```tsx
      {/* Trasferisci contenuti a SAVINT */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("transferTitle")}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm max-w-xl">
          <TransferForm />
        </div>
      </section>
```

- [ ] **Step 3: Verifica** `npm run lint && npx tsc --noEmit && npm run test:run` verdi.
- [ ] **Step 4: Commit** `feat(hub-admin): UI trasferimento contenuti a SAVINT`.

---

### Task 5: Conferma eliminazione scuola con nome

**Files:**
- Modify: `src/app/admin/hub/affiliations/confirm-delete.tsx`
- Modify: `src/app/admin/hub/affiliations/installation-actions.tsx`
- Modify: `src/app/admin/hub/affiliations/affiliation-actions.tsx`
- Modify: `src/app/admin/hub/affiliations/page.tsx`

- [ ] **Step 1: `ConfirmDelete` accetta un `label` opzionale**

In `confirm-delete.tsx`, cambiare firma e testo di conferma:
```tsx
export function ConfirmDelete({ deleteUrl, label }: { deleteUrl: string; label?: string }) {
```
e nel `DialogDescription` usare la variante nominata quando `label` è presente:
```tsx
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>
              {label ? t("confirmDeleteNamed", { name: label }) : t("confirmDeleteBody")}
            </DialogDescription>
```

- [ ] **Step 2: Passare il nome scuola dai wrapper**

In `installation-actions.tsx` — aggiungere `schoolName` ai props e passarlo:
```tsx
export function InstallationActions({
  installationId, active, schoolName,
}: { installationId: string; active: boolean; schoolName?: string }) {
```
```tsx
      <ConfirmDelete deleteUrl={`/api/hub/admin/installations/${installationId}`} label={schoolName} />
```

In `affiliation-actions.tsx` — aggiungere `schoolName` ai props e passarlo:
```tsx
export default function AffiliationActions({ id, schoolName }: { id: string; schoolName?: string }) {
```
```tsx
      <ConfirmDelete deleteUrl={`/api/hub/admin/affiliations/${id}`} label={schoolName} />
```

- [ ] **Step 3: Passare il nome nelle 3 sezioni di `page.tsx`**

- Sezione **collegate**: `<InstallationActions installationId={inst.id} active={active} schoolName={inst.name} />`
- Sezione **collegate** (ramo senza installazione, se presente): `<ConfirmDelete deleteUrl={...} label={inst?.name ?? r.schoolName} />`
- Sezione **in attesa**: `<AffiliationActions id={r.id} schoolName={r.schoolName} />`
- Sezione **storico**: `<ConfirmDelete deleteUrl={`/api/hub/admin/affiliations/${r.id}`} label={r.schoolName} />`

(Adeguare ai nomi di variabile effettivi nella pagina: `inst.name` per l'installazione, `r.schoolName` per la richiesta.)

- [ ] **Step 4: Verifica finale** `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` verdi.
- [ ] **Step 5: Commit** `feat(hub-admin): conferma eliminazione scuola con nome`.

## Self-review (autore del piano)

- **Copertura spec**: account SAVINT → Task 1 (helper) + ops (creazione fuori codice); trasferimento → Task 2 (route) + Task 4 (UI) + Task 3 (i18n); sicurezza eliminazione → Task 5 + i18n Task 3. Env `SAVINT_SYSTEM_ACCOUNT_EMAIL` in Task 1.
- **Placeholder**: nessuno; codice completo per helper, route, test, UI, i18n.
- **Coerenza tipi**: `getSystemHubAccount(): Promise<HubAccount|null>` usato in Task 2; `transfer-content` ritorna `{ok, moved}` letto in Task 4 come `data.moved`; `ConfirmDelete({deleteUrl,label?})` coerente con i wrapper (`schoolName` → `label`). `HubQuiz` seed nei test include i campi obbligatori (payloadBlob/Hash/Size, schoolLevel, subject, language, questionCount, estimatedDurationSec).
- **Rischio i18n `cancel`**: Task 4 usa `t("cancel")` in `adminAccounts`; se assente va aggiunta (annotato nel Task 4 Step 1).
