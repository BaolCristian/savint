# Legal Compliance & Content Protection Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add legal protections (terms acceptance, publish declarations, content reporting, admin moderation) to SAVINT quiz platform.

**Architecture:** Centralized `Consent` table tracks all user agreements with timestamps and versions. `Report` table manages content flagging with admin moderation workflow. Quiz model gains `license` and `suspended` fields. Shared `TermsGuard` component blocks authenticated routes until terms are accepted.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 (PostgreSQL), NextAuth v5, React 19, Tailwind CSS, shadcn/ui, Zod

**Spec:** `docs/superpowers/specs/2026-03-12-legal-compliance-design.md`

---

## Chunk 1: Database Schema & Config

### Task 1: Prisma Schema Migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add new enums to Prisma schema**

After `SharePermission` enum (line 37), add:

```prisma
enum ConsentType {
  TERMS_ACCEPTANCE
  QUIZ_PUBLISH_DECLARATION
}

enum QuizLicense {
  CC_BY
  CC_BY_SA
}

enum ReportReason {
  COPYRIGHT
  PERSONAL_DATA
  OFFENSIVE
  OTHER
}

enum ReportStatus {
  PENDING
  REVIEWED
  RESOLVED
  DISMISSED
}
```

- [ ] **Step 2: Add Consent model**

After the `User` model (line 55), add:

```prisma
model Consent {
  id        String      @id @default(cuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      ConsentType
  version   String
  metadata  Json?
  createdAt DateTime    @default(now())

  @@index([userId, type, version])
}
```

- [ ] **Step 3: Add Report model**

After the `Consent` model, add:

```prisma
model Report {
  id          String       @id @default(cuid())
  quizId      String
  quiz        Quiz         @relation(fields: [quizId], references: [id], onDelete: Cascade)
  reporterId  String
  reporter    User         @relation("reportsMade", fields: [reporterId], references: [id], onDelete: Cascade)
  reason      ReportReason
  description String?
  status      ReportStatus @default(PENDING)
  resolvedAt  DateTime?
  resolvedBy  String?
  resolver    User?        @relation("reportsResolved", fields: [resolvedBy], references: [id], onDelete: SetNull)
  createdAt   DateTime     @default(now())

  @@unique([quizId, reporterId])
  @@index([status])
}
```

- [ ] **Step 4: Add fields to Quiz model**

In the `Quiz` model (after line 102 `tags` field), add:

```prisma
  license   QuizLicense @default(CC_BY)
  suspended Boolean     @default(false)
```

Add the `reports` relation after `shares` (line 109):

```prisma
  reports   Report[]
```

- [ ] **Step 5: Add relations to User model**

In the `User` model (after line 54 `sessions`), add:

```prisma
  consents        Consent[]
  reportsMade     Report[]  @relation("reportsMade")
  reportsResolved Report[]  @relation("reportsResolved")
```

- [ ] **Step 6: Run migration**

Run: `npx prisma migrate dev --name legal_compliance`
Expected: Migration created successfully, Prisma client regenerated.

- [ ] **Step 7: Commit**

```bash
git add prisma/
git commit -m "feat: add legal compliance schema (Consent, Report, Quiz license/suspended)"
```

### Task 2: Legal Config Constants

**Files:**
- Create: `src/lib/config/legal.ts`

- [ ] **Step 1: Create legal config file**

```typescript
export const CURRENT_TERMS_VERSION = "1.0";
export const CURRENT_DECLARATION_VERSION = "1.0";

export const LICENSE_LABELS: Record<string, string> = {
  CC_BY: "Creative Commons Attribution (CC BY)",
  CC_BY_SA: "Creative Commons Attribution-ShareAlike (CC BY-SA)",
};
```

- [ ] **Step 2: Create admin auth helper**

Create: `src/lib/auth/admin.ts`

```typescript
import { auth } from "@/lib/auth/config";

export async function assertAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401, session: null };
  }
  if (session.user.role !== "ADMIN") {
    return { error: "Forbidden", status: 403, session: null };
  }
  return { error: null, status: null, session };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/config/legal.ts src/lib/auth/admin.ts
git commit -m "feat: add legal config constants and admin auth helper"
```

---

## Chunk 2: Consent API & Terms Guard

### Task 3: Consent API Routes

**Files:**
- Create: `src/app/api/consent/route.ts`
- Create: `src/app/api/consent/check/route.ts`

- [ ] **Step 1: Create POST /api/consent route**

Create `src/app/api/consent/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const consentSchema = z.object({
  type: z.enum(["TERMS_ACCEPTANCE", "QUIZ_PUBLISH_DECLARATION"]),
  version: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = consentSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const consent = await prisma.consent.create({
    data: {
      userId: session.user.id,
      type: parsed.data.type,
      version: parsed.data.version,
      metadata: parsed.data.metadata ?? undefined,
    },
  });

  return NextResponse.json(consent, { status: 201 });
}
```

- [ ] **Step 2: Create GET /api/consent/check route**

Create `src/app/api/consent/check/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  const version = req.nextUrl.searchParams.get("version");

  if (!type || !version)
    return NextResponse.json({ error: "type and version required" }, { status: 400 });

  const consent = await prisma.consent.findFirst({
    where: {
      userId: session.user.id,
      type: type as any,
      version,
    },
  });

  return NextResponse.json({ accepted: !!consent });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/consent/
git commit -m "feat: add consent API routes (POST + check)"
```

