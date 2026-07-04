# Miglioramenti flusso di pubblicazione — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere raggiungibile la riconnessione quando l'autorizzazione all'hub è revocata, ricordare i metadati di pubblicazione per-utente, e calcolare la durata del quiz automaticamente.

**Architecture:** Nuovo modello `PublishDefaults` (per-utente, lato installazione) salvato al publish e riletto per precompilare la modale; `estimatedDurationSec` reso opzionale nello schema e calcolato dalla somma dei `timeLimit` delle domande; la `PublishModal` mostra un bottone di riconnessione quando arriva `reauth_required` e tratta un link revocato come non collegato.

**Tech Stack:** Next.js (server components + client modal), Prisma, Zod, next-intl, vitest.

## Global Constraints

- Una sola migrazione additiva (`PublishDefaults`); nessuna modifica a modelli esistenti.
- Le preferenze sono per-utente sull'**installazione**, non condivise con l'hub.
- La durata mostrata è `Σ question.timeLimit` (secondi) calcolata lato server.
- i18n in **entrambe** le lingue (`it.json`/`en.json`, parità chiavi).
- Guardrail per task: `npm run lint` + `npx tsc --noEmit` + `npm run test:run` verdi (falliscono solo i pre-esistenti sotto `.worktrees/`); `npm run build` a fine.
- Branch `publish-flow-improvements`; un commit per task; trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: Modello `PublishDefaults` + migrazione

**Files:**
- Modify: `prisma/schema.prisma` (model `User` + nuovo model `PublishDefaults`)
- Test: `src/lib/hub/__tests__/publish-defaults.test.ts`

**Interfaces:**
- Produces: tabella `PublishDefaults` (`userId` PK/unique, `schoolLevel?`, `subject?`, `language?`, `ageMin?`, `ageMax?`, `updatedAt`) + relazione `User.publishDefaults`.

- [ ] **Step 1: Aggiungere il modello e la relazione**

In `prisma/schema.prisma`, dentro `model User { ... }` aggiungere (accanto a `hubLink HubLink?`):

```prisma
  publishDefaults PublishDefaults?
```

In fondo (dopo il model `HubLink`), aggiungere:

```prisma
model PublishDefaults {
  userId      String   @id
  schoolLevel String?
  subject     String?
  language    String?
  ageMin      Int?
  ageMax      Int?
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

- [ ] **Step 2: Creare la migrazione + client**

Run:
```bash
npx prisma migrate dev --name add_publish_defaults
```
Expected: crea `prisma/migrations/*_add_publish_defaults/migration.sql` e rigenera il client senza errori.

- [ ] **Step 3: Smoke test del modello**

Create `src/lib/hub/__tests__/publish-defaults.test.ts`:

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

const rid = () => Math.random().toString(36).slice(2);
const userIds: string[] = [];

async function user() {
  const u = await prisma.user.create({ data: { email: `u-${rid()}@x.it`, name: "U" } });
  userIds.push(u.id);
  return u;
}
afterAll(async () => { await prisma.user.deleteMany({ where: { id: { in: userIds } } }); });

describe("PublishDefaults model", () => {
  it("upsert crea e poi aggiorna", async () => {
    const u = await user();
    await prisma.publishDefaults.upsert({
      where: { userId: u.id },
      create: { userId: u.id, schoolLevel: "PRIMARIA", subject: "matematica", language: "it" },
      update: {},
    });
    let row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row?.subject).toBe("matematica");
    await prisma.publishDefaults.upsert({
      where: { userId: u.id },
      create: { userId: u.id },
      update: { subject: "storia" },
    });
    row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row?.subject).toBe("storia");
  });
});
```

- [ ] **Step 4: Run → PASS** (`npx vitest run src/lib/hub/__tests__/publish-defaults.test.ts`).
- [ ] **Step 5: Commit** `feat(publish): modello PublishDefaults + migrazione`.

---

### Task 2: `estimatedDurationSec` opzionale nello schema

**Files:**
- Modify: `src/lib/hub/quiz-metadata.ts`
- Test: `src/lib/hub/__tests__/quiz-metadata.test.ts`

**Interfaces:**
- Produces: `publishMetadataSchema` che accetta payload **senza** `estimatedDurationSec`.

- [ ] **Step 1: Test**

Create `src/lib/hub/__tests__/quiz-metadata.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { publishMetadataSchema } from "../quiz-metadata";

const base = { title: "t", schoolLevel: "PRIMARIA", subject: "matematica", language: "it" } as const;

describe("publishMetadataSchema", () => {
  it("accetta payload senza estimatedDurationSec", () => {
    expect(publishMetadataSchema.safeParse(base).success).toBe(true);
  });
  it("accetta ancora un estimatedDurationSec valido", () => {
    expect(publishMetadataSchema.safeParse({ ...base, estimatedDurationSec: 300 }).success).toBe(true);
  });
  it("rifiuta un estimatedDurationSec fuori range", () => {
    expect(publishMetadataSchema.safeParse({ ...base, estimatedDurationSec: 5 }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL** (il primo caso fallisce: campo required).

- [ ] **Step 3: Rendere opzionale**

In `src/lib/hub/quiz-metadata.ts` cambiare la riga:

```ts
    estimatedDurationSec: z.number().int().min(10).max(86400),
```
in:
```ts
    estimatedDurationSec: z.number().int().min(10).max(86400).optional(),
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(publish): estimatedDurationSec opzionale (calcolo lato server)`.

---

### Task 3: Salvare i default al publish riuscito

**Files:**
- Create: `src/lib/hub/publish-defaults.ts`
- Modify: `src/app/api/hub/quiz/[id]/publish/route.ts`
- Test: `src/lib/hub/__tests__/publish-defaults.test.ts` (estendere)

**Interfaces:**
- Consumes: `PublishMetadata` (Task 2), `prisma.publishDefaults` (Task 1).
- Produces: `savePublishDefaults(userId: string, m: { schoolLevel?; subject?; language?; ageMin?; ageMax? }): Promise<void>`.

- [ ] **Step 1: Test dell'helper** (aggiungere in `publish-defaults.test.ts`)

```ts
import { savePublishDefaults } from "../publish-defaults";

describe("savePublishDefaults", () => {
  it("salva e sovrascrive i default dell'utente", async () => {
    const u = await user();
    await savePublishDefaults(u.id, { schoolLevel: "SECONDARIA_I", subject: "storia", language: "it", ageMin: 11, ageMax: 13 });
    let row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row).toMatchObject({ schoolLevel: "SECONDARIA_I", subject: "storia", language: "it", ageMin: 11, ageMax: 13 });
    await savePublishDefaults(u.id, { schoolLevel: "UNIVERSITA", subject: "matematica", language: "en" });
    row = await prisma.publishDefaults.findUnique({ where: { userId: u.id } });
    expect(row).toMatchObject({ schoolLevel: "UNIVERSITA", subject: "matematica", language: "en", ageMin: null, ageMax: null });
  });
});
```

- [ ] **Step 2: Run → FAIL** (modulo helper inesistente).

- [ ] **Step 3: Implementare l'helper**

Create `src/lib/hub/publish-defaults.ts`:

```ts
import { prisma } from "@/lib/db/client";

export type PublishDefaultsInput = {
  schoolLevel?: string;
  subject?: string;
  language?: string;
  ageMin?: number;
  ageMax?: number;
};

/** Persist the metadata just used to publish as the user's defaults (best-effort). */
export async function savePublishDefaults(userId: string, m: PublishDefaultsInput): Promise<void> {
  const data = {
    schoolLevel: m.schoolLevel ?? null,
    subject: m.subject ?? null,
    language: m.language ?? null,
    ageMin: m.ageMin ?? null,
    ageMax: m.ageMax ?? null,
  };
  await prisma.publishDefaults.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
}
```

- [ ] **Step 4: Wire nella route** — in `src/app/api/hub/quiz/[id]/publish/route.ts`:

Aggiungere l'import in cima:
```ts
import { savePublishDefaults } from "@/lib/hub/publish-defaults";
```

Nel `POST`, subito dopo `await prisma.quiz.update({ ... })` (aggiornamento di `hubPublishedId`) e prima di `return NextResponse.json(body);`, inserire:
```ts
  // Ricorda i metadati usati come default dell'utente (non bloccare il publish).
  try {
    await savePublishDefaults(session.user.id, {
      schoolLevel: metadata.data.schoolLevel,
      subject: metadata.data.subject,
      language: metadata.data.language,
      ageMin: metadata.data.ageMin,
      ageMax: metadata.data.ageMax,
    });
  } catch {
    // ignore
  }
