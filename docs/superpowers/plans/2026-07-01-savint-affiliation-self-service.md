# Affiliazione self-service scuole — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una scuola richiede l'affiliazione a savint.it dal sito, un `HUB_ADMIN` approva, la scuola riceve un codice di setup monouso via email e la sua installazione si auto-configura (ottiene e salva clientId/secret) incollando il codice.

**Architecture:** Nuovo modello `AffiliationRequest` (hub) traccia richiesta→verifica email→approvazione→codice→redeem, riusando `Installation`, `HUB_ADMIN`, SMTP e rate-limit esistenti. Nuovo modello `HubConfig` (installazione) memorizza le credenziali ottenute; `oauth-config.ts` diventa async e legge DB→env così l'auto-config funziona senza toccare `.env`.

**Tech Stack:** Next.js 16 App Router (route handlers + server components), Prisma/Postgres, next-intl, nodemailer, vitest (integration test su DB reale), bcryptjs, node:crypto.

## Global Constraints

- Spec di riferimento: `docs/superpowers/specs/2026-07-01-savint-affiliation-self-service-design.md`. Scope = **MVP** (no revoca self-service, no riemissione codice, no verifica dominio automatica).
- **Segreti**: `clientSecret` generato come `randomBytes(32).toString("base64url")`, hashato con `hashPassword` (bcrypt cost 12) da `@/lib/auth/password`; `clientId` = `"inst_" + randomBytes(16).toString("hex")` (mirroring `scripts/register-installation.ts`).
- **Token/codici opachi**: generati con `randomBytes(...).toString("hex"|"base64url")` e salvati **solo come hash SHA-256** (`createHash("sha256").update(x).digest("hex")`), mai in chiaro nel DB. Pattern esistente: `@/lib/hub/token-hash` (`generateOpaqueToken`, `hashToken`).
- **Email**: `sendEmail({ to, subject, text, html? })` da `@/lib/email/send`. Nei test va mockato: `vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => undefined) }))`.
- **Guardie**: API admin → `requireHubAdmin(req)` da `@/lib/auth/require-hub-admin` (ritorna `{ ok:false, response }` o `{ ok:true, account }`). Pagine admin → `getHubSessionFromCookies()` da `@/lib/auth/hub-session` + `if (account?.role !== "HUB_ADMIN") redirect("/")`.
- **Rate-limit**: `hubRateLimit({ key, windowSeconds, max })` da `@/lib/rate-limit/hub-rate-limit` → `{ allowed, retryAfterSeconds? }`; nei test resettare con `resetRateLimitsByPrefix("<prefix>")`.
- **Test**: integration su **DB reale** (nessun mock di prisma); import diretto degli handler (`import { POST } from "@/app/api/hub/affiliation/request/route"`); richieste con `new NextRequest("http://localhost/...", { method, headers, body })`; cleanup in `afterAll` con delete prisma; mock di `getHubSession`/`getHubSessionFromCookies` e `sendEmail` dove serve.
- **Migrazioni**: `npx prisma migrate dev --name <nome>` in locale; in produzione `docker/docker-entrypoint.sh` esegue `prisma migrate deploy`.
- **Rotta pubblica**: `/affiliazione` (IT). **Route esistenti gated dal middleware**: gli endpoint hub-only (`/api/hub/*`) e le pagine sono già gestiti; gli endpoint chiamati **dall'installazione** verso il proprio server (`/api/installation/*`) NON devono essere bloccati dal middleware hub-only (verificare `src/middleware.ts`).

---

## File Structure

**Hub (savint.it):**
- `prisma/schema.prisma` — `AffiliationStatus` enum, `AffiliationRequest` model, `HubConfig` model (+ migration).
- `src/lib/affiliation/provinces.ts` — costante province italiane + helper.
- `src/lib/affiliation/schema.ts` — zod schema del form richiesta.
- `src/lib/hub/affiliation.ts` — logica di dominio (create/verify/approve/redeem).
- `src/lib/email/affiliation-emails.ts` — testi email (conferma, codice, rifiuto).
- `src/app/api/hub/affiliation/request/route.ts` — POST richiesta.
- `src/app/api/hub/affiliation/verify/route.ts` — GET conferma email.
- `src/app/api/hub/affiliation/[id]/approve/route.ts` — POST approva (admin).
- `src/app/api/hub/affiliation/[id]/reject/route.ts` — POST rifiuta (admin).
- `src/app/api/hub/affiliation/redeem/route.ts` — POST redeem (server-to-server).
- `src/app/(hub)/affiliazione/page.tsx` + `affiliation-form.tsx` — pagina pubblica richiesta.
- `src/app/admin/hub/affiliations/page.tsx` + `affiliation-actions.tsx` — pannello admin.

**Installazione (scuola):**
- `src/lib/hub/oauth-config.ts` — reso async, legge `HubConfig` (DB) → env.
- `src/app/api/installation/hub/connect/route.ts` — POST: redime il codice e salva `HubConfig`.
- `src/app/(app)/account/hub-link/setup-code-form.tsx` — client component per incollare il codice.
- `src/app/(app)/account/hub-link/page.tsx` — mostra il form quando non collegato.

**i18n:** `src/messages/it.json` + `src/messages/en.json` — namespace `affiliation`.

---

## Task 1: Data models + migration

**Files:**
- Modify: `prisma/schema.prisma` (aggiungere enum + 2 model)
- Test: `src/lib/hub/__tests__/affiliation-models.test.ts`