### Task 4: Terms Acceptance Modal Component

**Files:**
- Create: `src/components/legal/terms-acceptance-modal.tsx`

- [ ] **Step 1: Create the modal component**

```typescript
"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";
import { CURRENT_TERMS_VERSION } from "@/lib/config/legal";

export function TermsAcceptanceModal({ onAccepted }: { onAccepted: () => void }) {
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAccept = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withBasePath("/api/consent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "TERMS_ACCEPTANCE",
          version: CURRENT_TERMS_VERSION,
        }),
      });
      if (!res.ok) throw new Error("Errore durante il salvataggio");
      onAccepted();
    } catch {
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Accettazione delle condizioni di utilizzo
          </h2>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            Registrandoti su questa piattaforma dichiari di aver letto e accettato le{" "}
            <Link href="/terms" className="text-indigo-600 dark:text-indigo-400 underline" target="_blank">
              Condizioni di utilizzo
            </Link>{" "}
            e l&apos;
            <Link href="/privacy" className="text-indigo-600 dark:text-indigo-400 underline" target="_blank">
              Informativa sulla privacy
            </Link>.
          </p>
          <p>
            I contenuti pubblicati sulla piattaforma sono responsabilità esclusiva
            degli utenti che li caricano.
          </p>
          <p>
            L&apos;utente si impegna a pubblicare esclusivamente contenuti di cui
            possiede i diritti oppure contenuti originali.
          </p>
          <p>
            Non è consentito pubblicare materiali coperti da copyright (ad esempio
            contenuti tratti da libri di testo, manuali o piattaforme editoriali)
            senza autorizzazione dei titolari dei diritti.
          </p>
        </div>

        <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-700 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Dichiaro di aver letto e accettato le condizioni di utilizzo e
              l&apos;informativa sulla privacy.
            </span>
          </label>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            onClick={handleAccept}
            disabled={!checked || loading}
            className="w-full py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Accetto
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/legal/terms-acceptance-modal.tsx
git commit -m "feat: add terms acceptance modal component"
```

### Task 5: Terms Guard Component & Layout Integration

**Files:**
- Create: `src/components/legal/terms-guard.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `src/app/(editor)/layout.tsx`

- [ ] **Step 1: Create TermsGuard client component**

Create `src/components/legal/terms-guard.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { TermsAcceptanceModal } from "@/components/legal/terms-acceptance-modal";
import { withBasePath } from "@/lib/base-path";
import { CURRENT_TERMS_VERSION } from "@/lib/config/legal";

export function TermsGuard({ children }: { children: React.ReactNode }) {
  const [accepted, setAccepted] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(withBasePath(`/api/consent/check?type=TERMS_ACCEPTANCE&version=${CURRENT_TERMS_VERSION}`))
      .then((res) => res.json())
      .then((data) => setAccepted(data.accepted))
      .catch(() => setAccepted(true)); // fail open to not block usage
  }, []);

  // Loading state — show nothing while checking
  if (accepted === null) return <>{children}</>;

  return (
    <>
      {!accepted && <TermsAcceptanceModal onAccepted={() => setAccepted(true)} />}
      {children}
    </>
  );
}
```

- [ ] **Step 2: Integrate into dashboard layout**

Modify `src/app/(dashboard)/layout.tsx`. Wrap the content with `TermsGuard`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <DashboardThemeProvider>
      <TermsGuard>
        <div className="flex h-screen flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
          <DashboardSidebar user={session.user} />
          <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
        </div>
      </TermsGuard>
    </DashboardThemeProvider>
  );
}
```

- [ ] **Step 3: Integrate into editor layout**

Modify `src/app/(editor)/layout.tsx`. Wrap with `TermsGuard`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <DashboardThemeProvider>
      <TermsGuard>{children}</TermsGuard>
    </DashboardThemeProvider>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/legal/terms-guard.tsx src/app/(dashboard)/layout.tsx src/app/(editor)/layout.tsx