```

- [ ] **Step 5: Run → PASS** (`npx vitest run src/lib/hub/__tests__/publish-defaults.test.ts`).
- [ ] **Step 6: Commit** `feat(publish): salva i metadati come default utente al publish`.

---

### Task 4: Passare default, durata e stato revoca dalla pagina al form

**Files:**
- Modify: `src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx`
- Modify: `src/components/quiz/quiz-editor.tsx`
- Modify: `src/components/hub/publish-button.tsx`

**Interfaces:**
- Produces (verso `PublishModal`, Task 5): props `defaults?: PublishDefaultsClient | null`, `revoked?: boolean`, `estimatedDurationSec?: number`, dove
  `type PublishDefaultsClient = { schoolLevel: string | null; subject: string | null; language: string | null; ageMin: number | null; ageMax: number | null }`.

- [ ] **Step 1: Pagina — caricare dati e calcolare durata**

In `src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx`:

Sostituire il blocco `const hubLink = await prisma.hubLink.findUnique({ ... select: { hubAccountEmail: true } });` con:
```ts
  const hubLink = await prisma.hubLink.findUnique({
    where: { userId: session.user.id },
    select: { hubAccountEmail: true, revokedAt: true },
  });
  const publishDefaults = await prisma.publishDefaults.findUnique({
    where: { userId: session.user.id },
  });
  const estimatedDurationSec = quiz.questions.reduce((s, q) => s + q.timeLimit, 0);
```

Aggiornare il render di `<QuizEditor ... />` così:
```tsx
    <QuizEditor
      initialData={initialData}
      hasConsent={hasConsent}
      hubEnabled={await hasHubOAuthConfig()}
      hubLink={hubLink ? { hubAccountEmail: hubLink.hubAccountEmail } : null}
      hubLinkRevoked={Boolean(hubLink?.revokedAt)}
      publishDefaults={publishDefaults}
      estimatedDurationSec={estimatedDurationSec}
    />
```

- [ ] **Step 2: QuizEditor — estendere i Props e inoltrare**

In `src/components/quiz/quiz-editor.tsx`, nell'`interface Props` (righe ~36-41) aggiungere:
```ts
  hubLinkRevoked?: boolean;
  publishDefaults?: {
    schoolLevel: string | null;
    subject: string | null;
    language: string | null;
    ageMin: number | null;
    ageMax: number | null;
  } | null;
  estimatedDurationSec?: number;
```
Aggiungere questi nomi alla destrutturazione dei props della funzione (dove già compaiono `initialData, hasConsent, hubEnabled, hubLink`).

Nel punto in cui è reso `<PublishButton hubEnabled={...} quiz={{...}} />` (riga ~407), aggiungere i prop dopo `quiz={{...}}`:
```tsx
              link={hubLink}
              revoked={hubLinkRevoked}
              defaults={publishDefaults}
              estimatedDurationSec={estimatedDurationSec ?? 0}
```
(Se `link={hubLink}` è già presente, lasciarne una sola occorrenza.)

- [ ] **Step 3: PublishButton — accettare e inoltrare i nuovi prop**

Sostituire `src/components/hub/publish-button.tsx` con:
```tsx
"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { PublishModal } from "@/components/hub/publish-modal";