**Interfaces:**
- Produces: modelli Prisma `AffiliationRequest` (campi sotto), `HubConfig`, enum `AffiliationStatus`.

- [ ] **Step 1: Aggiungi enum + model in `prisma/schema.prisma`** (in fondo al file)

```prisma
enum AffiliationStatus {
  PENDING_EMAIL
  PENDING_REVIEW
  APPROVED
  REDEEMED
  REJECTED
}

model AffiliationRequest {
  id                     String            @id @default(cuid())
  schoolName             String
  province               String
  installationUrl        String
  contactEmail           String
  status                 AffiliationStatus @default(PENDING_EMAIL)
  emailVerifyTokenHash   String?
  emailVerifiedAt        DateTime?
  reviewedByHubAccountId String?
  reviewedAt             DateTime?
  rejectionReason        String?
  installationId         String?           @unique
  setupCodeHash          String?
  setupCodeExpiresAt     DateTime?
  redeemedAt             DateTime?
  pendingClientId        String?
  pendingClientSecret    String?
  createdAt              DateTime          @default(now())
  updatedAt              DateTime          @updatedAt

  @@index([status])
  @@index([contactEmail])
}

model HubConfig {
  id           String   @id @default("singleton")
  clientId     String
  clientSecret String
  hubUrl       String
  connectedAt  DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

> `HubConfig.id` ha default `"singleton"`: singola riga garantita via `upsert({ where: { id: "singleton" }, ... })`.

- [ ] **Step 2: Genera la migrazione**

Run: `npx prisma migrate dev --name affiliation_self_service`
Expected: crea `prisma/migrations/<ts>_affiliation_self_service/` e applica; `prisma generate` aggiorna il client.

- [ ] **Step 3: Scrivi il test di integrazione (crea+leggi)**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";

describe("AffiliationRequest model", () => {
  const ids: string[] = [];
  afterAll(async () => { await prisma.affiliationRequest.deleteMany({ where: { id: { in: ids } } }); });

  it("crea una richiesta con default PENDING_EMAIL", async () => {
    const r = await prisma.affiliationRequest.create({
      data: { schoolName: "IIS Test", province: "UD", installationUrl: "https://quiz.test.edu.it", contactEmail: "t@test.edu.it" },
    });
    ids.push(r.id);
    expect(r.status).toBe("PENDING_EMAIL");
  });
});
```

- [ ] **Step 4: Esegui il test**

Run: `npx vitest run src/lib/hub/__tests__/affiliation-models.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations src/lib/hub/__tests__/affiliation-models.test.ts
git commit -m "feat(affiliation): modelli AffiliationRequest + HubConfig e migrazione"
```

---

## Task 2: Province italiane + schema di validazione richiesta

**Files:**
- Create: `src/lib/affiliation/provinces.ts`
- Create: `src/lib/affiliation/schema.ts`
- Test: `src/lib/affiliation/__tests__/schema.test.ts`

**Interfaces:**
- Produces: `PROVINCES: { code: string; name: string }[]`, `PROVINCE_CODES: Set<string>`; `affiliationRequestSchema` (zod) con `{ schoolName, province, installationUrl, contactEmail }`.

- [ ] **Step 1: Crea `provinces.ts`** (110 province; sigla + nome). Includi TUTTE le sigle ISTAT. Estratto iniziale — completare l'elenco:

```ts
export const PROVINCES: { code: string; name: string }[] = [
  { code: "AG", name: "Agrigento" }, { code: "AL", name: "Alessandria" },
  { code: "AN", name: "Ancona" }, { code: "AO", name: "Aosta" },
  { code: "AR", name: "Arezzo" }, { code: "AP", name: "Ascoli Piceno" },
  { code: "AT", name: "Asti" }, { code: "AV", name: "Avellino" },
  { code: "BA", name: "Bari" }, { code: "BT", name: "Barletta-Andria-Trani" },
  { code: "BL", name: "Belluno" }, { code: "BN", name: "Benevento" },
  { code: "BG", name: "Bergamo" }, { code: "BI", name: "Biella" },
  { code: "BO", name: "Bologna" }, { code: "BZ", name: "Bolzano" },
  { code: "BS", name: "Brescia" }, { code: "BR", name: "Brindisi" },
  { code: "CA", name: "Cagliari" }, { code: "CL", name: "Caltanissetta" },
  { code: "CB", name: "Campobasso" }, { code: "CE", name: "Caserta" },
  { code: "CT", name: "Catania" }, { code: "CZ", name: "Catanzaro" },
  { code: "CH", name: "Chieti" }, { code: "CO", name: "Como" },
  { code: "CS", name: "Cosenza" }, { code: "CR", name: "Cremona" },
  { code: "KR", name: "Crotone" }, { code: "CN", name: "Cuneo" },
  { code: "EN", name: "Enna" }, { code: "FM", name: "Fermo" },
  { code: "FE", name: "Ferrara" }, { code: "FI", name: "Firenze" },
  { code: "FG", name: "Foggia" }, { code: "FC", name: "Forlì-Cesena" },
  { code: "FR", name: "Frosinone" }, { code: "GE", name: "Genova" },
  { code: "GO", name: "Gorizia" }, { code: "GR", name: "Grosseto" },
  { code: "IM", name: "Imperia" }, { code: "IS", name: "Isernia" },
  { code: "AQ", name: "L'Aquila" }, { code: "SP", name: "La Spezia" },
  { code: "LT", name: "Latina" }, { code: "LE", name: "Lecce" },
  { code: "LC", name: "Lecco" }, { code: "LI", name: "Livorno" },
  { code: "LO", name: "Lodi" }, { code: "LU", name: "Lucca" },
  { code: "MC", name: "Macerata" }, { code: "MN", name: "Mantova" },
  { code: "MS", name: "Massa-Carrara" }, { code: "MT", name: "Matera" },
  { code: "ME", name: "Messina" }, { code: "MI", name: "Milano" },
  { code: "MO", name: "Modena" }, { code: "MB", name: "Monza e Brianza" },
  { code: "NA", name: "Napoli" }, { code: "NO", name: "Novara" },
  { code: "NU", name: "Nuoro" }, { code: "OR", name: "Oristano" },
  { code: "PD", name: "Padova" }, { code: "PA", name: "Palermo" },
  { code: "PR", name: "Parma" }, { code: "PV", name: "Pavia" },
  { code: "PG", name: "Perugia" }, { code: "PU", name: "Pesaro e Urbino" },
  { code: "PE", name: "Pescara" }, { code: "PC", name: "Piacenza" },
  { code: "PI", name: "Pisa" }, { code: "PT", name: "Pistoia" },
  { code: "PN", name: "Pordenone" }, { code: "PZ", name: "Potenza" },
  { code: "PO", name: "Prato" }, { code: "RG", name: "Ragusa" },
  { code: "RA", name: "Ravenna" }, { code: "RC", name: "Reggio Calabria" },
  { code: "RE", name: "Reggio Emilia" }, { code: "RI", name: "Rieti" },
  { code: "RN", name: "Rimini" }, { code: "RM", name: "Roma" },
  { code: "RO", name: "Rovigo" }, { code: "SA", name: "Salerno" },
  { code: "SS", name: "Sassari" }, { code: "SV", name: "Savona" },
  { code: "SI", name: "Siena" }, { code: "SR", name: "Siracusa" },
  { code: "SO", name: "Sondrio" }, { code: "SU", name: "Sud Sardegna" },
  { code: "TA", name: "Taranto" }, { code: "TE", name: "Teramo" },
  { code: "TR", name: "Terni" }, { code: "TO", name: "Torino" },
  { code: "TP", name: "Trapani" }, { code: "TN", name: "Trento" },
  { code: "TV", name: "Treviso" }, { code: "TS", name: "Trieste" },
  { code: "UD", name: "Udine" }, { code: "VA", name: "Varese" },
  { code: "VE", name: "Venezia" }, { code: "VB", name: "Verbano-Cusio-Ossola" },
  { code: "VC", name: "Vercelli" }, { code: "VR", name: "Verona" },
  { code: "VV", name: "Vibo Valentia" }, { code: "VI", name: "Vicenza" },
  { code: "VT", name: "Viterbo" },
];

export const PROVINCE_CODES = new Set(PROVINCES.map((p) => p.code));
```

- [ ] **Step 2: Crea `schema.ts`**

```ts
import { z } from "zod";
import { PROVINCE_CODES } from "./provinces";

export const affiliationRequestSchema = z.object({
  schoolName: z.string().trim().min(2).max(200),
  province: z.string().refine((c) => PROVINCE_CODES.has(c), "provincia non valida"),
  installationUrl: z.string().url().refine((u) => u.startsWith("https://") || u.startsWith("http://"), "URL non valido").max(300),
  contactEmail: z.string().email().max(200),
});

export type AffiliationRequestInput = z.infer<typeof affiliationRequestSchema>;
```

- [ ] **Step 3: Test**

```ts
import { describe, it, expect } from "vitest";
import { affiliationRequestSchema } from "@/lib/affiliation/schema";
import { PROVINCES } from "@/lib/affiliation/provinces";

describe("affiliationRequestSchema", () => {
  it("ha 107 province", () => { expect(PROVINCES.length).toBe(107); });
  it("accetta input valido", () => {
    expect(affiliationRequestSchema.safeParse({ schoolName: "IIS Sarpi", province: "UD", installationUrl: "https://quiz.paolosarpi.edu.it", contactEmail: "a@b.edu.it" }).success).toBe(true);
  });
  it("rifiuta provincia inesistente", () => {
    expect(affiliationRequestSchema.safeParse({ schoolName: "X", province: "ZZ", installationUrl: "https://x.it", contactEmail: "a@b.it" }).success).toBe(false);
  });
});
```

- [ ] **Step 4: Esegui** — `npx vitest run src/lib/affiliation/__tests__/schema.test.ts` → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/affiliation && git commit -m "feat(affiliation): province italiane + schema richiesta"`

---

## Task 3: Servizio di dominio affiliazione (hub)

**Files:**
- Create: `src/lib/hub/affiliation.ts`
- Test: `src/lib/hub/__tests__/affiliation-service.test.ts`

**Interfaces:**
- Consumes: `hashToken`, `generateOpaqueToken` da `@/lib/hub/token-hash`; `hashPassword` da `@/lib/auth/password`; `prisma`.
- Produces:
  - `createRequest(input: AffiliationRequestInput): Promise<{ request: AffiliationRequest; emailToken: string }>`
  - `verifyEmail(token: string): Promise<{ ok: boolean }>`
  - `approve(requestId: string, adminId: string): Promise<{ ok: true; setupCode: string; contactEmail: string; schoolName: string } | { ok: false; error: string }>`
  - `reject(requestId: string, adminId: string, reason?: string): Promise<{ ok: boolean }>`
  - `redeem(setupCode: string): Promise<{ ok: true; clientId: string; clientSecret: string } | { ok: false; error: string }>`

- [ ] **Step 1: Implementa `affiliation.ts`**

```ts
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import type { AffiliationRequestInput } from "@/lib/affiliation/schema";