git commit -m "feat: add TermsGuard to all authenticated layouts"
```

---

## Chunk 3: Quiz Publish Declaration & License

### Task 6: Update Quiz Validator Schema

**Files:**
- Modify: `src/lib/validators/quiz.ts`

- [ ] **Step 1: Add consentAccepted and license to quizSchema**

At the end of `quizSchema` (line 91-97), modify to add the new fields:

```typescript
export const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  questions: z.array(questionSchema).min(1),
  consentAccepted: z.boolean().optional(),
  license: z.enum(["CC_BY", "CC_BY_SA"]).optional(),
});
```

Note: `consentAccepted` and `license` are optional at the schema level so `updateQuizSchema.partial()` still works. The API routes enforce them as required.

- [ ] **Step 2: Commit**

```bash
git add src/lib/validators/quiz.ts
git commit -m "feat: add consentAccepted and license to quiz schema"
```

### Task 7: Update Quiz API Routes for Consent

**Files:**
- Modify: `src/app/api/quiz/route.ts` (POST)
- Modify: `src/app/api/quiz/[id]/route.ts` (PUT)

- [ ] **Step 1: Update POST /api/quiz**

Modify `src/app/api/quiz/route.ts`. Add consent validation and transaction:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";
import { CURRENT_DECLARATION_VERSION } from "@/lib/config/legal";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: session.user.id },
        { shares: { some: { sharedWithId: session.user.id } } },
      ],
    },
    include: { _count: { select: { questions: true, sessions: true } } },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(quizzes);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, consentAccepted, license, ...quizData } = parsed.data;

  if (!consentAccepted)
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const quiz = await tx.quiz.create({
        data: {
          ...quizData,
          license: license ?? "CC_BY",
          authorId: session.user!.id!,
          questions: {
            create: questions.map((q, i) => {
              const { order: _order, ...rest } = q;
              return { ...rest, order: i };
            }),
          },
        },
        include: { questions: true },
      });

      await tx.consent.create({
        data: {
          userId: session.user!.id!,
          type: "QUIZ_PUBLISH_DECLARATION",
          version: CURRENT_DECLARATION_VERSION,
          metadata: { quizId: quiz.id },
        },
      });

      return quiz;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    console.error("POST /api/quiz error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Update PUT /api/quiz/[id]**

Modify `src/app/api/quiz/[id]/route.ts`. Wrap in transaction, add consent:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";
import { CURRENT_DECLARATION_VERSION } from "@/lib/config/legal";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      author: { select: { name: true, email: true } },
    },
  });

  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(quiz);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz || quiz.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, consentAccepted, license, ...quizData } = parsed.data;

  if (!consentAccepted)
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.answer.deleteMany({
        where: { question: { quizId: id } },
      });
      await tx.question.deleteMany({ where: { quizId: id } });

      const result = await tx.quiz.update({
        where: { id },
        data: {
          ...quizData,
          license: license ?? "CC_BY",
          questions: {
            create: questions.map((q, i) => {
              const { order: _order, ...rest } = q;
              return { ...rest, order: i };
            }),
          },
        },
        include: { questions: true },
      });

      await tx.consent.create({
        data: {
          userId: session.user!.id!,
          type: "QUIZ_PUBLISH_DECLARATION",
          version: CURRENT_DECLARATION_VERSION,
          metadata: { quizId: id },
        },
      });

      return result;
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PUT /api/quiz error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Database error" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz || quiz.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.answer.deleteMany({
    where: { session: { quizId: id } },
  });
  await prisma.session.deleteMany({ where: { quizId: id } });
  await prisma.quiz.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/quiz/route.ts src/app/api/quiz/[id]/route.ts
git commit -m "feat: require consent + license on quiz create/update with transaction"
```

### Task 8: Quiz Publish Declaration Modal

**Files:**
- Create: `src/components/legal/publish-declaration-modal.tsx`

- [ ] **Step 1: Create the declaration modal**

```typescript
"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

interface Props {
  onConfirm: (license: "CC_BY" | "CC_BY_SA") => void;
  onCancel: () => void;
  loading?: boolean;
}

export function PublishDeclarationModal({ onConfirm, onCancel, loading }: Props) {
  const [checked, setChecked] = useState(false);
  const [license, setLicense] = useState<"CC_BY" | "CC_BY_SA">("CC_BY");

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Dichiarazione di responsabilità sui contenuti
          </h2>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>Pubblicando questo quiz dichiari sotto la tua responsabilità che:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>il contenuto è originale oppure hai il diritto di pubblicarlo</li>
            <li>il quiz non viola diritti d&apos;autore di terzi</li>
            <li>il quiz non contiene dati personali di studenti o altre persone identificabili</li>
            <li>il contenuto rispetta le norme di legge e le regole della piattaforma</li>
          </ul>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            La piattaforma ospita contenuti caricati dagli utenti e si riserva il
            diritto di rimuovere contenuti che risultino in violazione delle presenti
            condizioni.
          </p>

          {/* License selector */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
            <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">
              Licenza del contenuto
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              I quiz pubblicati su questa piattaforma sono condivisi per scopi
              didattici. Selezionando una licenza autorizzi altri utenti a utilizzare
              il quiz secondo le condizioni indicate.
            </p>
            <select
              value={license}
              onChange={(e) => setLicense(e.target.value as "CC_BY" | "CC_BY_SA")}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              <option value="CC_BY">Creative Commons Attribution (CC BY)</option>
              <option value="CC_BY_SA">Creative Commons Attribution-ShareAlike (CC BY-SA)</option>
            </select>
          </div>
        </div>

        <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-700 space-y-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5 h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Dichiaro che il quiz è originale o che possiedo i diritti per pubblicarlo.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Annulla
            </button>
            <button
              onClick={() => onConfirm(license)}
              disabled={!checked || loading}
              className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              Salva e dichiara
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/legal/publish-declaration-modal.tsx
git commit -m "feat: add publish declaration modal with license selector"
```

### Task 9: Integrate Declaration into Quiz Editor

**Files:**
- Modify: `src/components/quiz/quiz-editor.tsx`

- [ ] **Step 1: Add declaration modal state and import**

At the top of `quiz-editor.tsx`, add imports:

```typescript
import { PublishDeclarationModal } from "@/components/legal/publish-declaration-modal";
```

Inside the `QuizEditor` component, after `validationErrors` state (line 130), add:

```typescript
const [showDeclaration, setShowDeclaration] = useState(false);
const [pendingLicense, setPendingLicense] = useState<"CC_BY" | "CC_BY_SA" | null>(null);
```

- [ ] **Step 2: Modify the save flow**

Replace the `doSave` callback (lines 136-216) to split into two: `requestSave` (shows modal) and `doSave` (actual save). The approach:

1. The "Salva" button now calls `requestSave` instead of `doSave`
2. `requestSave` does client-side validation then shows the declaration modal
3. When the user confirms, `doSave` is called with the chosen license