type Props = {
  hubEnabled: boolean;
  quiz: Parameters<typeof PublishModal>[0]["quiz"];
  link: { hubAccountEmail: string } | null;
  revoked?: boolean;
  defaults?: Parameters<typeof PublishModal>[0]["defaults"];
  estimatedDurationSec?: number;
};

export function PublishButton({ hubEnabled, quiz, link, revoked, defaults, estimatedDurationSec }: Props) {
  const t = useTranslations("hub.publish");
  const [open, setOpen] = useState(false);
  if (!hubEnabled) return null;
  const label = quiz.hubPublishedId ? t("titleUpdate") : t("title");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm text-white"
      >
        {label}
      </button>
      <PublishModal
        open={open}
        quiz={quiz}
        link={link}
        revoked={revoked}
        defaults={defaults}
        estimatedDurationSec={estimatedDurationSec ?? 0}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

- [ ] **Step 4: Verifica** `npx tsc --noEmit` — atteso: pulito **dopo** che Task 5 aggiunge i prop a `PublishModal`. Se eseguito prima di Task 5, l'unico errore atteso riguarda i prop mancanti su `PublishModal` (verrà risolto in Task 5).
- [ ] **Step 5: Commit** `feat(publish): inoltra default/durata/revoca alla modale`.

---

### Task 5: PublishModal — riconnessione, durata calcolata, precompilazione

**Files:**
- Modify: `src/components/hub/publish-modal.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Modify: `src/components/hub/__tests__/publish-modal.test.tsx` (adeguare se rompe)

**Interfaces:**
- Consumes: prop `defaults`, `revoked`, `estimatedDurationSec` (Task 4).

- [ ] **Step 1: i18n** — in `hub.publish` (IT e EN) aggiungere:

IT:
```json
"reauthCta": "Riconnetti a savint.it",
"reauthIntro": "L'autorizzazione a savint.it è scaduta o è stata revocata. Riconnettiti per pubblicare.",
"durationComputed": "Durata stimata: ~{min} min (calcolata dalle domande)"
```
EN:
```json
"reauthCta": "Reconnect to savint.it",
"reauthIntro": "Your savint.it authorization expired or was revoked. Reconnect to publish.",
"durationComputed": "Estimated duration: ~{min} min (computed from questions)"
```

- [ ] **Step 2: Estendere i Props e lo stato di `PublishModal`**

In `src/components/hub/publish-modal.tsx`:

Aggiungere ai `type Props` (dopo `link`):
```ts
  revoked?: boolean;
  defaults?: {
    schoolLevel: string | null;
    subject: string | null;
    language: string | null;
    ageMin: number | null;
    ageMax: number | null;
  } | null;
  estimatedDurationSec: number;
```
Aggiornare la firma: `export function PublishModal({ open, quiz, link, revoked, defaults, estimatedDurationSec, onClose, onSuccess }: Props) {`.

Cambiare i seed di stato per usare i default:
```ts
  const [schoolLevel, setSchoolLevel] = useState(quiz.schoolLevel ?? defaults?.schoolLevel ?? "");
  const [subject, setSubject] = useState(quiz.subject ?? defaults?.subject ?? "");
  const [language, setLanguage] = useState(quiz.language ?? defaults?.language ?? "");
  const [ageMin, setAgeMin] = useState<number | "">(quiz.ageMin ?? defaults?.ageMin ?? "");
  const [ageMax, setAgeMax] = useState<number | "">(quiz.ageMax ?? defaults?.ageMax ?? "");
```
Rimuovere lo stato `estimatedDuration` (`const [estimatedDuration, setEstimatedDuration] = useState("");`) e aggiungere lo stato per la riconnessione:
```ts
  const [reauthUrl, setReauthUrl] = useState<string | null>(null);
```

- [ ] **Step 3: Non inviare più la durata; gestire il reauthUrl**

Nel corpo di `handleSubmit`, rimuovere la riga:
```ts
      if (estimatedDuration !== "") body.estimatedDurationSec = Number(estimatedDuration);
```
Nel ramo d'errore, sostituire:
```ts
        if (data?.error === "reauth_required") {
          setError(t("errorReauth"));
        } else if (data?.error === "quota_exceeded") {
```
con:
```ts
        if (data?.error === "reauth_required") {
          setReauthUrl(withBasePath(data?.reauthUrl ?? "/account/hub-link"));
        } else if (data?.error === "quota_exceeded") {
```

- [ ] **Step 4: Mostrare il CTA di riconnessione (revoca o dopo errore)**

Cambiare la condizione del ramo "not linked". Sostituire `{!link ? (` con `{(!link || revoked || reauthUrl) ? (` e sostituire il contenuto di quel blocco con:
```tsx
          <div className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {(revoked || reauthUrl) ? t("reauthIntro") : t("connectAccountIntro")}
            </p>
            <a
              href={reauthUrl ?? withBasePath("/account/hub-link")}
              className="inline-block rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
            >
              {(revoked || reauthUrl) ? t("reauthCta") : t("connectAccountCta")}
            </a>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                {t("cancel")}
              </button>
            </div>
          </div>
```

- [ ] **Step 5: Sostituire il campo durata con una riga read-only**

Rimuovere l'intero blocco `<div>` del campo durata (label `t("estimatedDuration")` + `<input ... value={estimatedDuration} ...>`). Al suo posto inserire:
```tsx
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("durationComputed", { min: Math.max(1, Math.round(estimatedDurationSec / 60)) })}
            </p>
```

- [ ] **Step 6: Adeguare il test della modale**

Run: `npx vitest run src/components/hub/__tests__/publish-modal.test.tsx`.
Se fallisce perché il render passa props ora richiesti, aggiornare i render nel test aggiungendo `estimatedDurationSec={600}` (e, se un caso verifica il vecchio campo durata o il testo `errorReauth`, sostituirlo: per la revoca il test deve ora aspettarsi il bottone con testo `reauthCta`). Mantenere verdi i casi esistenti adattandoli al nuovo comportamento.

- [ ] **Step 7: Verifica finale** `npm run lint && npx tsc --noEmit && npm run test:run && npm run build` verdi; parità i18n:
```bash
node -e "for(const k of ['reauthCta','reauthIntro','durationComputed']){const it=require('./src/messages/it.json').hub.publish[k],en=require('./src/messages/en.json').hub.publish[k];if(!it||!en)throw new Error('manca '+k);}console.log('i18n OK')"
```
- [ ] **Step 8: Commit** `feat(publish): riconnessione visibile, durata calcolata, precompilazione default`.

## Self-review (autore del piano)

- **Copertura spec**: riconnessione (Task 5 step 3-4) + revoca all'apertura (step 4); default DB (Task 1 modello, Task 3 salvataggio, Task 4-5 precompilazione); durata (Task 2 schema, Task 5 step 3+5 UI). Caveat hub-disabled: documentato nello spec, nessun task (fuori scope).
- **Placeholder**: nessuno; codice completo per schema, helper, route, pagina, editor, button, modale, i18n, test.
- **Coerenza tipi**: `savePublishDefaults(userId, {schoolLevel?,subject?,language?,ageMin?,ageMax?})` usato in Task 3; `PublishDefaultsClient` (`{schoolLevel,subject,language,ageMin,ageMax}` tutti `string|null`/`number|null`) coerente tra pagina→editor→button→modale; `estimatedDurationSec: number` richiesto in modale, con default `?? 0` in button, sempre passato dalla pagina. `reauthUrl` da `getAuthorizeUrl` = `/api/hub/oauth/start?quizId=…`, reso con `withBasePath`.
- **Nota d'ordine**: Task 4 introduce prop su `PublishModal` che esistono solo dopo Task 5 → `tsc` è pulito solo a valle di Task 5 (annotato nel Task 4 Step 4). In esecuzione sequenziale 1→5 il commit di Task 4 può avere un tsc rosso transitorio; accettabile perché i test unitari dei task backend restano verdi e Task 5 chiude.