const SETUP_CODE_TTL_MS = 72 * 60 * 60 * 1000; // 72h

function sha256(s: string) { return createHash("sha256").update(s, "utf8").digest("hex"); }

export async function createRequest(input: AffiliationRequestInput) {
  const emailToken = randomBytes(32).toString("hex");
  const request = await prisma.affiliationRequest.create({
    data: {
      schoolName: input.schoolName, province: input.province,
      installationUrl: input.installationUrl.replace(/\/+$/, ""), contactEmail: input.contactEmail,
      status: "PENDING_EMAIL", emailVerifyTokenHash: sha256(emailToken),
    },
  });
  return { request, emailToken };
}

export async function verifyEmail(token: string) {
  const hash = sha256(token);
  const req = await prisma.affiliationRequest.findFirst({ where: { emailVerifyTokenHash: hash, status: "PENDING_EMAIL" } });
  if (!req) return { ok: false };
  await prisma.affiliationRequest.update({ where: { id: req.id }, data: { status: "PENDING_REVIEW", emailVerifiedAt: new Date(), emailVerifyTokenHash: null } });
  return { ok: true };
}

export async function approve(requestId: string, adminId: string) {
  const req = await prisma.affiliationRequest.findUnique({ where: { id: requestId } });
  if (!req || req.status !== "PENDING_REVIEW") return { ok: false as const, error: "invalid_state" };

  const clientId = `inst_${randomBytes(16).toString("hex")}`;
  const clientSecret = randomBytes(32).toString("base64url");
  const clientSecretHash = await hashPassword(clientSecret);
  const setupCode = randomBytes(24).toString("base64url");

  const inst = await prisma.installation.create({
    data: { name: req.schoolName, contactEmail: req.contactEmail, clientId, clientSecretHash },
  });
  await prisma.affiliationRequest.update({
    where: { id: req.id },
    data: {
      status: "APPROVED", installationId: inst.id, reviewedByHubAccountId: adminId, reviewedAt: new Date(),
      setupCodeHash: sha256(setupCode), setupCodeExpiresAt: new Date(Date.now() + SETUP_CODE_TTL_MS),
      pendingClientId: clientId, pendingClientSecret: clientSecret,
    },
  });

  return { ok: true as const, setupCode, contactEmail: req.contactEmail, schoolName: req.schoolName };
}

export async function reject(requestId: string, adminId: string, reason?: string) {
  const req = await prisma.affiliationRequest.findUnique({ where: { id: requestId } });
  if (!req || (req.status !== "PENDING_REVIEW" && req.status !== "PENDING_EMAIL")) return { ok: false };
  await prisma.affiliationRequest.update({ where: { id: req.id }, data: { status: "REJECTED", reviewedByHubAccountId: adminId, reviewedAt: new Date(), rejectionReason: reason ?? null } });
  return { ok: true };
}

export async function redeem(setupCode: string) {
  const req = await prisma.affiliationRequest.findFirst({ where: { setupCodeHash: sha256(setupCode), status: "APPROVED" } });
  if (!req) return { ok: false as const, error: "invalid_code" };
  if (!req.setupCodeExpiresAt || req.setupCodeExpiresAt < new Date()) return { ok: false as const, error: "expired" };
  if (!req.pendingClientId || !req.pendingClientSecret) return { ok: false as const, error: "no_credentials" };

  const clientId = req.pendingClientId; const clientSecret = req.pendingClientSecret;
  await prisma.affiliationRequest.update({
    where: { id: req.id },
    data: { status: "REDEEMED", redeemedAt: new Date(), setupCodeHash: null, pendingClientSecret: null },
  });
  return { ok: true as const, clientId, clientSecret };
}
```

> **Nota:** i campi `pendingClientId`/`pendingClientSecret` sono gia' nel model (Task 1): conservano il `clientSecret` in chiaro tra approvazione e redeem (l'hash bcrypt e' irreversibile) e vengono azzerati al redeem.

- [ ] **Step 2: Test di integrazione** (DB reale, ciclo completo)

```ts
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/db/client";
import { createRequest, verifyEmail, approve, redeem } from "@/lib/hub/affiliation";