Replace the save logic. `requestSave` validates and opens modal:

```typescript
const requestSave = useCallback(() => {
  if (saving) return;
  setError(null);
  setValidationErrors([]);

  const vErrors = validateQuestions(title, questions);
  if (vErrors.length > 0) {
    setValidationErrors(vErrors);
    setSaveStatus("error");
    return;
  }

  setShowDeclaration(true);
}, [saving, title, questions]);
```

`doSave` now accepts a license parameter:

```typescript
const doSave = useCallback(async (license: "CC_BY" | "CC_BY_SA") => {
  if (saving) return;
  setSaving(true);
  setSaveStatus("saving");
  setShowDeclaration(false);

  const tags = tagsText
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const payload = {
    title,
    description: description || undefined,
    isPublic,
    tags,
    questions: questions.map((q, i) => ({ ...q, order: i })),
    consentAccepted: true,
    license,
  };

  try {
    const url = withBasePath(isEdit ? `/api/quiz/${initialData!.id}` : "/api/quiz");
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let body: any = null;
      try {
        body = await res.json();
      } catch {
        // not JSON
      }
      throw new Error(
        body?.error?.formErrors?.[0] ??
          body?.error?.fieldErrors
            ? "Verifica i campi e riprova."
            : `Errore durante il salvataggio (${res.status}).`,
      );
    }

    if (isEdit) {
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
      router.refresh();
    } else {
      const created = await res.json();
      router.push(`/dashboard/quiz/${created.id}/edit`);
      router.refresh();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore sconosciuto.";
    setError(msg);
    setSaveStatus("error");
  } finally {
    setSaving(false);
  }
}, [saving, title, description, tagsText, isPublic, questions, initialData, isEdit, router]);
```

- [ ] **Step 3: Update autosave to use requestSave**

The autosave timer (line 222-224) should call `requestSave` — but since autosave should NOT show a modal every 2 seconds, **disable autosave**. Remove the autosave mechanism entirely (lines 218-242). Autosave is incompatible with requiring consent on every save.

Remove the `scheduleAutosave` callback, the `prevDataRef` effect, and the cleanup effect.

- [ ] **Step 4: Update save button onClick**

Change the save button (line 396) from `onClick={doSave}` to `onClick={requestSave}`.

- [ ] **Step 5: Render the declaration modal**

After the validation errors dialog (after line 573), add:

```typescript
{showDeclaration && (
  <PublishDeclarationModal
    onConfirm={(license) => doSave(license)}
    onCancel={() => setShowDeclaration(false)}
    loading={saving}
  />
)}
```

- [ ] **Step 6: Update doSave dependencies array**

Make sure `doSave` and `requestSave` have correct dependency arrays. `requestSave` replaces `doSave` in the save button.

- [ ] **Step 7: Commit**

```bash
git add src/components/quiz/quiz-editor.tsx
git commit -m "feat: integrate publish declaration modal into quiz editor save flow"
```

### Task 10: Update Duplicate Route for Consent

**Files:**
- Modify: `src/app/api/quiz/duplicate/route.ts`

- [ ] **Step 1: Add consent requirement**

The duplicate route needs `consentAccepted` and `license` in the request body:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { CURRENT_DECLARATION_VERSION } from "@/lib/config/legal";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quizId, consentAccepted, license } = await req.json();
  if (!quizId)
    return NextResponse.json({ error: "quizId required" }, { status: 400 });

  if (!consentAccepted)
    return NextResponse.json({ error: "Consent is required" }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: quizId },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz)
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  if (quiz.authorId !== session.user.id && !quiz.isPublic) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const copy = await prisma.$transaction(async (tx) => {
    const created = await tx.quiz.create({
      data: {
        title: `${quiz.title} (copia)`,
        description: quiz.description,
        authorId: session.user!.id!,
        isPublic: false,
        tags: quiz.tags,
        license: license ?? "CC_BY",
        questions: {
          create: quiz.questions.map((q) => ({
            type: q.type,
            text: q.text,
            timeLimit: q.timeLimit,
            points: q.points,
            confidenceEnabled: q.confidenceEnabled,
            mediaUrl: q.mediaUrl,
            order: q.order,
            options: q.options as any,
          })),
        },
      },
      include: { questions: true },
    });

    await tx.consent.create({
      data: {
        userId: session.user!.id!,
        type: "QUIZ_PUBLISH_DECLARATION",
        version: CURRENT_DECLARATION_VERSION,
        metadata: { quizId: created.id },
      },
    });

    return created;
  });

  return NextResponse.json(copy, { status: 201 });
}
```

- [ ] **Step 2: Update library-client.tsx duplicate flow**

Modify `src/components/library/library-client.tsx` to show declaration before duplicating. Add state and import:

```typescript
import { PublishDeclarationModal } from "@/components/legal/publish-declaration-modal";
```

Add state for pending duplicate:

```typescript
const [pendingDuplicate, setPendingDuplicate] = useState<string | null>(null);
```

Change `handleDuplicate` to show modal first:

```typescript
const handleDuplicate = (quizId: string) => {
  setPendingDuplicate(quizId);
};