describe("affiliation service", () => {
  const cleanup: string[] = [];
  afterAll(async () => {
    await prisma.affiliationRequest.deleteMany({ where: { id: { in: cleanup } } });
    await prisma.installation.deleteMany({ where: { name: "IIS Flow" } });
  });

  it("percorso completo: create → verify → approve → redeem", async () => {
    const { request, emailToken } = await createRequest({ schoolName: "IIS Flow", province: "UD", installationUrl: "https://quiz.flow.edu.it", contactEmail: "f@flow.edu.it" });
    cleanup.push(request.id);
    expect((await verifyEmail(emailToken)).ok).toBe(true);
    const appr = await approve(request.id, "admin-1");
    expect(appr.ok).toBe(true);
    const red = await redeem((appr as { setupCode: string }).setupCode);
    expect(red.ok).toBe(true);
    expect((red as { clientId: string }).clientId).toMatch(/^inst_/);
    // secondo redeem fallisce (monouso)
    expect((await redeem((appr as { setupCode: string }).setupCode)).ok).toBe(false);
  });
});
```

- [ ] **Step 3: Esegui** — `npx vitest run src/lib/hub/__tests__/affiliation-service.test.ts` → PASS.
- [ ] **Step 4: Commit** — `git add src/lib/hub/affiliation.ts src/lib/hub/__tests__/affiliation-service.test.ts prisma && git commit -m "feat(affiliation): servizio create/verify/approve/redeem"`

---

## Task 4: Email affiliazione

**Files:**
- Create: `src/lib/email/affiliation-emails.ts`
- Test: `src/lib/email/__tests__/affiliation-emails.test.ts`

**Interfaces:**
- Consumes: `sendEmail` da `@/lib/email/send`.
- Produces: `sendAffiliationVerifyEmail({ to, link })`, `sendAffiliationCodeEmail({ to, schoolName, setupCode })`, `sendAffiliationRejectEmail({ to, schoolName, reason? })`.

- [ ] **Step 1: Implementa** (testi IT; usa `sendEmail`)

```ts
import { sendEmail } from "@/lib/email/send";

export async function sendAffiliationVerifyEmail({ to, link }: { to: string; link: string }) {
  await sendEmail({ to, subject: "Conferma la richiesta di affiliazione a savint.it",
    text: `Conferma la tua richiesta di affiliazione: ${link}\n\nSe non hai richiesto tu, ignora questa email.` });
}
export async function sendAffiliationCodeEmail({ to, schoolName, setupCode }: { to: string; schoolName: string; setupCode: string }) {
  await sendEmail({ to, subject: "Affiliazione approvata — il tuo codice di setup",
    text: `La richiesta di ${schoolName} è stata approvata.\n\nCodice di setup (valido 72h, monouso):\n\n${setupCode}\n\nIncollalo nella tua installazione, pagina "Collega a savint.it".` });
}
export async function sendAffiliationRejectEmail({ to, schoolName, reason }: { to: string; schoolName: string; reason?: string }) {
  await sendEmail({ to, subject: "Richiesta di affiliazione non approvata",
    text: `La richiesta di ${schoolName} non è stata approvata.${reason ? `\n\nMotivo: ${reason}` : ""}` });
}
```

- [ ] **Step 2: Test** (mock `sendEmail`, verifica subject + presenza codice)

```ts
import { describe, it, expect, vi } from "vitest";
vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => undefined) }));
import { sendEmail } from "@/lib/email/send";
import { sendAffiliationCodeEmail } from "@/lib/email/affiliation-emails";

it("invia il codice di setup", async () => {
  await sendAffiliationCodeEmail({ to: "a@b.it", schoolName: "IIS X", setupCode: "ABC123" });
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.it", text: expect.stringContaining("ABC123") }));
});
```

- [ ] **Step 3: Esegui** → PASS. **Step 4: Commit** — `git commit -m "feat(affiliation): email conferma/codice/rifiuto"`

---

## Task 5: API richiesta + verifica email (hub)

**Files:**
- Create: `src/app/api/hub/affiliation/request/route.ts`
- Create: `src/app/api/hub/affiliation/verify/route.ts`
- Test: `src/app/api/hub/affiliation/__tests__/request-verify.test.ts`

**Interfaces:**
- Consumes: `affiliationRequestSchema`; `createRequest`, `verifyEmail`; `sendAffiliationVerifyEmail`; `hubRateLimit`, `publicOrigin` da `@/lib/request-origin`.

- [ ] **Step 1: `request/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { affiliationRequestSchema } from "@/lib/affiliation/schema";
import { createRequest } from "@/lib/hub/affiliation";
import { sendAffiliationVerifyEmail } from "@/lib/email/affiliation-emails";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";
import { publicOrigin } from "@/lib/request-origin";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await hubRateLimit({ key: `affiliation-request:${ip}`, windowSeconds: 3600, max: 5 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });

  const parsed = affiliationRequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { request, emailToken } = await createRequest(parsed.data);
  const link = `${publicOrigin(req)}/api/hub/affiliation/verify?token=${emailToken}`;
  await sendAffiliationVerifyEmail({ to: request.contactEmail, link });
  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 2: `verify/route.ts`** (GET; redirect a una pagina di esito)

```ts
import { NextRequest, NextResponse } from "next/server";
import { verifyEmail } from "@/lib/hub/affiliation";
import { publicOrigin } from "@/lib/request-origin";

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const res = await verifyEmail(token);
  const dest = res.ok ? "/affiliazione?verified=1" : "/affiliazione?error=invalid";
  return NextResponse.redirect(`${publicOrigin(req)}${dest}`);
}
```

- [ ] **Step 3: Test** (mock email; DB reale; verifica 201, 400, 429, e verify→PENDING_REVIEW)

```ts
import { describe, it, expect, vi, afterAll } from "vitest";
vi.mock("@/lib/email/affiliation-emails", () => ({ sendAffiliationVerifyEmail: vi.fn(async () => undefined) }));
import { NextRequest } from "next/server";
import { POST } from "@/app/api/hub/affiliation/request/route";
import { prisma } from "@/lib/db/client";
import { resetRateLimitsByPrefix } from "@/lib/rate-limit/hub-rate-limit";

afterAll(async () => { await prisma.affiliationRequest.deleteMany({ where: { contactEmail: "req@test.edu.it" } }); await resetRateLimitsByPrefix("affiliation-request:"); });

it("crea una richiesta (201)", async () => {
  const req = new NextRequest("http://localhost/api/hub/affiliation/request", { method: "POST", body: JSON.stringify({ schoolName: "IIS Req", province: "UD", installationUrl: "https://quiz.req.edu.it", contactEmail: "req@test.edu.it" }) });
  const res = await POST(req);
  expect(res.status).toBe(201);
  const saved = await prisma.affiliationRequest.findFirst({ where: { contactEmail: "req@test.edu.it" } });
  expect(saved?.status).toBe("PENDING_EMAIL");
});
```

- [ ] **Step 4: Esegui** → PASS. **Step 5: Commit** — `git commit -m "feat(affiliation): API richiesta + verifica email"`

---

## Task 6: API admin approva/rifiuta (hub)

**Files:**
- Create: `src/app/api/hub/affiliation/[id]/approve/route.ts`
- Create: `src/app/api/hub/affiliation/[id]/reject/route.ts`
- Test: `src/app/api/hub/affiliation/__tests__/admin-actions.test.ts`

**Interfaces:**
- Consumes: `requireHubAdmin` da `@/lib/auth/require-hub-admin`; `approve`, `reject`; `sendAffiliationCodeEmail`, `sendAffiliationRejectEmail`.

- [ ] **Step 1: `approve/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { approve } from "@/lib/hub/affiliation";
import { sendAffiliationCodeEmail } from "@/lib/email/affiliation-emails";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const r = await approve(id, guard.account.id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 });
  await sendAffiliationCodeEmail({ to: r.contactEmail, schoolName: r.schoolName, setupCode: r.setupCode });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: `reject/route.ts`** (analogo; legge `{ reason? }` dal body; chiama `reject` + `sendAffiliationRejectEmail`; ritorna 409 se stato invalido).

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireHubAdmin } from "@/lib/auth/require-hub-admin";
import { reject } from "@/lib/hub/affiliation";
import { sendAffiliationRejectEmail } from "@/lib/email/affiliation-emails";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireHubAdmin(req);
  if (!guard.ok) return guard.response;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const before = await prisma.affiliationRequest.findUnique({ where: { id } });
  const r = await reject(id, guard.account.id, body.reason);
  if (!r.ok) return NextResponse.json({ error: "invalid_state" }, { status: 409 });
  if (before) await sendAffiliationRejectEmail({ to: before.contactEmail, schoolName: before.schoolName, reason: body.reason });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Test** (mock `getHubSession` + email; verifica 403 se non admin, approvazione crea Installation + manda codice).

```ts
import { describe, it, expect, vi, afterAll } from "vitest";
vi.mock("@/lib/auth/hub-session", () => ({ getHubSession: vi.fn() }));
vi.mock("@/lib/email/affiliation-emails", () => ({ sendAffiliationCodeEmail: vi.fn(async () => undefined), sendAffiliationRejectEmail: vi.fn(async () => undefined) }));
import { getHubSession } from "@/lib/auth/hub-session";
import { NextRequest } from "next/server";
import { POST as approveRoute } from "@/app/api/hub/affiliation/[id]/approve/route";
import { prisma } from "@/lib/db/client";

const mockSession = getHubSession as ReturnType<typeof vi.fn>;
afterAll(async () => { await prisma.affiliationRequest.deleteMany({ where: { schoolName: "IIS Adm" } }); await prisma.installation.deleteMany({ where: { name: "IIS Adm" } }); });

it("403 se non admin", async () => {
  mockSession.mockResolvedValue({ id: "u", role: "HUB_USER" });
  const res = await approveRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: "x" }) });
  expect(res.status).toBe(403);
});

it("admin approva → crea Installation", async () => {
  mockSession.mockResolvedValue({ id: "admin", role: "HUB_ADMIN" });
  const reqRow = await prisma.affiliationRequest.create({ data: { schoolName: "IIS Adm", province: "UD", installationUrl: "https://q.adm.edu.it", contactEmail: "adm@test.edu.it", status: "PENDING_REVIEW", emailVerifiedAt: new Date() } });
  const res = await approveRoute(new NextRequest("http://localhost/x", { method: "POST" }), { params: Promise.resolve({ id: reqRow.id }) });
  expect(res.status).toBe(200);
  const updated = await prisma.affiliationRequest.findUnique({ where: { id: reqRow.id } });
  expect(updated?.status).toBe("APPROVED");
  expect(updated?.installationId).toBeTruthy();
});
```

- [ ] **Step 4: Esegui** → PASS. **Step 5: Commit** — `git commit -m "feat(affiliation): API admin approva/rifiuta"`

---

## Task 7: API redeem (hub, server-to-server)

**Files:**
- Create: `src/app/api/hub/affiliation/redeem/route.ts`
- Test: `src/app/api/hub/affiliation/__tests__/redeem.test.ts`

**Interfaces:**
- Consumes: `redeem` da `@/lib/hub/affiliation`; `hubRateLimit`.

- [ ] **Step 1: `redeem/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { redeem } from "@/lib/hub/affiliation";
import { hubRateLimit } from "@/lib/rate-limit/hub-rate-limit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  const rl = await hubRateLimit({ key: `affiliation-redeem:${ip}`, windowSeconds: 3600, max: 20 });
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { setupCode?: string };
  if (!body.setupCode) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const r = await redeem(body.setupCode);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  const hubUrl = (process.env.HUB_PUBLIC_URL ?? "https://savint.it").replace(/\/+$/, "");
  return NextResponse.json({ clientId: r.clientId, clientSecret: r.clientSecret, hubUrl });
}
```

- [ ] **Step 2: Test** (crea richiesta APPROVED con pendingClientId/Secret + setupCodeHash, poi redeem valido/scaduto/inesistente). Usa `createRequest`+`approve` per il setup, poi verifica il route.
- [ ] **Step 3: Esegui** → PASS. **Step 4: Commit** — `git commit -m "feat(affiliation): API redeem codice di setup"`

---

## Task 8: `oauth-config.ts` async + DB-backed (installazione)

**Files:**
- Modify: `src/lib/hub/oauth-config.ts`
- Modify tutti i callers (vedi tabella)
- Test: `src/lib/hub/__tests__/oauth-config.test.ts` (aggiornare)

**Interfaces:**
- Produces: `hasHubOAuthConfig(): Promise<boolean>`, `getHubOAuthConfig(): Promise<HubOAuthConfig>` — leggono `HubConfig` (DB) → fallback `process.env`.

- [ ] **Step 1: Riscrivi `oauth-config.ts`**

```ts
import { prisma } from "@/lib/db/client";
export type HubOAuthConfig = { clientId: string; clientSecret: string; hubUrl: string };