const confirmDuplicate = async (license: "CC_BY" | "CC_BY_SA") => {
  const quizId = pendingDuplicate;
  setPendingDuplicate(null);
  if (!quizId) return;

  setLoading(quizId);
  try {
    const res = await fetch(withBasePath("/api/quiz/duplicate"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId, consentAccepted: true, license }),
    });
    if (!res.ok) throw new Error();
    router.push("/dashboard/quiz");
    router.refresh();
  } catch {
    alert("Errore nella duplicazione");
  } finally {
    setLoading(null);
  }
};
```

Add modal render at end of component JSX (before closing `</>`):

```typescript
{pendingDuplicate && (
  <PublishDeclarationModal
    onConfirm={confirmDuplicate}
    onCancel={() => setPendingDuplicate(null)}
  />
)}
```

- [ ] **Step 3: Update quiz-dashboard.tsx duplicate flow**

Same pattern in `src/components/dashboard/quiz-dashboard.tsx`. The `handleDuplicate` function (line 372-404) needs the declaration modal. Import `PublishDeclarationModal`, add `pendingDuplicate` state to `QuizCard`, show modal before proceeding.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/quiz/duplicate/route.ts src/components/library/library-client.tsx src/components/dashboard/quiz-dashboard.tsx
git commit -m "feat: require consent for quiz duplication in API and UI"
```

---

## Chunk 4: Content Reporting

### Task 11: Report API Route

**Files:**
- Create: `src/app/api/report/route.ts`