async function fromDb(): Promise<HubOAuthConfig | null> {
  const row = await prisma.hubConfig.findUnique({ where: { id: "singleton" } });
  if (!row?.clientId || !row?.clientSecret || !row?.hubUrl) return null;
  return { clientId: row.clientId, clientSecret: row.clientSecret, hubUrl: row.hubUrl.replace(/\/+$/, "") };
}
function fromEnv(): HubOAuthConfig | null {
  const clientId = process.env.HUB_OAUTH_CLIENT_ID, clientSecret = process.env.HUB_OAUTH_CLIENT_SECRET, hubUrl = process.env.SAVINT_HUB_URL;
  if (!clientId || !clientSecret || !hubUrl) return null;
  return { clientId, clientSecret, hubUrl: hubUrl.replace(/\/+$/, "") };
}
export async function hasHubOAuthConfig(): Promise<boolean> { return Boolean((await fromDb()) ?? fromEnv()); }
export async function getHubOAuthConfig(): Promise<HubOAuthConfig> {
  const cfg = (await fromDb()) ?? fromEnv();
  if (!cfg) throw new Error("Hub non configurato (né DB né env)");
  return cfg;
}
```

- [ ] **Step 2: Aggiorna i callers ad `await`** (censiti):
  - `src/app/(app)/account/hub-link/page.tsx:23-24` → `const linked = ...; if (!isLinked && (await hasHubOAuthConfig())) { const cfg = await getHubOAuthConfig(); ... }`
  - `src/app/(editor)/dashboard/quiz/[id]/edit/page.tsx:59` → `hubEnabled={await hasHubOAuthConfig()}` (la pagina è già async server component)
  - `src/app/api/hub/oauth/link/route.ts:16`, `oauth/start/route.ts:18`, `oauth/callback/route.ts:25` → `const cfg = await getHubOAuthConfig()`
  - `src/lib/hub/hub-client.ts:27,80` → `const cfg = await getHubOAuthConfig()` (rendere async le funzioni contenitrici se non lo sono)
- [ ] **Step 3: Aggiorna il test** `oauth-config.test.ts` per le firme async (await + mock `prisma.hubConfig.findUnique`). Verifica: DB presente → usa DB; DB assente → fallback env; entrambi assenti → throw.
- [ ] **Step 4: Esegui** `npx vitest run src/lib/hub/__tests__/oauth-config.test.ts` + `npx tsc --noEmit` (tutti i callers awaited) → PASS/clean.
- [ ] **Step 5: Commit** — `git commit -m "refactor(hub): oauth-config async, DB HubConfig con fallback env"`

---

## Task 9: Connect installazione (redime il codice) + UI setup

**Files:**
- Create: `src/app/api/installation/hub/connect/route.ts`
- Create: `src/app/(app)/account/hub-link/setup-code-form.tsx`
- Modify: `src/app/(app)/account/hub-link/page.tsx` (mostra il form quando non collegato)
- Modify (se serve): `src/middleware.ts` (non bloccare `/api/installation/*`)
- Test: `src/app/api/installation/hub/__tests__/connect.test.ts`

**Interfaces:**
- Consumes: `auth()` da `@/lib/auth/config` (utente installazione loggato); `getHubOAuthConfig`/env per l'`hubUrl` di base.
- Produces: endpoint `POST /api/installation/hub/connect { setupCode }`; salva `HubConfig` via upsert.

- [ ] **Step 1: `connect/route.ts`** (server della scuola: chiama il redeem remoto e salva `HubConfig`)

```ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  // solo admin installazione
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (me?.role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { setupCode?: string };
  if (!body.setupCode) return NextResponse.json({ error: "missing_code" }, { status: 400 });

  const hubBase = (process.env.SAVINT_HUB_URL ?? "https://savint.it").replace(/\/+$/, "");
  const res = await fetch(`${hubBase}/api/hub/affiliation/redeem`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupCode: body.setupCode }) });
  if (!res.ok) { const e = await res.json().catch(() => ({})); return NextResponse.json({ error: e.error ?? "redeem_failed" }, { status: 400 }); }
  const creds = (await res.json()) as { clientId: string; clientSecret: string; hubUrl: string };

  await prisma.hubConfig.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", clientId: creds.clientId, clientSecret: creds.clientSecret, hubUrl: creds.hubUrl },
    update: { clientId: creds.clientId, clientSecret: creds.clientSecret, hubUrl: creds.hubUrl },
  });
  return NextResponse.json({ ok: true, hubUrl: creds.hubUrl });
}
```

- [ ] **Step 2: `setup-code-form.tsx`** (client): input codice + POST a `/api/installation/hub/connect`, mostra esito, `router.refresh()` al successo.

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SetupCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const res = await fetch("/api/installation/hub/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupCode: code.trim() }) });
    setBusy(false);
    if (res.ok) router.refresh(); else setErr((await res.json().catch(() => ({}))).error ?? "errore");
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Incolla il codice di setup" className="w-full rounded border px-3 py-2 text-sm" required />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="submit" disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Collego…" : "Collega a savint.it"}</button>
    </form>
  );
}
```

- [ ] **Step 3: Mostra `SetupCodeForm` in `hub-link/page.tsx`** nello stato non collegato (accanto/al posto del flusso OAuth manuale), gated a utente `ADMIN` dell'installazione.
- [ ] **Step 4: `middleware.ts`** — verificare che `/api/installation/*` non sia intercettato dalle regole hub-only; se necessario aggiungere all'allowlist.
- [ ] **Step 5: Test** `connect.test.ts` — mock `auth` + `global.fetch` (redeem hub) → verifica upsert `HubConfig` e 401/403.
- [ ] **Step 6: Esegui** → PASS. **Step 7: Commit** — `git commit -m "feat(affiliation): connect installazione via codice di setup"`

---

## Task 10: Pagina pubblica /affiliazione + pannello admin + i18n

**Files:**
- Create: `src/app/(hub)/affiliazione/page.tsx` + `affiliation-form.tsx`
- Create: `src/app/admin/hub/affiliations/page.tsx` + `affiliation-actions.tsx`
- Modify: `src/messages/it.json`, `src/messages/en.json` (namespace `affiliation`)
- Test: `src/app/(hub)/affiliazione/__tests__/form.test.tsx`

- [ ] **Step 1: `affiliation-form.tsx`** (client): campi nome scuola, provincia (`<select>` da `PROVINCES`), URL installazione, email; POST a `/api/hub/affiliation/request`; stato successo ("controlla la tua email"). Legge `?verified=1` per il messaggio di conferma.
- [ ] **Step 2: `affiliazione/page.tsx`** (server): hero + `<AffiliationForm />`; usa `HubHeader` già globale.
- [ ] **Step 3: `admin/hub/affiliations/page.tsx`** (server): guardia `getHubSessionFromCookies()` + `role==="HUB_ADMIN"` (pattern di `admin/hub/reports/page.tsx`); lista `prisma.affiliationRequest.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" } })`; per ogni riga `<AffiliationActions id=... />`.
- [ ] **Step 4: `affiliation-actions.tsx`** (client): bottoni Approva/Rifiuta → POST a `/api/hub/affiliation/[id]/approve|reject` → `router.refresh()`.
- [ ] **Step 5: i18n** namespace `affiliation` (it+en): titoli/sottotitoli form, label campi, messaggi successo/errore, testi pannello admin. Validare JSON.
- [ ] **Step 6: Test** del form (render, submit chiama fetch con il payload corretto). Esegui `npx vitest run src/app/\(hub\)/affiliazione`.
- [ ] **Step 7: Verifiche finali** — `npx tsc --noEmit` clean; `node -e "JSON.parse(...it.json); JSON.parse(...en.json)"`; `npx vitest run src/lib/affiliation src/lib/hub src/app/api/hub/affiliation src/app/api/installation` verdi (ignora il placeholder `.claire/worktrees`).
- [ ] **Step 8: Commit** — `git commit -m "feat(affiliation): pagina pubblica /affiliazione + pannello admin + i18n"`

---

## Self-Review (copertura spec)

- Modelli `AffiliationRequest` + `HubConfig` → Task 1 (+ campi `pendingClientId/Secret` da aggiungere in Task 1 per Task 3).
- Verifica = approvazione admin + email → Task 5 (email), 6 (approve). ✅
- Codice setup monouso + scadenza + hash → Task 3 (`approve`/`redeem`), 7. ✅
- Auto-config via API (no .env) → Task 8 (oauth-config DB→env) + Task 9 (connect + HubConfig). ✅
- Rate-limit su request/redeem → Task 5, 7. ✅
- HUB_ADMIN gate → Task 6, 10. ✅
- Province (assenti nel repo) → Task 2. ✅
- Fallback env per installazioni attuali → Task 8. ✅
- **Nota (RISOLTA)**: i campi `pendingClientId String?` e `pendingClientSecret String?` sono nel model in Task 1; conservano il `clientSecret` in chiaro tra approvazione e redeem (l'hash bcrypt è irreversibile) e vengono azzerati al redeem. In Task 3 `approve()` può essere una sequenza lineare (create Installation → update request con setupCodeHash + pendingClientId/Secret), senza `$transaction` artificiosa. Hardening futuro: cifrare `pendingClientSecret` a riposo.