- [ ] **Step 1: Create POST /api/report**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const reportSchema = z.object({
  quizId: z.string().min(1),
  reason: z.enum(["COPYRIGHT", "PERSONAL_DATA", "OFFENSIVE", "OTHER"]),
  description: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { quizId, reason, description } = parsed.data;

  // Check quiz exists
  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz)
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  // Prevent self-reporting
  if (quiz.authorId === session.user.id)
    return NextResponse.json({ error: "Cannot report your own quiz" }, { status: 400 });

  // Rate limiting: max 10 reports per user per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentCount = await prisma.report.count({
    where: {
      reporterId: session.user.id,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentCount >= 10)
    return NextResponse.json({ error: "Too many reports. Try again later." }, { status: 429 });

  try {
    const report = await prisma.report.create({
      data: {
        quizId,
        reporterId: session.user.id,
        reason,
        description: description || null,
      },
    });
    return NextResponse.json(report, { status: 201 });
  } catch (err: any) {
    // Unique constraint violation = already reported
    if (err?.code === "P2002") {
      return NextResponse.json({ error: "Already reported" }, { status: 409 });
    }
    throw err;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/report/route.ts
git commit -m "feat: add report API with rate limiting and self-report prevention"
```

### Task 12: Report Modal Component

**Files:**
- Create: `src/components/legal/report-modal.tsx`

- [ ] **Step 1: Create the report modal**

```typescript
"use client";

import { useState } from "react";
import { Loader2, Flag } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

const REASONS = [
  { value: "COPYRIGHT", label: "Violazione copyright" },
  { value: "PERSONAL_DATA", label: "Contiene dati personali" },
  { value: "OFFENSIVE", label: "Contenuto offensivo" },
  { value: "OTHER", label: "Altro" },
] as const;

interface Props {
  quizId: string;
  onClose: () => void;
}

export function ReportModal({ quizId, onClose }: Props) {
  const [reason, setReason] = useState<string>("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<"success" | "already" | "error" | null>(null);

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    try {
      const res = await fetch(withBasePath("/api/report"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, reason, description: description || undefined }),
      });
      if (res.status === 409) {
        setResult("already");
      } else if (!res.ok) {
        setResult("error");
      } else {
        setResult("success");
      }
    } catch {
      setResult("error");
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center space-y-4">
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {result === "success" && "Segnalazione inviata. Verrà verificata dagli amministratori."}
            {result === "already" && "Hai già segnalato questo quiz."}
            {result === "error" && "Errore nell'invio della segnalazione. Riprova."}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full max-h-[85vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-200 dark:border-slate-700">
          <Flag className="size-5 text-red-500" />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Segnala contenuto
          </h2>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Se ritieni che questo contenuto violi diritti d&apos;autore, contenga
            dati personali o non rispetti le regole della piattaforma puoi
            segnalarlo agli amministratori. Le segnalazioni verranno verificate e,
            se necessario, il contenuto verrà rimosso.
          </p>

          <div className="space-y-2">
            {REASONS.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                  reason === r.value
                    ? "border-indigo-300 bg-indigo-50 dark:bg-indigo-950 dark:border-indigo-700"
                    : "border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
                }`}
              >
                <input
                  type="radio"
                  name="reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {r.label}
                </span>
              </label>
            ))}
          </div>

          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Dettagli aggiuntivi (opzionale)..."
            rows={3}
            className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2.5 text-sm text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
          />
        </div>

        <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || loading}
            className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold hover:bg-red-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="size-4 animate-spin" />}
            Invia segnalazione
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/legal/report-modal.tsx
git commit -m "feat: add report modal component"
```

### Task 13: Add Report Button to Library

**Files:**
- Modify: `src/components/library/library-client.tsx`

- [ ] **Step 1: Add report button to each quiz card**

Import `Flag` from lucide-react and `ReportModal`. Add state for `reportingQuiz`. Add a flag button in the card actions area (next to Play and Duplica). When clicked, show the `ReportModal`.

In the card's action buttons div (line 122), add after the Duplica button:

```typescript
<button
  onClick={() => setReportingQuiz(quiz.id)}
  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 transition-colors"
  title="Segnala contenuto"
>
  <Flag className="h-3.5 w-3.5" />
</button>
```

Add the modal render at bottom:

```typescript
{reportingQuiz && (
  <ReportModal
    quizId={reportingQuiz}
    onClose={() => setReportingQuiz(null)}
  />
)}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/library/library-client.tsx
git commit -m "feat: add report button to public quiz library"
```

---

## Chunk 5: Suspended Quiz Guards

### Task 14: Add Suspension Guards to API Routes

**Files:**
- Modify: `src/app/(dashboard)/dashboard/library/page.tsx`
- Modify: `src/app/api/session/route.ts`
- Modify: `src/app/api/quiz/[id]/route.ts`

- [ ] **Step 1: Filter suspended quizzes from library**

In `src/app/(dashboard)/dashboard/library/page.tsx`, add `suspended: false` to the where clause (line 11):

```typescript
const quizzes = await prisma.quiz.findMany({
  where: {
    isPublic: true,
    suspended: false,
    authorId: { not: session.user.id },
  },
  ...
});
```

- [ ] **Step 2: Block session creation for suspended quizzes**

In `src/app/api/session/route.ts`, after line 30 (quiz not found check), add:

```typescript
if (quiz.suspended)
  return NextResponse.json({ error: "Quiz is suspended" }, { status: 403 });
```

- [ ] **Step 3: Return suspended flag in GET /api/quiz/[id]**

The existing `GET` already returns all quiz fields. Since `suspended` is now a field on the model, it will automatically be included in the response. No code change needed here, but the UI needs to handle it.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/dashboard/library/page.tsx src/app/api/session/route.ts
git commit -m "feat: add suspended quiz guards to library and session API"
```

### Task 15: Show Suspended Badge in Quiz Dashboard

**Files:**
- Modify: `src/components/dashboard/quiz-dashboard.tsx`

- [ ] **Step 1: Add suspended badge to QuizCard**

In the `QuizItem` interface (line 28), add:

```typescript
suspended?: boolean;
```

In the `QuizCard` component, after the title (line 417), add:

```typescript
{quiz.suspended && (
  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 px-2 py-0.5 rounded-md">
    Sospeso
  </span>
)}
```

In the `PlayQuizButton` area (line 462), disable play for suspended quizzes. Wrap with a conditional or pass disabled prop. If `PlayQuizButton` doesn't accept a disabled prop, wrap it:

```typescript
{quiz.suspended ? (
  <span className="flex items-center gap-1.5 text-sm font-medium text-slate-400 p-2" title="Quiz sospeso">
    <Play className="size-4" /> Sospeso
  </span>
) : (
  <PlayQuizButton quizId={quiz.id} />
)}
```

Import `Play` from lucide-react if not already imported.

- [ ] **Step 2: Commit**

```bash
git add src/components/dashboard/quiz-dashboard.tsx
git commit -m "feat: show suspended badge and disable play for suspended quizzes"
```

---

## Chunk 6: Admin Moderation Dashboard

### Task 16: Admin Reports API

**Files:**
- Create: `src/app/api/admin/reports/route.ts`
- Create: `src/app/api/admin/reports/[id]/route.ts`
- Create: `src/app/api/admin/quiz/[id]/suspend/route.ts`

- [ ] **Step 1: Create GET /api/admin/reports**

Create `src/app/api/admin/reports/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const { error, status, session } = await assertAdmin();
  if (error) return NextResponse.json({ error }, { status: status! });

  const statusFilter = req.nextUrl.searchParams.get("status");

  const reports = await prisma.report.findMany({
    where: statusFilter ? { status: statusFilter as any } : undefined,
    include: {
      quiz: { select: { id: true, title: true, authorId: true, author: { select: { name: true, email: true } } } },
      reporter: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(reports);
}
```

- [ ] **Step 2: Create PUT /api/admin/reports/[id]**

Create `src/app/api/admin/reports/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["REVIEWED", "RESOLVED", "DISMISSED"]),
  suspendQuiz: z.boolean().optional(),
  deleteQuiz: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, status, session } = await assertAdmin();
  if (error) return NextResponse.json({ error }, { status: status! });

  const { id } = await params;
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const report = await prisma.report.findUnique({
    where: { id },
    include: { quiz: true },
  });
  if (!report)
    return NextResponse.json({ error: "Report not found" }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.report.update({
      where: { id },
      data: {
        status: parsed.data.status,
        resolvedAt: ["RESOLVED", "DISMISSED"].includes(parsed.data.status) ? new Date() : undefined,
        resolvedBy: ["RESOLVED", "DISMISSED"].includes(parsed.data.status) ? session!.user!.id : undefined,
      },
    });

    if (parsed.data.suspendQuiz && report.quiz) {
      await tx.quiz.update({
        where: { id: report.quiz.id },
        data: { suspended: true },
      });
    }

    if (parsed.data.deleteQuiz && report.quiz) {
      await tx.answer.deleteMany({ where: { session: { quizId: report.quiz.id } } });
      await tx.session.deleteMany({ where: { quizId: report.quiz.id } });
      await tx.quiz.delete({ where: { id: report.quiz.id } });
    }
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Create PUT /api/admin/quiz/[id]/suspend**

Create `src/app/api/admin/quiz/[id]/suspend/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, status } = await assertAdmin();
  if (error) return NextResponse.json({ error }, { status: status! });

  const { id } = await params;
  const { suspended } = await req.json();

  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz)
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  await prisma.quiz.update({
    where: { id },
    data: { suspended: !!suspended },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/
git commit -m "feat: add admin API routes for reports and quiz suspension"
```

### Task 17: Admin Reports Page

**Files:**
- Create: `src/app/(dashboard)/dashboard/admin/reports/page.tsx`
- Create: `src/components/admin/reports-client.tsx`

- [ ] **Step 1: Create admin reports server page**

Create `src/app/(dashboard)/dashboard/admin/reports/page.tsx`:

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { ReportsClient } from "@/components/admin/reports-client";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Segnalazioni</h1>
        <p className="text-muted-foreground">
          Gestisci le segnalazioni di contenuti da parte degli utenti.
        </p>
      </div>
      <ReportsClient />
    </div>
  );
}
```

- [ ] **Step 2: Create reports client component**

Create `src/components/admin/reports-client.tsx`:

```typescript
"use client";

import { useState, useEffect } from "react";
import { Loader2, AlertTriangle, Ban, Archive, Eye, Trash2, RotateCcw } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

interface ReportItem {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  createdAt: string;
  quiz: { id: string; title: string; author: { name: string | null; email: string } };
  reporter: { name: string | null; email: string };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "In attesa", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200" },
  REVIEWED: { label: "Revisionata", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  RESOLVED: { label: "Risolta", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  DISMISSED: { label: "Archiviata", color: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

const REASON_LABELS: Record<string, string> = {
  COPYRIGHT: "Violazione copyright",
  PERSONAL_DATA: "Dati personali",
  OFFENSIVE: "Contenuto offensivo",
  OTHER: "Altro",
};

export function ReportsClient() {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("PENDING");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const url = filter
        ? withBasePath(`/api/admin/reports?status=${filter}`)
        : withBasePath("/api/admin/reports");
      const res = await fetch(url);
      const data = await res.json();
      setReports(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [filter]);

  const handleAction = async (reportId: string, action: {
    status: string;
    suspendQuiz?: boolean;
    deleteQuiz?: boolean;
  }) => {
    if (action.deleteQuiz && !confirm("Sei sicuro di voler eliminare definitivamente questo quiz?")) return;

    setActionLoading(reportId);
    try {
      await fetch(withBasePath(`/api/admin/reports/${reportId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      fetchReports();
    } catch {
      alert("Errore nell'aggiornamento");
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnsuspend = async (quizId: string) => {
    try {
      await fetch(withBasePath(`/api/admin/quiz/${quizId}/suspend`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspended: false }),
      });
      fetchReports();
    } catch {
      alert("Errore");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {["PENDING", "REVIEWED", "RESOLVED", "DISMISSED", ""].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
              filter === s
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            {s ? STATUS_LABELS[s]?.label || s : "Tutte"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-slate-400" />
        </div>
      ) : reports.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          Nessuna segnalazione.
        </p>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div
              key={report.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-white">
                    {report.quiz?.title ?? "Quiz eliminato"}
                  </h3>
                  <p className="text-xs text-slate-500">
                    di {report.quiz?.author?.name ?? "?"} ({report.quiz?.author?.email}) &middot;{" "}
                    Segnalato da {report.reporter?.name ?? "?"} ({report.reporter?.email})
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${STATUS_LABELS[report.status]?.color}`}>
                  {STATUS_LABELS[report.status]?.label}
                </span>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Motivo: <strong>{REASON_LABELS[report.reason] ?? report.reason}</strong>
                </span>
                <span className="text-slate-400">
                  {new Date(report.createdAt).toLocaleDateString("it-IT", {
                    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
                  })}
                </span>
              </div>

              {report.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                  {report.description}
                </p>
              )}

              {report.status === "PENDING" && (
                <div className="flex gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => handleAction(report.id, { status: "REVIEWED" })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950 transition-colors"
                  >
                    <Eye className="size-3.5" /> Segna come revisionata
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "RESOLVED", suspendQuiz: true })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950 transition-colors"
                  >
                    <Ban className="size-3.5" /> Sospendi quiz
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "DISMISSED" })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Archive className="size-3.5" /> Archivia
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "RESOLVED", deleteQuiz: true })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
                  >
                    <Trash2 className="size-3.5" /> Elimina quiz
                  </button>
                </div>
              )}

              {report.status === "REVIEWED" && (
                <div className="flex gap-2 flex-wrap pt-1">
                  <button
                    onClick={() => handleAction(report.id, { status: "RESOLVED", suspendQuiz: true })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950 transition-colors"
                  >
                    <Ban className="size-3.5" /> Sospendi quiz
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "DISMISSED" })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Archive className="size-3.5" /> Archivia
                  </button>
                  <button
                    onClick={() => handleAction(report.id, { status: "RESOLVED", deleteQuiz: true })}
                    disabled={actionLoading === report.id}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950 transition-colors"
                  >
                    <Trash2 className="size-3.5" /> Elimina quiz
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update sidebar with admin reports link**

The sidebar already has an "Admin" link at `/dashboard/admin` for ADMIN users (line 43). If there is already an admin page, add reports as a sub-route. If not, the sidebar link already works — just make sure `/dashboard/admin` redirects to `/dashboard/admin/reports`.

Create `src/app/(dashboard)/dashboard/admin/page.tsx`:

```typescript
import { redirect } from "next/navigation";

export default function AdminPage() {
  redirect("/dashboard/admin/reports");
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/dashboard/admin/ src/components/admin/
git commit -m "feat: add admin reports dashboard with moderation actions"
```

---

## Chunk 7: Static Legal Pages

### Task 18: Terms & Privacy Pages

**Files:**
- Create: `src/app/(legal)/terms/page.tsx`
- Create: `src/app/(legal)/privacy/page.tsx`
- Create: `src/app/(legal)/layout.tsx`

- [ ] **Step 1: Create legal layout**

Create `src/app/(legal)/layout.tsx`:

```typescript
import Link from "next/link";
import { withBasePath } from "@/lib/base-path";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-8 h-8 object-contain" />
            <span className="text-lg font-extrabold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              SAVINT
            </span>
          </Link>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create terms page**

Create `src/app/(legal)/terms/page.tsx`:

```typescript
export default function TermsPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <h1>Regole della piattaforma</h1>

      <h2>Regole sui contenuti</h2>
      <p>Gli utenti si impegnano a non pubblicare:</p>
      <ul>
        <li>contenuti copiati da libri di testo o materiali editoriali protetti da copyright</li>
        <li>dati personali di studenti o altre persone</li>
        <li>contenuti offensivi, discriminatori o illegali</li>
      </ul>
      <p>
        L&apos;amministratore della piattaforma si riserva il diritto di rimuovere
        contenuti che violino queste regole o le normative vigenti.
      </p>

      <h2>Rimozione dei contenuti</h2>
      <p>
        La piattaforma agisce come servizio di hosting dei contenuti caricati dagli utenti.
      </p>
      <p>
        Qualora venga segnalata una violazione di legge o dei diritti di terzi, i contenuti
        potranno essere rimossi senza preavviso.
      </p>

      <h2>Licenze dei contenuti</h2>
      <p>
        I quiz pubblicati su questa piattaforma sono condivisi per scopi didattici.
        Gli autori possono scegliere tra le seguenti licenze:
      </p>
      <ul>
        <li>
          <strong>Creative Commons Attribution (CC BY)</strong> — Permette a chiunque di
          copiare, distribuire e modificare il contenuto, anche a fini commerciali,
          a condizione che venga attribuito il merito all&apos;autore originale.
        </li>
        <li>
          <strong>Creative Commons Attribution-ShareAlike (CC BY-SA)</strong> — Come CC BY,
          ma le opere derivate devono essere distribuite con la stessa licenza.
        </li>
      </ul>
    </article>
  );
}
```

- [ ] **Step 3: Create privacy page**

Create `src/app/(legal)/privacy/page.tsx`:

```typescript
export default function PrivacyPage() {
  return (
    <article className="prose prose-slate dark:prose-invert max-w-none">
      <h1>Informativa sulla privacy</h1>

      <p>
        <em>Ultimo aggiornamento: marzo 2026</em>
      </p>

      <h2>Dati raccolti</h2>
      <p>
        Quando accedi alla piattaforma tramite il tuo account Google, raccogliamo
        le seguenti informazioni:
      </p>
      <ul>
        <li>Nome e cognome</li>
        <li>Indirizzo email</li>
        <li>Immagine del profilo Google</li>
      </ul>

      <h2>Finalità del trattamento</h2>
      <p>I dati raccolti sono utilizzati esclusivamente per:</p>
      <ul>
        <li>Consentire l&apos;accesso alla piattaforma</li>
        <li>Attribuire la paternità dei quiz pubblicati</li>
        <li>Gestire le sessioni di gioco</li>
      </ul>

      <h2>Conservazione dei dati</h2>
      <p>
        I dati vengono conservati per tutta la durata dell&apos;utilizzo della piattaforma.
        Puoi richiedere la cancellazione del tuo account e dei dati associati
        contattando l&apos;amministratore.
      </p>

      <h2>Diritti dell&apos;utente</h2>
      <p>Hai il diritto di:</p>
      <ul>
        <li>Accedere ai tuoi dati personali</li>
        <li>Richiedere la rettifica dei dati inesatti</li>
        <li>Richiedere la cancellazione dei tuoi dati</li>
        <li>Opporti al trattamento dei dati</li>
      </ul>

      <p>
        <strong>Nota:</strong> Questa informativa è un documento preliminare.
        Si consiglia di farla revisionare da un professionista legale prima
        dell&apos;utilizzo in produzione.
      </p>
    </article>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/(legal)/
git commit -m "feat: add static terms and privacy pages"
```

---

## Chunk 8: Final Integration & Verification

### Task 19: Build Verification

- [ ] **Step 1: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 3: Fix any issues found**

Address any type errors or build failures discovered in steps 1-2.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: resolve any build issues from legal compliance feature"
```

### Task 20: Manual Smoke Test Checklist

Verify these scenarios work:

- [ ] **Step 1:** Login with Google → Terms acceptance modal appears → Accept → Dashboard accessible
- [ ] **Step 2:** Create a new quiz → Click Salva → Declaration modal appears → Select license → Confirm → Quiz saved
- [ ] **Step 3:** Edit an existing quiz → Click Salva → Declaration modal appears → Confirm → Quiz updated
- [ ] **Step 4:** Go to Library → Flag button visible on other users' quizzes → Submit report → Confirmation shown
- [ ] **Step 5:** As admin, go to Dashboard → Admin → Reports → See report → Suspend quiz → Quiz marked as suspended
- [ ] **Step 6:** As quiz author, see "Sospeso" badge on dashboard → Cannot start game session
- [ ] **Step 7:** Visit /savint/terms and /savint/privacy → Pages render correctly
- [ ] **Step 8:** Duplicate a quiz from library → Declaration modal appears → Confirm → Quiz duplicated
