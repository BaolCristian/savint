# Quiz Live per la Scuola - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Kahoot-like live quiz platform for a school, with quiz creation, real-time gameplay, sharing between teachers, and advanced statistics.

**Architecture:** Next.js 15 App Router monolith with Socket.io for real-time, PostgreSQL via Prisma ORM, Google OAuth via NextAuth v5. Deployed as Docker Compose on school server.

**Tech Stack:** Next.js 15, TypeScript, React 19, Tailwind CSS 4, shadcn/ui, Socket.io 4, NextAuth v5, Prisma 6, PostgreSQL 16, Recharts, Zod, Vitest, Playwright.

**Design doc:** `docs/plans/2026-03-06-kahoot-clone-design.md`

---

## Phase 1: Foundations

### Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `.env.example`, `.gitignore`

**Step 1: Create Next.js app**

```bash
cd /Users/cristianvirgili/NetBeansProjects/kahoot
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

Accept defaults. This scaffolds the project.

**Step 2: Install core dependencies**

```bash
npm install prisma @prisma/client next-auth@beta @auth/prisma-adapter socket.io socket.io-client zod recharts papaparse @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom jsdom @types/papaparse
```

**Step 3: Create .env.example**

Create `.env.example`:
```
DATABASE_URL=postgresql://kahoot:kahoot@localhost:5432/kahoot
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NEXTAUTH_SECRET=generate-with-openssl-rand-base64-32
NEXTAUTH_URL=http://localhost:3000
```

Copy to `.env`:
```bash
cp .env.example .env
```

**Step 4: Init git and commit**

```bash
git init
git add -A
git commit -m "feat: initialize Next.js 15 project with dependencies"
```

---

### Task 2: Docker Compose setup

**Files:**
- Create: `docker-compose.yml`, `Dockerfile`, `.dockerignore`

**Step 1: Create docker-compose.yml**

Create `docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: kahoot
      POSTGRES_USER: kahoot
      POSTGRES_PASSWORD: kahoot
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  pgdata:
```

Note: We only define `db` for dev. The `app` service will be added in Phase 6 (Deploy).

**Step 2: Create .dockerignore**

Create `.dockerignore`:
```
node_modules
.next
.env
.git
```

**Step 3: Start database and verify**

```bash
docker compose up -d db
docker compose ps
```

Expected: db container running on port 5432.

**Step 4: Commit**

```bash
git add docker-compose.yml .dockerignore
git commit -m "feat: add Docker Compose with PostgreSQL for development"
```

---

### Task 3: Prisma schema and migrations

**Files:**
- Create: `prisma/schema.prisma`

**Step 1: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

**Step 2: Write the schema**

Replace `prisma/schema.prisma` with:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  TEACHER
  ADMIN
}

enum QuestionType {
  MULTIPLE_CHOICE
  TRUE_FALSE
  OPEN_ANSWER
  ORDERING
  MATCHING
}

enum SessionStatus {
  LOBBY
  IN_PROGRESS
  FINISHED
}

enum SharePermission {
  VIEW
  DUPLICATE
  EDIT
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(TEACHER)
  googleId  String   @unique
  avatarUrl String?
  createdAt DateTime @default(now())

  quizzes      Quiz[]
  hostedSessions Session[]
  sharedWithMe   QuizShare[]

  // NextAuth fields
  accounts Account[]
  sessions AuthSession[]
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model AuthSession {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("auth_session")
}

model Quiz {
  id          String   @id @default(cuid())
  title       String
  description String?
  authorId    String
  isPublic    Boolean  @default(false)
  tags        String[] @default([])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  author    User        @relation(fields: [authorId], references: [id])
  questions Question[]
  sessions  Session[]
  shares    QuizShare[]
}

model Question {
  id        String       @id @default(cuid())
  quizId    String
  type      QuestionType
  text      String
  mediaUrl  String?
  timeLimit Int          @default(20)
  points    Int          @default(1000)
  order     Int
  options   Json

  quiz    Quiz     @relation(fields: [quizId], references: [id], onDelete: Cascade)
  answers Answer[]
}

model QuizShare {
  id           String          @id @default(cuid())
  quizId       String
  sharedWithId String
  permission   SharePermission @default(VIEW)
  createdAt    DateTime        @default(now())

  quiz       Quiz @relation(fields: [quizId], references: [id], onDelete: Cascade)
  sharedWith User @relation(fields: [sharedWithId], references: [id])

  @@unique([quizId, sharedWithId])
}

model Session {
  id        String        @id @default(cuid())
  quizId    String
  hostId    String
  pin       String        @unique
  status    SessionStatus @default(LOBBY)
  startedAt DateTime?
  endedAt   DateTime?
  createdAt DateTime      @default(now())

  quiz    Quiz     @relation(fields: [quizId], references: [id])
  host    User     @relation(fields: [hostId], references: [id])
  answers Answer[]
}

model Answer {
  id             String   @id @default(cuid())
  sessionId      String
  questionId     String
  playerName     String
  playerEmail    String?
  value          Json
  isCorrect      Boolean
  responseTimeMs Int
  score          Int
  createdAt      DateTime @default(now())

  session  Session  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  question Question @relation(fields: [questionId], references: [id])

  @@unique([sessionId, questionId, playerName])
}
```

**Step 3: Run migration**

```bash
npx prisma migrate dev --name init
```

Expected: Migration created and applied, Prisma Client generated.

**Step 4: Create Prisma client singleton**

Create `src/lib/db/client.ts`:
```typescript
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

**Step 5: Commit**

```bash
git add prisma/ src/lib/db/
git commit -m "feat: add Prisma schema with all entities and initial migration"
```

---

### Task 4: NextAuth Google authentication

**Files:**
- Create: `src/lib/auth/config.ts`, `src/app/api/auth/[...nextauth]/route.ts`
- Modify: `src/app/layout.tsx`

**Step 1: Create auth config**

Create `src/lib/auth/config.ts`:
```typescript
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db/client";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
```

Note: NextAuth v5 (beta) API may differ slightly. Check docs at the time of implementation. The above uses the v4-compatible pattern. If using `next-auth@beta` (v5), use `auth.ts` at project root with the `NextAuth()` function instead. Adapt accordingly.

**Step 2: Create auth route handler**

Create `src/app/api/auth/[...nextauth]/route.ts`:
```typescript
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/config";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
```

**Step 3: Create session provider wrapper**

Create `src/components/providers.tsx`:
```typescript
"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
```

**Step 4: Update root layout**

Modify `src/app/layout.tsx` to wrap children with `<Providers>`:
```typescript
import { Providers } from "@/components/providers";
// ... existing imports

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**Step 5: Create login page**

Create `src/app/(auth)/login/page.tsx`:
```typescript
"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-bold">Quiz Live</h1>
        <p className="text-muted-foreground">Accedi con il tuo account scolastico</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition"
        >
          Accedi con Google
        </button>
      </div>
    </div>
  );
}
```

**Step 6: Verify auth works**

```bash
npm run dev
```

Visit `http://localhost:3000/login`. Button should render. Google OAuth won't work without real credentials, but the flow is wired.

**Step 7: Commit**

```bash
git add src/lib/auth/ src/app/api/auth/ src/components/providers.tsx src/app/\(auth\)/ src/app/layout.tsx
git commit -m "feat: add NextAuth with Google OAuth and login page"
```

---

### Task 5: shadcn/ui setup and dashboard layout

**Files:**
- Create: `src/app/(dashboard)/layout.tsx`, `src/app/(dashboard)/page.tsx`
- Modify: various shadcn config

**Step 1: Init shadcn/ui**

```bash
npx shadcn@latest init
```

Choose: New York style, Zinc base color, CSS variables: yes.

**Step 2: Add base components**

```bash
npx shadcn@latest add button card badge input textarea select dialog dropdown-menu separator avatar sheet tabs table
```

**Step 3: Create dashboard layout with sidebar**

Create `src/app/(dashboard)/layout.tsx`:
```typescript
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen">
      <DashboardSidebar user={session.user} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
```

**Step 4: Create sidebar component**

Create `src/components/dashboard/sidebar.tsx`:
```typescript
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", label: "Home", icon: "Home" },
  { href: "/dashboard/quiz", label: "I miei Quiz", icon: "FileQuestion" },
  { href: "/dashboard/sessions", label: "Sessioni", icon: "Play" },
  { href: "/dashboard/stats", label: "Statistiche", icon: "BarChart3" },
  { href: "/dashboard/share", label: "Condivisioni", icon: "Share2" },
];

export function DashboardSidebar({ user }: { user: any }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 border-r bg-muted/30 p-4 flex flex-col">
      <div className="text-xl font-bold mb-8">Quiz Live</div>
      <nav className="space-y-1 flex-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded-md text-sm ${
              pathname === item.href
                ? "bg-primary text-primary-foreground"
                : "hover:bg-muted"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="border-t pt-4">
        <div className="text-sm font-medium">{user?.name}</div>
        <div className="text-xs text-muted-foreground">{user?.email}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-xs text-red-500 mt-2 hover:underline"
        >
          Esci
        </button>
      </div>
    </aside>
  );
}
```

**Step 5: Create dashboard home placeholder**

Create `src/app/(dashboard)/page.tsx`:
```typescript
export default function DashboardHome() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>
      <p className="text-muted-foreground">Benvenuto! Seleziona una sezione dal menu.</p>
    </div>
  );
}
```

**Step 6: Verify**

```bash
npm run dev
```

Visit `http://localhost:3000/dashboard` — should redirect to login if not authed, show sidebar if authed.

**Step 7: Commit**

```bash
git add .
git commit -m "feat: add shadcn/ui and dashboard layout with sidebar navigation"
```

---

### Task 6: Shared types and Zod validators

**Files:**
- Create: `src/types/index.ts`, `src/lib/validators/quiz.ts`, `src/lib/validators/session.ts`

**Step 1: Create shared types**

Create `src/types/index.ts`:
```typescript
import { QuestionType } from "@prisma/client";

// Question option schemas per type
export type MultipleChoiceOptions = {
  choices: { text: string; isCorrect: boolean }[];
};

export type TrueFalseOptions = {
  correct: boolean;
};

export type OpenAnswerOptions = {
  acceptedAnswers: string[];
};

export type OrderingOptions = {
  items: string[];
  correctOrder: number[];
};

export type MatchingOptions = {
  pairs: { left: string; right: string }[];
};

export type QuestionOptions =
  | MultipleChoiceOptions
  | TrueFalseOptions
  | OpenAnswerOptions
  | OrderingOptions
  | MatchingOptions;

// Answer value schemas per type
export type MultipleChoiceValue = { selected: number[] };
export type TrueFalseValue = { selected: boolean };
export type OpenAnswerValue = { text: string };
export type OrderingValue = { order: number[] };
export type MatchingValue = { matches: [number, number][] };

export type AnswerValue =
  | MultipleChoiceValue
  | TrueFalseValue
  | OpenAnswerValue
  | OrderingValue
  | MatchingValue;

// Socket.io events
export interface ServerToClientEvents {
  playerJoined: (data: { playerName: string; playerCount: number }) => void;
  playerLeft: (data: { playerName: string; playerCount: number }) => void;
  questionStart: (data: {
    questionIndex: number;
    totalQuestions: number;
    question: {
      text: string;
      type: QuestionType;
      options: QuestionOptions;
      timeLimit: number;
      points: number;
      mediaUrl: string | null;
    };
  }) => void;
  answerCount: (data: { count: number; total: number }) => void;
  questionResult: (data: {
    correctAnswer: QuestionOptions;
    distribution: Record<string, number>;
    leaderboard: { playerName: string; score: number; delta: number }[];
  }) => void;
  answerFeedback: (data: {
    isCorrect: boolean;
    score: number;
    totalScore: number;
    position: number;
    classCorrectPercent: number;
  }) => void;
  gameOver: (data: {
    podium: { playerName: string; score: number; position: number }[];
    fullResults: { playerName: string; score: number }[];
  }) => void;
  sessionError: (data: { message: string }) => void;
  gameState: (data: { status: string; currentQuestion?: number }) => void;
}

export interface ClientToServerEvents {
  joinSession: (data: { pin: string; playerName: string; playerEmail?: string }) => void;
  startGame: () => void;
  nextQuestion: () => void;
  submitAnswer: (data: { value: AnswerValue; responseTimeMs: number }) => void;
  endGame: () => void;
}
```

**Step 2: Create Zod validators**

Create `src/lib/validators/quiz.ts`:
```typescript
import { z } from "zod";

const multipleChoiceOptionsSchema = z.object({
  choices: z.array(z.object({
    text: z.string().min(1),
    isCorrect: z.boolean(),
  })).min(2).max(6),
});

const trueFalseOptionsSchema = z.object({
  correct: z.boolean(),
});

const openAnswerOptionsSchema = z.object({
  acceptedAnswers: z.array(z.string().min(1)).min(1),
});

const orderingOptionsSchema = z.object({
  items: z.array(z.string().min(1)).min(2),
  correctOrder: z.array(z.number()),
});

const matchingOptionsSchema = z.object({
  pairs: z.array(z.object({
    left: z.string().min(1),
    right: z.string().min(1),
  })).min(2),
});

export const questionSchema = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "TRUE_FALSE", "OPEN_ANSWER", "ORDERING", "MATCHING"]),
  text: z.string().min(1).max(500),
  mediaUrl: z.string().url().nullable().optional(),
  timeLimit: z.number().int().min(5).max(120).default(20),
  points: z.number().int().min(100).max(2000).default(1000),
  order: z.number().int().min(0),
  options: z.union([
    multipleChoiceOptionsSchema,
    trueFalseOptionsSchema,
    openAnswerOptionsSchema,
    orderingOptionsSchema,
    matchingOptionsSchema,
  ]),
});

export const quizSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  questions: z.array(questionSchema).min(1),
});

export const updateQuizSchema = quizSchema.partial();

export type QuizInput = z.infer<typeof quizSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;
```

Create `src/lib/validators/session.ts`:
```typescript
import { z } from "zod";

export const joinSessionSchema = z.object({
  pin: z.string().length(6).regex(/^\d{6}$/),
  playerName: z.string().min(1).max(30),
  playerEmail: z.string().email().optional(),
});

export const submitAnswerSchema = z.object({
  value: z.record(z.unknown()),
  responseTimeMs: z.number().int().min(0),
});
```

**Step 3: Write tests for validators**

Create `tests/unit/validators.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { quizSchema, questionSchema } from "@/lib/validators/quiz";
import { joinSessionSchema } from "@/lib/validators/session";

describe("questionSchema", () => {
  it("validates a multiple choice question", () => {
    const result = questionSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      text: "Capitale della Francia?",
      timeLimit: 20,
      points: 1000,
      order: 0,
      options: {
        choices: [
          { text: "Londra", isCorrect: false },
          { text: "Parigi", isCorrect: true },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a question with empty text", () => {
    const result = questionSchema.safeParse({
      type: "TRUE_FALSE",
      text: "",
      timeLimit: 20,
      points: 1000,
      order: 0,
      options: { correct: true },
    });
    expect(result.success).toBe(false);
  });
});

describe("quizSchema", () => {
  it("validates a complete quiz", () => {
    const result = quizSchema.safeParse({
      title: "Test Quiz",
      questions: [
        {
          type: "TRUE_FALSE",
          text: "Il sole e una stella",
          timeLimit: 15,
          points: 1000,
          order: 0,
          options: { correct: true },
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a quiz without questions", () => {
    const result = quizSchema.safeParse({
      title: "Empty Quiz",
      questions: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("joinSessionSchema", () => {
  it("validates a valid join request", () => {
    const result = joinSessionSchema.safeParse({
      pin: "482731",
      playerName: "Marco",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid PIN", () => {
    const result = joinSessionSchema.safeParse({
      pin: "abc",
      playerName: "Marco",
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 4: Setup Vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: [],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Add to `package.json` scripts: `"test": "vitest", "test:run": "vitest run"`

**Step 5: Run tests**

```bash
npm run test:run
```

Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/types/ src/lib/validators/ tests/ vitest.config.ts package.json
git commit -m "feat: add shared types, Zod validators, and unit tests"
```

---

### Task 7: Scoring logic with TDD

**Files:**
- Create: `src/lib/scoring.ts`, `tests/unit/scoring.test.ts`

**Step 1: Write failing tests**

Create `tests/unit/scoring.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { calculateScore, checkAnswer } from "@/lib/scoring";

describe("calculateScore", () => {
  it("gives max score for instant correct answer", () => {
    expect(calculateScore({ isCorrect: true, responseTimeMs: 0, timeLimit: 20, maxPoints: 1000 })).toBe(1000);
  });

  it("gives 0 for incorrect answer", () => {
    expect(calculateScore({ isCorrect: false, responseTimeMs: 5000, timeLimit: 20, maxPoints: 1000 })).toBe(0);
  });

  it("gives reduced score for slower answer", () => {
    // 10s out of 20s = 0.5 ratio, multiplier = 1.0 - 0.5 * 0.5 = 0.75
    const score = calculateScore({ isCorrect: true, responseTimeMs: 10000, timeLimit: 20, maxPoints: 1000 });
    expect(score).toBe(750);
  });

  it("gives minimum 50% for correct answer at time limit", () => {
    const score = calculateScore({ isCorrect: true, responseTimeMs: 20000, timeLimit: 20, maxPoints: 1000 });
    expect(score).toBe(500);
  });
});

describe("checkAnswer", () => {
  it("checks multiple choice correctly", () => {
    const options = { choices: [{ text: "A", isCorrect: false }, { text: "B", isCorrect: true }] };
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [1] })).toBe(true);
    expect(checkAnswer("MULTIPLE_CHOICE", options, { selected: [0] })).toBe(false);
  });

  it("checks true/false correctly", () => {
    expect(checkAnswer("TRUE_FALSE", { correct: true }, { selected: true })).toBe(true);
    expect(checkAnswer("TRUE_FALSE", { correct: true }, { selected: false })).toBe(false);
  });

  it("checks open answer case-insensitive", () => {
    const options = { acceptedAnswers: ["Roma", "rome"] };
    expect(checkAnswer("OPEN_ANSWER", options, { text: "roma" })).toBe(true);
    expect(checkAnswer("OPEN_ANSWER", options, { text: "Milano" })).toBe(false);
  });

  it("checks ordering correctly", () => {
    const options = { items: ["A", "B", "C"], correctOrder: [2, 0, 1] };
    expect(checkAnswer("ORDERING", options, { order: [2, 0, 1] })).toBe(true);
    expect(checkAnswer("ORDERING", options, { order: [0, 1, 2] })).toBe(false);
  });

  it("checks matching correctly", () => {
    const options = { pairs: [{ left: "IT", right: "Italia" }, { left: "FR", right: "Francia" }] };
    expect(checkAnswer("MATCHING", options, { matches: [[0, 0], [1, 1]] })).toBe(true);
    expect(checkAnswer("MATCHING", options, { matches: [[0, 1], [1, 0]] })).toBe(false);
  });
});
```

**Step 2: Run to verify failure**

```bash
npm run test:run -- tests/unit/scoring.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement scoring**

Create `src/lib/scoring.ts`:
```typescript
import type { QuestionType } from "@prisma/client";
import type { QuestionOptions, AnswerValue } from "@/types";

interface ScoreInput {
  isCorrect: boolean;
  responseTimeMs: number;
  timeLimit: number; // seconds
  maxPoints: number;
}

export function calculateScore({ isCorrect, responseTimeMs, timeLimit, maxPoints }: ScoreInput): number {
  if (!isCorrect) return 0;
  const timeLimitMs = timeLimit * 1000;
  const timeRatio = Math.min(responseTimeMs / timeLimitMs, 1);
  const multiplier = 1.0 - timeRatio * 0.5;
  return Math.round(maxPoints * multiplier);
}

export function checkAnswer(type: QuestionType | string, options: any, value: any): boolean {
  switch (type) {
    case "MULTIPLE_CHOICE": {
      const correct = options.choices
        .map((c: any, i: number) => (c.isCorrect ? i : -1))
        .filter((i: number) => i >= 0);
      const selected = [...value.selected].sort();
      return JSON.stringify(correct.sort()) === JSON.stringify(selected);
    }
    case "TRUE_FALSE":
      return value.selected === options.correct;
    case "OPEN_ANSWER":
      return options.acceptedAnswers.some(
        (a: string) => a.toLowerCase().trim() === value.text.toLowerCase().trim()
      );
    case "ORDERING":
      return JSON.stringify(value.order) === JSON.stringify(options.correctOrder);
    case "MATCHING": {
      const expected = options.pairs.map((_: any, i: number) => [i, i]);
      const sorted = [...value.matches].sort((a: number[], b: number[]) => a[0] - b[0]);
      return JSON.stringify(sorted) === JSON.stringify(expected);
    }
    default:
      return false;
  }
}
```

**Step 4: Run tests**

```bash
npm run test:run -- tests/unit/scoring.test.ts
```

Expected: All pass.

**Step 5: Commit**

```bash
git add src/lib/scoring.ts tests/unit/scoring.test.ts
git commit -m "feat: add scoring logic with time-based multiplier and answer checking"
```

---

## Phase 2: CRUD Quiz

### Task 8: Quiz API routes (CRUD)

**Files:**
- Create: `src/app/api/quiz/route.ts`, `src/app/api/quiz/[id]/route.ts`

**Step 1: Create list + create endpoint**

Create `src/app/api/quiz/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, ...quizData } = parsed.data;

  const quiz = await prisma.quiz.create({
    data: {
      ...quizData,
      authorId: session.user.id,
      questions: {
        create: questions.map((q, i) => ({ ...q, order: i })),
      },
    },
    include: { questions: true },
  });

  return NextResponse.json(quiz, { status: 201 });
}
```

**Step 2: Create single quiz endpoint (GET, PUT, DELETE)**

Create `src/app/api/quiz/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { quizSchema } from "@/lib/validators/quiz";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: { questions: { orderBy: { order: "asc" } }, author: { select: { name: true, email: true } } },
  });

  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(quiz);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quiz = await prisma.quiz.findUnique({ where: { id: params.id } });
  if (!quiz || quiz.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { questions, ...quizData } = parsed.data;

  // Delete existing questions and recreate (simplest approach for reordering)
  await prisma.question.deleteMany({ where: { quizId: params.id } });

  const updated = await prisma.quiz.update({
    where: { id: params.id },
    data: {
      ...quizData,
      questions: {
        create: questions.map((q, i) => ({ ...q, order: i })),
      },
    },
    include: { questions: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const quiz = await prisma.quiz.findUnique({ where: { id: params.id } });
  if (!quiz || quiz.authorId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.quiz.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
```

**Step 3: Commit**

```bash
git add src/app/api/quiz/
git commit -m "feat: add quiz CRUD API routes with validation"
```

---

### Task 9: Quiz list page

**Files:**
- Create: `src/app/(dashboard)/quiz/page.tsx`

**Step 1: Create the page**

Create `src/app/(dashboard)/quiz/page.tsx`:
```typescript
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function QuizListPage() {
  const session = await getServerSession(authOptions);

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: session!.user!.id },
        { shares: { some: { sharedWithId: session!.user!.id } } },
      ],
    },
    include: {
      _count: { select: { questions: true, sessions: true } },
      author: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">I miei Quiz</h1>
        <Link href="/dashboard/quiz/new">
          <Button>Nuovo Quiz</Button>
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <p className="text-muted-foreground">Nessun quiz ancora. Creane uno!</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <Link key={quiz.id} href={`/dashboard/quiz/${quiz.id}/edit`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                  <CardDescription>
                    {quiz._count.questions} domande &middot; Giocato {quiz._count.sessions} volte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1 flex-wrap">
                    {quiz.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                  {quiz.authorId !== session!.user!.id && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Condiviso da {quiz.author.name}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

```bash
npm run dev
```

Visit `/dashboard/quiz` — should show empty state or list.

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/quiz/page.tsx
git commit -m "feat: add quiz list page with cards"
```

---

### Task 10: Quiz editor — create and edit

**Files:**
- Create: `src/app/(dashboard)/quiz/new/page.tsx`, `src/app/(dashboard)/quiz/[id]/edit/page.tsx`, `src/components/quiz/quiz-editor.tsx`, `src/components/quiz/question-editor.tsx`

This is a large task. The quiz editor is a form with:
- Quiz title, description, tags
- List of questions (add, remove, reorder)
- Per question: type selector, text, options editor per type, time limit, points

**Step 1: Create QuestionEditor component**

Create `src/components/quiz/question-editor.tsx`:
```typescript
"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QuestionInput } from "@/lib/validators/quiz";

interface Props {
  question: QuestionInput;
  index: number;
  onChange: (index: number, question: QuestionInput) => void;
  onRemove: (index: number) => void;
}

const questionTypes = [
  { value: "MULTIPLE_CHOICE", label: "Scelta multipla" },
  { value: "TRUE_FALSE", label: "Vero / Falso" },
  { value: "OPEN_ANSWER", label: "Risposta aperta" },
  { value: "ORDERING", label: "Ordinamento" },
  { value: "MATCHING", label: "Abbinamento" },
] as const;

export function QuestionEditor({ question, index, onChange, onRemove }: Props) {
  function updateField(field: string, value: any) {
    onChange(index, { ...question, [field]: value });
  }

  function updateOptions(options: any) {
    onChange(index, { ...question, options });
  }

  function handleTypeChange(type: string) {
    const defaults: Record<string, any> = {
      MULTIPLE_CHOICE: { choices: [{ text: "", isCorrect: false }, { text: "", isCorrect: false }] },
      TRUE_FALSE: { correct: true },
      OPEN_ANSWER: { acceptedAnswers: [""] },
      ORDERING: { items: ["", ""], correctOrder: [0, 1] },
      MATCHING: { pairs: [{ left: "", right: "" }, { left: "", right: "" }] },
    };
    onChange(index, { ...question, type: type as any, options: defaults[type] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <span className="font-semibold">Domanda {index + 1}</span>
        <Button variant="ghost" size="sm" onClick={() => onRemove(index)}>Rimuovi</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <Select value={question.type} onValueChange={handleTypeChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {questionTypes.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            value={question.timeLimit}
            onChange={(e) => updateField("timeLimit", parseInt(e.target.value) || 20)}
            placeholder="Tempo (sec)"
          />
          <Input
            type="number"
            value={question.points}
            onChange={(e) => updateField("points", parseInt(e.target.value) || 1000)}
            placeholder="Punti"
          />
        </div>

        <Textarea
          value={question.text}
          onChange={(e) => updateField("text", e.target.value)}
          placeholder="Testo della domanda..."
        />

        <Input
          value={question.mediaUrl || ""}
          onChange={(e) => updateField("mediaUrl", e.target.value || null)}
          placeholder="URL immagine (opzionale)"
        />

        {/* Type-specific options editors */}
        {question.type === "MULTIPLE_CHOICE" && (
          <MultipleChoiceEditor options={question.options as any} onChange={updateOptions} />
        )}
        {question.type === "TRUE_FALSE" && (
          <TrueFalseEditor options={question.options as any} onChange={updateOptions} />
        )}
        {question.type === "OPEN_ANSWER" && (
          <OpenAnswerEditor options={question.options as any} onChange={updateOptions} />
        )}
        {question.type === "ORDERING" && (
          <OrderingEditor options={question.options as any} onChange={updateOptions} />
        )}
        {question.type === "MATCHING" && (
          <MatchingEditor options={question.options as any} onChange={updateOptions} />
        )}
      </CardContent>
    </Card>
  );
}

function MultipleChoiceEditor({ options, onChange }: { options: any; onChange: (o: any) => void }) {
  const choices = options.choices || [];
  return (
    <div className="space-y-2">
      {choices.map((choice: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={choice.isCorrect}
            onChange={(e) => {
              const updated = [...choices];
              updated[i] = { ...updated[i], isCorrect: e.target.checked };
              onChange({ choices: updated });
            }}
          />
          <Input
            value={choice.text}
            onChange={(e) => {
              const updated = [...choices];
              updated[i] = { ...updated[i], text: e.target.value };
              onChange({ choices: updated });
            }}
            placeholder={`Opzione ${i + 1}`}
            className="flex-1"
          />
          {choices.length > 2 && (
            <Button variant="ghost" size="sm" onClick={() => {
              onChange({ choices: choices.filter((_: any, j: number) => j !== i) });
            }}>X</Button>
          )}
        </div>
      ))}
      {choices.length < 6 && (
        <Button variant="outline" size="sm" onClick={() => {
          onChange({ choices: [...choices, { text: "", isCorrect: false }] });
        }}>+ Aggiungi opzione</Button>
      )}
    </div>
  );
}

function TrueFalseEditor({ options, onChange }: { options: any; onChange: (o: any) => void }) {
  return (
    <div className="flex gap-4">
      <label className="flex items-center gap-2">
        <input type="radio" checked={options.correct === true} onChange={() => onChange({ correct: true })} />
        Vero
      </label>
      <label className="flex items-center gap-2">
        <input type="radio" checked={options.correct === false} onChange={() => onChange({ correct: false })} />
        Falso
      </label>
    </div>
  );
}

function OpenAnswerEditor({ options, onChange }: { options: any; onChange: (o: any) => void }) {
  const answers = options.acceptedAnswers || [];
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Risposte accettate (case-insensitive):</p>
      {answers.map((a: string, i: number) => (
        <div key={i} className="flex gap-2">
          <Input
            value={a}
            onChange={(e) => {
              const updated = [...answers];
              updated[i] = e.target.value;
              onChange({ acceptedAnswers: updated });
            }}
            placeholder={`Risposta ${i + 1}`}
            className="flex-1"
          />
          {answers.length > 1 && (
            <Button variant="ghost" size="sm" onClick={() => {
              onChange({ acceptedAnswers: answers.filter((_: any, j: number) => j !== i) });
            }}>X</Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => {
        onChange({ acceptedAnswers: [...answers, ""] });
      }}>+ Aggiungi risposta</Button>
    </div>
  );
}

function OrderingEditor({ options, onChange }: { options: any; onChange: (o: any) => void }) {
  const items = options.items || [];
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Inserisci gli elementi nell ordine corretto:</p>
      {items.map((item: string, i: number) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
          <Input
            value={item}
            onChange={(e) => {
              const updated = [...items];
              updated[i] = e.target.value;
              onChange({ items: updated, correctOrder: updated.map((_: any, idx: number) => idx) });
            }}
            placeholder={`Elemento ${i + 1}`}
            className="flex-1"
          />
          {items.length > 2 && (
            <Button variant="ghost" size="sm" onClick={() => {
              const updated = items.filter((_: any, j: number) => j !== i);
              onChange({ items: updated, correctOrder: updated.map((_: any, idx: number) => idx) });
            }}>X</Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => {
        const updated = [...items, ""];
        onChange({ items: updated, correctOrder: updated.map((_: any, idx: number) => idx) });
      }}>+ Aggiungi elemento</Button>
    </div>
  );
}

function MatchingEditor({ options, onChange }: { options: any; onChange: (o: any) => void }) {
  const pairs = options.pairs || [];
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Coppie da abbinare:</p>
      {pairs.map((pair: any, i: number) => (
        <div key={i} className="flex gap-2 items-center">
          <Input
            value={pair.left}
            onChange={(e) => {
              const updated = [...pairs];
              updated[i] = { ...updated[i], left: e.target.value };
              onChange({ pairs: updated });
            }}
            placeholder="Sinistra"
            className="flex-1"
          />
          <span className="text-muted-foreground">↔</span>
          <Input
            value={pair.right}
            onChange={(e) => {
              const updated = [...pairs];
              updated[i] = { ...updated[i], right: e.target.value };
              onChange({ pairs: updated });
            }}
            placeholder="Destra"
            className="flex-1"
          />
          {pairs.length > 2 && (
            <Button variant="ghost" size="sm" onClick={() => {
              onChange({ pairs: pairs.filter((_: any, j: number) => j !== i) });
            }}>X</Button>
          )}
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => {
        onChange({ pairs: [...pairs, { left: "", right: "" }] });
      }}>+ Aggiungi coppia</Button>
    </div>
  );
}
```

**Step 2: Create QuizEditor component**

Create `src/components/quiz/quiz-editor.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { QuestionEditor } from "./question-editor";
import type { QuizInput, QuestionInput } from "@/lib/validators/quiz";

const defaultQuestion: QuestionInput = {
  type: "MULTIPLE_CHOICE",
  text: "",
  timeLimit: 20,
  points: 1000,
  order: 0,
  options: { choices: [{ text: "", isCorrect: false }, { text: "", isCorrect: true }] },
};

interface Props {
  initialData?: QuizInput & { id?: string };
}

export function QuizEditor({ initialData }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [tags, setTags] = useState(initialData?.tags?.join(", ") || "");
  const [questions, setQuestions] = useState<QuestionInput[]>(
    initialData?.questions || [{ ...defaultQuestion }]
  );

  function updateQuestion(index: number, question: QuestionInput) {
    const updated = [...questions];
    updated[index] = question;
    setQuestions(updated);
  }

  function removeQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function addQuestion() {
    setQuestions([...questions, { ...defaultQuestion, order: questions.length }]);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const payload: QuizInput = {
      title,
      description: description || undefined,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      questions: questions.map((q, i) => ({ ...q, order: i })),
    };

    const isEdit = !!initialData?.id;
    const url = isEdit ? `/api/quiz/${initialData!.id}` : "/api/quiz";
    const method = isEdit ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error ? JSON.stringify(data.error) : "Errore nel salvataggio");
      setSaving(false);
      return;
    }

    router.push("/dashboard/quiz");
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="space-y-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titolo del quiz"
          className="text-lg font-semibold"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrizione (opzionale)"
        />
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tag separati da virgola (es: matematica, geometria)"
        />
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => (
          <QuestionEditor
            key={i}
            question={q}
            index={i}
            onChange={updateQuestion}
            onRemove={removeQuestion}
          />
        ))}
      </div>

      <Button variant="outline" onClick={addQuestion} className="w-full">
        + Aggiungi domanda
      </Button>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Salvataggio..." : "Salva Quiz"}
        </Button>
        <Button variant="outline" onClick={() => router.back()}>Annulla</Button>
      </div>
    </div>
  );
}
```

**Step 3: Create new quiz page**

Create `src/app/(dashboard)/quiz/new/page.tsx`:
```typescript
import { QuizEditor } from "@/components/quiz/quiz-editor";

export default function NewQuizPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Nuovo Quiz</h1>
      <QuizEditor />
    </div>
  );
}
```

**Step 4: Create edit quiz page**

Create `src/app/(dashboard)/quiz/[id]/edit/page.tsx`:
```typescript
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { QuizEditor } from "@/components/quiz/quiz-editor";

export default async function EditQuizPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const quiz = await prisma.quiz.findUnique({
    where: { id: params.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });

  if (!quiz) notFound();

  const initialData = {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description || undefined,
    tags: quiz.tags,
    isPublic: quiz.isPublic,
    questions: quiz.questions.map((q) => ({
      type: q.type as any,
      text: q.text,
      mediaUrl: q.mediaUrl,
      timeLimit: q.timeLimit,
      points: q.points,
      order: q.order,
      options: q.options as any,
    })),
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Modifica Quiz</h1>
      <QuizEditor initialData={initialData} />
    </div>
  );
}
```

**Step 5: Verify**

```bash
npm run dev
```

Test creating and editing a quiz via the UI.

**Step 6: Commit**

```bash
git add src/components/quiz/ src/app/\(dashboard\)/quiz/
git commit -m "feat: add quiz editor with all 5 question types"
```

---

## Phase 3: Live Quiz

### Task 11: Session API (create session, generate PIN)

**Files:**
- Create: `src/app/api/session/route.ts`, `src/app/api/session/[id]/route.ts`

**Step 1: Create session endpoint**

Create `src/app/api/session/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function uniquePin(): Promise<string> {
  let pin: string;
  let exists: boolean;
  do {
    pin = generatePin();
    const found = await prisma.session.findFirst({
      where: { pin, status: { not: "FINISHED" } },
    });
    exists = !!found;
  } while (exists);
  return pin;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quizId } = await req.json();
  if (!quizId) return NextResponse.json({ error: "quizId required" }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const pin = await uniquePin();

  const gameSession = await prisma.session.create({
    data: {
      quizId,
      hostId: session.user.id,
      pin,
    },
  });

  return NextResponse.json(gameSession, { status: 201 });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { hostId: session.user.id },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sessions);
}
```

**Step 2: Commit**

```bash
git add src/app/api/session/
git commit -m "feat: add session API with unique PIN generation"
```

---

### Task 12: Socket.io server integration

**Files:**
- Create: `src/lib/socket/server.ts`, `src/lib/socket/events.ts`, `src/lib/socket/client.ts`, `src/server.ts`

Socket.io cannot run inside Next.js API routes natively. We need a custom server.

**Step 1: Create custom server**

Create `src/server.ts`:
```typescript
import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { setupSocketHandlers } from "@/lib/socket/server";
import type { ServerToClientEvents, ClientToServerEvents } from "@/types";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
    path: "/api/socketio",
  });

  setupSocketHandlers(io);

  const port = parseInt(process.env.PORT || "3000");
  httpServer.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
```

**Step 2: Create socket event handlers**

Create `src/lib/socket/server.ts`:
```typescript
import { Server, Socket } from "socket.io";
import { prisma } from "@/lib/db/client";
import { checkAnswer, calculateScore } from "@/lib/scoring";
import type { ServerToClientEvents, ClientToServerEvents } from "@/types";

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type SocketType = Socket<ClientToServerEvents, ServerToClientEvents>;

// In-memory game state per session
interface GameState {
  sessionId: string;
  currentQuestionIndex: number;
  players: Map<string, { socketId: string; name: string; email?: string; totalScore: number }>;
  questionStartTime?: number;
  answerCount: number;
}

const games = new Map<string, GameState>();

export function setupSocketHandlers(io: IO) {
  io.on("connection", (socket: SocketType) => {
    let currentPin: string | null = null;
    let currentPlayerName: string | null = null;

    socket.on("joinSession", async ({ pin, playerName, playerEmail }) => {
      const session = await prisma.session.findFirst({
        where: { pin, status: { not: "FINISHED" } },
      });

      if (!session) {
        socket.emit("sessionError", { message: "Sessione non trovata" });
        return;
      }

      currentPin = pin;
      currentPlayerName = playerName;
      socket.join(`session:${pin}`);

      // Initialize game state if needed
      if (!games.has(pin)) {
        games.set(pin, {
          sessionId: session.id,
          currentQuestionIndex: -1,
          players: new Map(),
          answerCount: 0,
        });
      }

      const game = games.get(pin)!;
      game.players.set(playerName, {
        socketId: socket.id,
        name: playerName,
        email: playerEmail,
        totalScore: 0,
      });

      io.to(`session:${pin}`).emit("playerJoined", {
        playerName,
        playerCount: game.players.size,
      });

      // If game is in progress, send current state
      if (game.currentQuestionIndex >= 0) {
        socket.emit("gameState", {
          status: "IN_PROGRESS",
          currentQuestion: game.currentQuestionIndex,
        });
      }
    });

    socket.on("startGame", async () => {
      if (!currentPin) return;
      const game = games.get(currentPin);
      if (!game) return;

      await prisma.session.update({
        where: { id: game.sessionId },
        data: { status: "IN_PROGRESS", startedAt: new Date() },
      });

      // Send first question
      await sendNextQuestion(io, currentPin);
    });

    socket.on("nextQuestion", async () => {
      if (!currentPin) return;
      await sendNextQuestion(io, currentPin);
    });

    socket.on("submitAnswer", async ({ value, responseTimeMs }) => {
      if (!currentPin || !currentPlayerName) return;
      const game = games.get(currentPin);
      if (!game || game.currentQuestionIndex < 0) return;

      const session = await prisma.session.findUnique({
        where: { id: game.sessionId },
        include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
      });
      if (!session) return;

      const question = session.quiz.questions[game.currentQuestionIndex];
      if (!question) return;

      const isCorrect = checkAnswer(question.type, question.options, value);
      const score = calculateScore({
        isCorrect,
        responseTimeMs,
        timeLimit: question.timeLimit,
        maxPoints: question.points,
      });

      const player = game.players.get(currentPlayerName);
      if (player) player.totalScore += score;

      // Save to DB
      await prisma.answer.upsert({
        where: {
          sessionId_questionId_playerName: {
            sessionId: game.sessionId,
            questionId: question.id,
            playerName: currentPlayerName,
          },
        },
        create: {
          sessionId: game.sessionId,
          questionId: question.id,
          playerName: currentPlayerName,
          playerEmail: player?.email,
          value: value as any,
          isCorrect,
          responseTimeMs,
          score,
        },
        update: {},
      });

      game.answerCount++;

      // Send feedback to the player
      const position = [...game.players.values()]
        .sort((a, b) => b.totalScore - a.totalScore)
        .findIndex((p) => p.name === currentPlayerName) + 1;

      const totalPlayers = game.players.size;
      const correctCount = game.answerCount; // simplified

      socket.emit("answerFeedback", {
        isCorrect,
        score,
        totalScore: player?.totalScore || 0,
        position,
        classCorrectPercent: 0, // calculated at question end
      });

      // Notify host of answer count
      io.to(`session:${currentPin}`).emit("answerCount", {
        count: game.answerCount,
        total: game.players.size,
      });
    });

    socket.on("endGame", async () => {
      if (!currentPin) return;
      const game = games.get(currentPin);
      if (!game) return;

      await prisma.session.update({
        where: { id: game.sessionId },
        data: { status: "FINISHED", endedAt: new Date() },
      });

      const sorted = [...game.players.values()].sort((a, b) => b.totalScore - a.totalScore);

      io.to(`session:${currentPin}`).emit("gameOver", {
        podium: sorted.slice(0, 3).map((p, i) => ({
          playerName: p.name,
          score: p.totalScore,
          position: i + 1,
        })),
        fullResults: sorted.map((p) => ({ playerName: p.name, score: p.totalScore })),
      });

      games.delete(currentPin);
    });

    socket.on("disconnect", () => {
      if (currentPin && currentPlayerName) {
        const game = games.get(currentPin);
        if (game) {
          game.players.delete(currentPlayerName);
          io.to(`session:${currentPin}`).emit("playerLeft", {
            playerName: currentPlayerName,
            playerCount: game.players.size,
          });
        }
      }
    });
  });
}

async function sendNextQuestion(io: IO, pin: string) {
  const game = games.get(pin);
  if (!game) return;

  game.currentQuestionIndex++;
  game.answerCount = 0;

  const session = await prisma.session.findUnique({
    where: { id: game.sessionId },
    include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!session) return;

  const question = session.quiz.questions[game.currentQuestionIndex];
  if (!question) {
    // No more questions — end game automatically
    return;
  }

  game.questionStartTime = Date.now();

  // Send question to all (strip correct answers for players)
  const sanitizedOptions = sanitizeOptions(question.type, question.options as any);

  io.to(`session:${pin}`).emit("questionStart", {
    questionIndex: game.currentQuestionIndex,
    totalQuestions: session.quiz.questions.length,
    question: {
      text: question.text,
      type: question.type,
      options: sanitizedOptions,
      timeLimit: question.timeLimit,
      points: question.points,
      mediaUrl: question.mediaUrl,
    },
  });
}

function sanitizeOptions(type: string, options: any): any {
  switch (type) {
    case "MULTIPLE_CHOICE":
      return { choices: options.choices.map((c: any) => ({ text: c.text })) };
    case "TRUE_FALSE":
      return {};
    case "OPEN_ANSWER":
      return {};
    case "ORDERING":
      // Shuffle items for the player
      const shuffled = [...options.items].sort(() => Math.random() - 0.5);
      return { items: shuffled };
    case "MATCHING":
      // Shuffle right side
      const rights = options.pairs.map((p: any) => p.right).sort(() => Math.random() - 0.5);
      return { lefts: options.pairs.map((p: any) => p.left), rights };
    default:
      return options;
  }
}
```

**Step 3: Create client-side socket hook**

Create `src/lib/socket/client.ts`:
```typescript
"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@/types";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export function useSocket() {
  const socketRef = useRef<TypedSocket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket: TypedSocket = io({
      path: "/api/socketio",
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, []);

  return { socket: socketRef.current, connected };
}
```

**Step 4: Update package.json scripts**

Add to `package.json` scripts:
```json
"dev:custom": "tsx watch src/server.ts",
"start:custom": "NODE_ENV=production tsx src/server.ts"
```

Install tsx: `npm install -D tsx`

**Step 5: Verify Socket.io starts**

```bash
npm run dev:custom
```

Check console for "Ready on http://localhost:3000".

**Step 6: Commit**

```bash
git add src/server.ts src/lib/socket/ package.json
git commit -m "feat: add Socket.io server with game state management and client hook"
```

---

### Task 13: Host screen (LIM/projector)

**Files:**
- Create: `src/app/(live)/host/[sessionId]/page.tsx`, `src/components/live/host-view.tsx`

**Step 1: Create host view component**

Create `src/components/live/host-view.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/lib/socket/client";
import { Button } from "@/components/ui/button";

type Phase = "lobby" | "question" | "result" | "podium";

interface Props {
  session: {
    id: string;
    pin: string;
    quiz: { title: string; questions: any[] };
  };
}

export function HostView({ session }: Props) {
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<Phase>("lobby");
  const [players, setPlayers] = useState<string[]>([]);
  const [playerCount, setPlayerCount] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [answerProgress, setAnswerProgress] = useState({ count: 0, total: 0 });
  const [result, setResult] = useState<any>(null);
  const [podium, setPodium] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!socket) return;

    // Host joins as a special player
    socket.emit("joinSession", { pin: session.pin, playerName: "__host__" });

    socket.on("playerJoined", ({ playerName, playerCount: count }) => {
      if (playerName !== "__host__") {
        setPlayers((prev) => [...prev, playerName]);
      }
      setPlayerCount(count - 1); // exclude host
    });

    socket.on("playerLeft", ({ playerName, playerCount: count }) => {
      setPlayers((prev) => prev.filter((p) => p !== playerName));
      setPlayerCount(count - 1);
    });

    socket.on("questionStart", (data) => {
      setPhase("question");
      setCurrentQuestion(data.question);
      setQuestionIndex(data.questionIndex);
      setTotalQuestions(data.totalQuestions);
      setTimeLeft(data.question.timeLimit);
      setAnswerProgress({ count: 0, total: playerCount });
    });

    socket.on("answerCount", (data) => {
      setAnswerProgress(data);
    });

    socket.on("questionResult", (data) => {
      setPhase("result");
      setResult(data);
    });

    socket.on("gameOver", (data) => {
      setPhase("podium");
      setPodium(data);
    });

    return () => {
      socket.off("playerJoined");
      socket.off("playerLeft");
      socket.off("questionStart");
      socket.off("answerCount");
      socket.off("questionResult");
      socket.off("gameOver");
    };
  }, [socket, session.pin, playerCount]);

  // Countdown timer
  useEffect(() => {
    if (phase !== "question" || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft]);

  function startGame() {
    socket?.emit("startGame");
  }

  function nextQuestion() {
    socket?.emit("nextQuestion");
  }

  function endGame() {
    socket?.emit("endGame");
  }

  if (phase === "lobby") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 text-white">
        <h1 className="text-3xl font-bold mb-2">{session.quiz.title}</h1>
        <p className="text-xl mb-8">Entra su questo sito e inserisci il PIN</p>
        <div className="text-7xl font-mono font-bold tracking-widest bg-white text-blue-800 px-8 py-4 rounded-xl mb-8">
          {session.pin}
        </div>
        <p className="text-lg mb-4">Connessi: {playerCount}</p>
        <div className="flex flex-wrap gap-2 max-w-lg justify-center mb-8">
          {players.filter(p => p !== "__host__").map((p) => (
            <span key={p} className="bg-white/20 px-3 py-1 rounded-full text-sm">{p}</span>
          ))}
        </div>
        {playerCount > 0 && (
          <Button size="lg" onClick={startGame} className="bg-green-500 hover:bg-green-600 text-xl px-8 py-6">
            Avvia Quiz
          </Button>
        )}
      </div>
    );
  }

  if (phase === "question") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-purple-600 to-purple-800 text-white p-8">
        <div className="flex justify-between w-full max-w-4xl mb-4">
          <span className="text-lg">{questionIndex + 1} / {totalQuestions}</span>
          <span className="text-4xl font-bold">{timeLeft}s</span>
        </div>
        <h2 className="text-3xl font-bold text-center mb-8 max-w-3xl">{currentQuestion?.text}</h2>
        {currentQuestion?.mediaUrl && (
          <img src={currentQuestion.mediaUrl} alt="" className="max-h-64 rounded-lg mb-8" />
        )}
        {currentQuestion?.type === "MULTIPLE_CHOICE" && (
          <div className="grid grid-cols-2 gap-4 w-full max-w-3xl">
            {currentQuestion.options.choices?.map((c: any, i: number) => {
              const colors = ["bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500"];
              return (
                <div key={i} className={`${colors[i % 4]} p-6 rounded-xl text-xl font-semibold text-center`}>
                  {c.text}
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-8 w-full max-w-3xl">
          <div className="bg-white/20 rounded-full h-4 overflow-hidden">
            <div
              className="bg-white h-full transition-all"
              style={{ width: `${answerProgress.total > 0 ? (answerProgress.count / answerProgress.total) * 100 : 0}%` }}
            />
          </div>
          <p className="text-center mt-2">Risposte: {answerProgress.count} / {answerProgress.total}</p>
        </div>
      </div>
    );
  }

  if (phase === "result" && result) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-indigo-600 to-indigo-800 text-white p-8">
        <h2 className="text-2xl mb-8">Risultati domanda {questionIndex + 1}</h2>
        <div className="space-y-2 w-full max-w-2xl mb-8">
          {result.leaderboard.slice(0, 5).map((entry: any, i: number) => (
            <div key={i} className="flex justify-between bg-white/10 px-4 py-3 rounded-lg">
              <span className="font-bold">{i + 1}. {entry.playerName}</span>
              <span>+{entry.delta} ({entry.score} tot)</span>
            </div>
          ))}
        </div>
        <div className="flex gap-4">
          {questionIndex < totalQuestions - 1 ? (
            <Button size="lg" onClick={nextQuestion} className="bg-green-500 hover:bg-green-600 text-xl px-8 py-6">
              Prossima domanda
            </Button>
          ) : (
            <Button size="lg" onClick={endGame} className="bg-orange-500 hover:bg-orange-600 text-xl px-8 py-6">
              Mostra podio
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (phase === "podium" && podium) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-amber-500 to-orange-600 text-white p-8">
        <h1 className="text-4xl font-bold mb-12">Podio</h1>
        <div className="flex items-end gap-4 mb-12">
          {podium.podium[1] && (
            <div className="text-center">
              <p className="text-xl font-bold">{podium.podium[1].playerName}</p>
              <div className="bg-gray-300 w-32 h-32 rounded-t-lg flex items-center justify-center">
                <span className="text-3xl">🥈</span>
              </div>
              <p>{podium.podium[1].score}</p>
            </div>
          )}
          {podium.podium[0] && (
            <div className="text-center">
              <p className="text-xl font-bold">{podium.podium[0].playerName}</p>
              <div className="bg-yellow-300 w-32 h-48 rounded-t-lg flex items-center justify-center">
                <span className="text-4xl">🥇</span>
              </div>
              <p>{podium.podium[0].score}</p>
            </div>
          )}
          {podium.podium[2] && (
            <div className="text-center">
              <p className="text-xl font-bold">{podium.podium[2].playerName}</p>
              <div className="bg-amber-600 w-32 h-24 rounded-t-lg flex items-center justify-center">
                <span className="text-3xl">🥉</span>
              </div>
              <p>{podium.podium[2].score}</p>
            </div>
          )}
        </div>
        <Button variant="outline" className="text-white border-white" onClick={() => window.location.href = "/dashboard/quiz"}>
          Torna alla dashboard
        </Button>
      </div>
    );
  }

  return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
}
```

**Step 2: Create host page**

Create `src/app/(live)/host/[sessionId]/page.tsx`:
```typescript
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { HostView } from "@/components/live/host-view";

export default async function HostPage({ params }: { params: { sessionId: string } }) {
  const authSession = await getServerSession(authOptions);
  if (!authSession) notFound();

  const session = await prisma.session.findUnique({
    where: { id: params.sessionId },
    include: {
      quiz: {
        include: { questions: { orderBy: { order: "asc" } } },
      },
    },
  });

  if (!session || session.hostId !== authSession.user!.id) notFound();

  return <HostView session={JSON.parse(JSON.stringify(session))} />;
}
```

**Step 3: Commit**

```bash
git add src/app/\(live\)/host/ src/components/live/host-view.tsx
git commit -m "feat: add host screen with lobby, question, result, and podium phases"
```

---

### Task 14: Player screen (smartphone)

**Files:**
- Create: `src/app/(live)/play/[sessionId]/page.tsx`, `src/components/live/player-view.tsx`, `src/app/page.tsx` (landing with PIN join)

**Step 1: Create player view component**

Create `src/components/live/player-view.tsx`:
```typescript
"use client";

import { useEffect, useState } from "react";
import { useSocket } from "@/lib/socket/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { QuestionType } from "@prisma/client";

type Phase = "join" | "waiting" | "question" | "feedback" | "podium";

export function PlayerView() {
  const { socket, connected } = useSocket();
  const [phase, setPhase] = useState<Phase>("join");
  const [pin, setPin] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [feedback, setFeedback] = useState<any>(null);
  const [podium, setPodium] = useState<any>(null);
  const [startTime, setStartTime] = useState(0);

  useEffect(() => {
    if (!socket) return;

    socket.on("sessionError", ({ message }) => setError(message));

    socket.on("playerJoined", () => {
      if (phase === "join") setPhase("waiting");
    });

    socket.on("questionStart", (data) => {
      setPhase("question");
      setQuestion(data);
      setTimeLeft(data.question.timeLimit);
      setAnswered(false);
      setFeedback(null);
      setStartTime(Date.now());
    });

    socket.on("answerFeedback", (data) => {
      setPhase("feedback");
      setFeedback(data);
    });

    socket.on("gameOver", (data) => {
      setPhase("podium");
      setPodium(data);
    });

    return () => {
      socket.off("sessionError");
      socket.off("playerJoined");
      socket.off("questionStart");
      socket.off("answerFeedback");
      socket.off("gameOver");
    };
  }, [socket, phase]);

  // Timer
  useEffect(() => {
    if (phase !== "question" || timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [phase, timeLeft]);

  function joinGame() {
    if (!pin || !playerName) return;
    setError(null);
    socket?.emit("joinSession", { pin, playerName });
    setPhase("waiting");
  }

  function submitAnswer(value: any) {
    if (answered) return;
    setAnswered(true);
    const responseTimeMs = Date.now() - startTime;
    socket?.emit("submitAnswer", { value, responseTimeMs });
  }

  // JOIN SCREEN
  if (phase === "join") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-gradient-to-b from-blue-600 to-blue-800 text-white">
        <h1 className="text-3xl font-bold mb-8">Quiz Live</h1>
        <div className="w-full max-w-xs space-y-4">
          <Input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="PIN"
            className="text-center text-2xl bg-white text-black"
            maxLength={6}
          />
          <Input
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            placeholder="Il tuo nome"
            className="text-center text-xl bg-white text-black"
            maxLength={30}
          />
          {error && <p className="text-red-300 text-center">{error}</p>}
          <Button onClick={joinGame} className="w-full text-xl py-6 bg-green-500 hover:bg-green-600" disabled={pin.length !== 6 || !playerName}>
            Entra
          </Button>
        </div>
      </div>
    );
  }

  // WAITING SCREEN
  if (phase === "waiting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 text-white">
        <h2 className="text-2xl font-bold mb-4">Sei dentro!</h2>
        <p className="text-lg">{playerName}</p>
        <p className="mt-4 text-white/70">In attesa che il prof avvii il quiz...</p>
      </div>
    );
  }

  // QUESTION SCREEN
  if (phase === "question" && question) {
    const q = question.question;
    return (
      <div className="flex flex-col min-h-screen bg-gradient-to-b from-purple-600 to-purple-800 text-white p-4">
        <div className="flex justify-between mb-4">
          <span>{question.questionIndex + 1}/{question.totalQuestions}</span>
          <span className="text-2xl font-bold">{timeLeft}s</span>
        </div>
        <h2 className="text-xl font-bold text-center mb-6">{q.text}</h2>

        {answered ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xl">Risposta inviata! In attesa...</p>
          </div>
        ) : (
          <div className="flex-1">
            <AnswerInput type={q.type} options={q.options} onSubmit={submitAnswer} />
          </div>
        )}
      </div>
    );
  }

  // FEEDBACK SCREEN
  if (phase === "feedback" && feedback) {
    return (
      <div className={`flex flex-col items-center justify-center min-h-screen p-6 ${
        feedback.isCorrect ? "bg-green-600" : "bg-red-600"
      } text-white`}>
        <div className="text-6xl mb-4">{feedback.isCorrect ? "✓" : "✗"}</div>
        <h2 className="text-2xl font-bold mb-2">
          {feedback.isCorrect ? "Corretto!" : "Sbagliato!"}
        </h2>
        <p className="text-xl">+{feedback.score} punti</p>
        <p className="mt-4">Posizione: {feedback.position}°</p>
        <p>Totale: {feedback.totalScore}</p>
      </div>
    );
  }

  // PODIUM SCREEN
  if (phase === "podium" && podium) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-amber-500 to-orange-600 text-white p-6">
        <h1 className="text-3xl font-bold mb-8">Risultati</h1>
        {podium.podium.map((p: any) => (
          <div key={p.position} className="flex items-center gap-4 mb-4">
            <span className="text-3xl">{["🥇","🥈","🥉"][p.position-1]}</span>
            <span className="text-xl font-bold">{p.playerName}</span>
            <span>{p.score} pt</span>
          </div>
        ))}
      </div>
    );
  }

  return <div className="flex items-center justify-center min-h-screen">Caricamento...</div>;
}

// Sub-component for different answer types
function AnswerInput({ type, options, onSubmit }: { type: QuestionType; options: any; onSubmit: (v: any) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [textValue, setTextValue] = useState("");
  const [order, setOrder] = useState<number[]>([]);
  const [matches, setMatches] = useState<[number, number][]>([]);

  if (type === "MULTIPLE_CHOICE") {
    const colors = ["bg-red-500", "bg-blue-500", "bg-yellow-500", "bg-green-500"];
    return (
      <div className="grid grid-cols-1 gap-3">
        {options.choices?.map((c: any, i: number) => (
          <button
            key={i}
            onClick={() => {
              const newSelected = selected.includes(i)
                ? selected.filter((s) => s !== i)
                : [...selected, i];
              setSelected(newSelected);
            }}
            className={`${colors[i % 4]} ${selected.includes(i) ? "ring-4 ring-white" : ""} p-4 rounded-xl text-lg font-semibold`}
          >
            {c.text}
          </button>
        ))}
        <Button onClick={() => onSubmit({ selected })} disabled={selected.length === 0} className="mt-4 bg-white text-purple-800 text-xl py-6">
          Conferma
        </Button>
      </div>
    );
  }

  if (type === "TRUE_FALSE") {
    return (
      <div className="grid grid-cols-2 gap-4">
        <button onClick={() => onSubmit({ selected: true })} className="bg-green-500 p-8 rounded-xl text-2xl font-bold">
          Vero
        </button>
        <button onClick={() => onSubmit({ selected: false })} className="bg-red-500 p-8 rounded-xl text-2xl font-bold">
          Falso
        </button>
      </div>
    );
  }

  if (type === "OPEN_ANSWER") {
    return (
      <div className="space-y-4">
        <Input
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          placeholder="La tua risposta..."
          className="text-xl bg-white text-black p-4"
        />
        <Button onClick={() => onSubmit({ text: textValue })} disabled={!textValue} className="w-full bg-white text-purple-800 text-xl py-6">
          Invia
        </Button>
      </div>
    );
  }

  if (type === "ORDERING") {
    // Simplified: number input for now. Full drag-drop in polish phase.
    const items = options.items || [];
    const [localOrder, setLocalOrder] = useState<string[]>(items);

    function moveUp(i: number) {
      if (i === 0) return;
      const arr = [...localOrder];
      [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
      setLocalOrder(arr);
    }

    function moveDown(i: number) {
      if (i === localOrder.length - 1) return;
      const arr = [...localOrder];
      [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      setLocalOrder(arr);
    }

    return (
      <div className="space-y-2">
        {localOrder.map((item: string, i: number) => (
          <div key={i} className="flex items-center gap-2 bg-white/20 p-3 rounded-lg">
            <span className="flex-1">{item}</span>
            <button onClick={() => moveUp(i)} className="px-2">↑</button>
            <button onClick={() => moveDown(i)} className="px-2">↓</button>
          </div>
        ))}
        <Button onClick={() => {
          const orderMap = localOrder.map((item: string) => items.indexOf(item));
          onSubmit({ order: orderMap });
        }} className="w-full bg-white text-purple-800 text-xl py-6 mt-4">
          Conferma
        </Button>
      </div>
    );
  }

  if (type === "MATCHING") {
    // Simplified matching
    const lefts = options.lefts || [];
    const rights = options.rights || [];
    const [localMatches, setLocalMatches] = useState<(number | null)[]>(lefts.map(() => null));
    const [selectedLeft, setSelectedLeft] = useState<number | null>(null);

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            {lefts.map((l: string, i: number) => (
              <button
                key={i}
                onClick={() => setSelectedLeft(i)}
                className={`w-full p-3 rounded-lg text-left ${selectedLeft === i ? "bg-white text-purple-800" : "bg-white/20"}`}
              >
                {l} {localMatches[i] !== null ? ` → ${rights[localMatches[i]!]}` : ""}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            {rights.map((r: string, i: number) => (
              <button
                key={i}
                onClick={() => {
                  if (selectedLeft !== null) {
                    const updated = [...localMatches];
                    updated[selectedLeft] = i;
                    setLocalMatches(updated);
                    setSelectedLeft(null);
                  }
                }}
                className="w-full p-3 rounded-lg text-left bg-white/20"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
        <Button
          onClick={() => {
            const m: [number, number][] = localMatches
              .map((r, l) => (r !== null ? [l, r] as [number, number] : null))
              .filter((x): x is [number, number] => x !== null);
            onSubmit({ matches: m });
          }}
          disabled={localMatches.some((m) => m === null)}
          className="w-full bg-white text-purple-800 text-xl py-6"
        >
          Conferma
        </Button>
      </div>
    );
  }

  return <p>Tipo di domanda non supportato</p>;
}
```

**Step 2: Create player page and landing page**

Create `src/app/(live)/play/page.tsx`:
```typescript
import { PlayerView } from "@/components/live/player-view";

export default function PlayPage() {
  return <PlayerView />;
}
```

Update `src/app/page.tsx` (landing page with PIN entry):
```typescript
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { PlayerView } from "@/components/live/player-view";

export default async function HomePage() {
  return <PlayerView />;
}
```

**Step 3: Add "Start session" button to quiz list**

This button in the quiz list page calls `POST /api/session` and redirects to `/live/host/[sessionId]`. Add it to the quiz card or edit page. (Implement as a small client component button.)

Create `src/components/quiz/start-session-button.tsx`:
```typescript
"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function StartSessionButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId }),
    });
    const session = await res.json();
    router.push(`/live/host/${session.id}`);
  }

  return (
    <Button onClick={handleStart} disabled={loading} variant="default" size="sm">
      {loading ? "Avvio..." : "Gioca"}
    </Button>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/page.tsx src/app/\(live\)/play/ src/components/live/player-view.tsx src/components/quiz/start-session-button.tsx
git commit -m "feat: add player view with all answer types and landing page with PIN join"
```

---

### Task 15: Wire up question results (host sends results after all answers)

**Files:**
- Modify: `src/lib/socket/server.ts`

The host needs a way to trigger showing results. Add a `showResults` event. When the host clicks "Mostra risultati" (or the timer expires), the server calculates the distribution and leaderboard and emits `questionResult`.

**Step 1: Add showResults handler to socket server**

Add to `src/lib/socket/server.ts` inside the connection handler:
```typescript
socket.on("showResults" as any, async () => {
  if (!currentPin) return;
  const game = games.get(currentPin);
  if (!game) return;

  const session = await prisma.session.findUnique({
    where: { id: game.sessionId },
    include: { quiz: { include: { questions: { orderBy: { order: "asc" } } } } },
  });
  if (!session) return;

  const question = session.quiz.questions[game.currentQuestionIndex];
  if (!question) return;

  // Get answers for this question
  const answers = await prisma.answer.findMany({
    where: { sessionId: game.sessionId, questionId: question.id },
  });

  const correctCount = answers.filter((a) => a.isCorrect).length;
  const classCorrectPercent = answers.length > 0 ? Math.round((correctCount / answers.length) * 100) : 0;

  // Build leaderboard
  const leaderboard = [...game.players.values()]
    .filter((p) => p.name !== "__host__")
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((p) => {
      const answer = answers.find((a) => a.playerName === p.name);
      return {
        playerName: p.name,
        score: p.totalScore,
        delta: answer?.score || 0,
      };
    });

  io.to(`session:${currentPin}`).emit("questionResult", {
    correctAnswer: question.options as any,
    distribution: {},
    leaderboard,
  });

  // Also send classCorrectPercent to each player's feedback
  // (already sent individually via answerFeedback)
});
```

**Step 2: Add showResults button to host view**

Update the question phase in `host-view.tsx` to include a "Mostra risultati" button that emits `showResults`.

**Step 3: Commit**

```bash
git add src/lib/socket/server.ts src/components/live/host-view.tsx
git commit -m "feat: add showResults event to reveal answers and leaderboard"
```

---

## Phase 4: Statistics

### Task 16: Session detail page with stats

**Files:**
- Create: `src/app/(dashboard)/sessions/page.tsx`, `src/app/(dashboard)/sessions/[id]/page.tsx`

**Step 1: Create sessions list page**

Create `src/app/(dashboard)/sessions/page.tsx`:
```typescript
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);

  const sessions = await prisma.session.findMany({
    where: { hostId: session!.user!.id },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Sessioni</h1>
      <div className="space-y-3">
        {sessions.map((s) => (
          <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg">{s.quiz.title}</CardTitle>
                  <CardDescription>
                    PIN: {s.pin} &middot; {s.createdAt.toLocaleDateString("it-IT")}
                  </CardDescription>
                </div>
                <Badge variant={s.status === "FINISHED" ? "default" : "secondary"}>{s.status}</Badge>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Create session detail page with statistics**

Create `src/app/(dashboard)/sessions/[id]/page.tsx`:
```typescript
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export default async function SessionDetailPage({ params }: { params: { id: string } }) {
  const authSession = await getServerSession(authOptions);

  const session = await prisma.session.findUnique({
    where: { id: params.id },
    include: {
      quiz: { include: { questions: { orderBy: { order: "asc" } } } },
      answers: true,
    },
  });

  if (!session || session.hostId !== authSession!.user!.id) notFound();

  // Calculate stats
  const questions = session.quiz.questions;
  const answers = session.answers;

  // Unique players
  const players = [...new Set(answers.map((a) => a.playerName))];

  // Per-player total score
  const playerScores = players
    .map((name) => ({
      name,
      score: answers.filter((a) => a.playerName === name).reduce((sum, a) => sum + a.score, 0),
      correct: answers.filter((a) => a.playerName === name && a.isCorrect).length,
      total: answers.filter((a) => a.playerName === name).length,
    }))
    .sort((a, b) => b.score - a.score);

  // Per-question stats
  const questionStats = questions.map((q) => {
    const qAnswers = answers.filter((a) => a.questionId === q.id);
    const correct = qAnswers.filter((a) => a.isCorrect).length;
    const avgTime = qAnswers.length > 0
      ? Math.round(qAnswers.reduce((s, a) => s + a.responseTimeMs, 0) / qAnswers.length / 1000)
      : 0;
    return {
      text: q.text,
      type: q.type,
      correctPercent: qAnswers.length > 0 ? Math.round((correct / qAnswers.length) * 100) : 0,
      avgTimeSeconds: avgTime,
      totalAnswers: qAnswers.length,
    };
  });

  const hardest = [...questionStats].sort((a, b) => a.correctPercent - b.correctPercent)[0];
  const easiest = [...questionStats].sort((a, b) => b.correctPercent - a.correctPercent)[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{session.quiz.title}</h1>
        <p className="text-muted-foreground">
          PIN: {session.pin} &middot; {players.length} partecipanti &middot;{" "}
          {session.createdAt.toLocaleDateString("it-IT")}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-muted p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{players.length}</div>
          <div className="text-sm text-muted-foreground">Partecipanti</div>
        </div>
        <div className="bg-muted p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{questions.length}</div>
          <div className="text-sm text-muted-foreground">Domande</div>
        </div>
        <div className="bg-muted p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{hardest?.correctPercent ?? 0}%</div>
          <div className="text-sm text-muted-foreground">Piu difficile</div>
        </div>
        <div className="bg-muted p-4 rounded-lg text-center">
          <div className="text-2xl font-bold">{easiest?.correctPercent ?? 0}%</div>
          <div className="text-sm text-muted-foreground">Piu facile</div>
        </div>
      </div>

      {/* Leaderboard */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Classifica</h2>
        <div className="space-y-2">
          {playerScores.map((p, i) => (
            <div key={p.name} className="flex items-center justify-between bg-muted/50 px-4 py-3 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg w-8">{i + 1}.</span>
                <span>{p.name}</span>
              </div>
              <div className="text-right">
                <span className="font-bold">{p.score} pt</span>
                <span className="text-sm text-muted-foreground ml-2">
                  ({p.correct}/{p.total} corrette)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-question breakdown */}
      <div>
        <h2 className="text-xl font-semibold mb-3">Dettaglio domande</h2>
        <div className="space-y-2">
          {questionStats.map((q, i) => (
            <div key={i} className="flex items-center justify-between bg-muted/50 px-4 py-3 rounded-lg">
              <div className="flex-1">
                <p className="font-medium">{i + 1}. {q.text}</p>
                <p className="text-sm text-muted-foreground">{q.type}</p>
              </div>
              <div className="text-right">
                <span className={`font-bold ${q.correctPercent < 30 ? "text-red-500" : q.correctPercent > 70 ? "text-green-500" : ""}`}>
                  {q.correctPercent}% corrette
                </span>
                <span className="text-sm text-muted-foreground ml-2">~{q.avgTimeSeconds}s</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add src/app/\(dashboard\)/sessions/
git commit -m "feat: add sessions list and detail page with statistics"
```

---

### Task 17: Quiz aggregate stats page

**Files:**
- Create: `src/app/(dashboard)/quiz/[id]/stats/page.tsx`

Aggregate stats across all sessions of a quiz: times played, avg score trend, problematic questions.

**Step 1: Create page** (server component with DB queries and Recharts charts via client sub-component)

Create `src/app/(dashboard)/quiz/[id]/stats/page.tsx` and `src/components/stats/quiz-stats-charts.tsx`.

The page queries all sessions and answers for the quiz, computes aggregate metrics, and passes them to a client chart component using Recharts.

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/quiz/\[id\]/stats/ src/components/stats/
git commit -m "feat: add quiz aggregate statistics page with charts"
```

---

### Task 18: Dashboard home with quick stats

**Files:**
- Modify: `src/app/(dashboard)/page.tsx`

**Step 1: Update dashboard home**

Query: total quizzes, total sessions, avg engagement, recent sessions. Display as cards + list.

**Step 2: Commit**

```bash
git add src/app/\(dashboard\)/page.tsx
git commit -m "feat: add dashboard home with quick stats and recent sessions"
```

---

### Task 19: Global stats pages (students, topics)

**Files:**
- Create: `src/app/(dashboard)/stats/page.tsx`, `src/app/(dashboard)/stats/students/page.tsx`, `src/app/(dashboard)/stats/topics/page.tsx`

**Step 1: Create analytics overview** (`/stats`) — summary of all teaching activity.

**Step 2: Create student performance page** (`/stats/students`) — cross-session tracking for students who used Google auth.

**Step 3: Create topics page** (`/stats/topics`) — aggregate by quiz tags, show weak areas.

**Step 4: Commit**

```bash
git add src/app/\(dashboard\)/stats/
git commit -m "feat: add global analytics pages for students and topics"
```

---

### Task 20: CSV and PDF export

**Files:**
- Create: `src/app/api/stats/export/route.ts`

**Step 1: Create export API**

`GET /api/stats/export?sessionId=xxx&format=csv` — returns CSV of all answers.
`GET /api/stats/export?sessionId=xxx&format=pdf` — returns PDF report.

Use `papaparse` for CSV, `@react-pdf/renderer` for PDF.

**Step 2: Add export buttons to session detail page**

**Step 3: Commit**

```bash
git add src/app/api/stats/
git commit -m "feat: add CSV and PDF export for session results"
```

---

## Phase 5: Sharing and Polish

### Task 21: Quiz sharing between teachers

**Files:**
- Create: `src/app/(dashboard)/share/page.tsx`, `src/app/api/quiz/[id]/share/route.ts`

**Step 1: Create share API**

`POST /api/quiz/[id]/share` — body: `{ email, permission }`. Creates a QuizShare record.
`DELETE /api/quiz/[id]/share/[shareId]` — removes share.
`GET /api/quiz/[id]/share` — lists current shares.

**Step 2: Create share management UI**

Dialog on quiz edit page to add/remove shares. Share page lists all shares.

**Step 3: Commit**

```bash
git add src/app/api/quiz/\[id\]/share/ src/app/\(dashboard\)/share/
git commit -m "feat: add quiz sharing between teachers with permissions"
```

---

### Task 22: Responsive polish and animations

**Files:**
- Modify: various component files

**Step 1:** Make dashboard sidebar collapsible on mobile (Sheet component).

**Step 2:** Add CSS transitions/animations to live quiz (question appear, timer pulse, podium rise).

**Step 3:** Add sound effects (optional, using HTML5 Audio): countdown tick, correct/wrong buzzer.

**Step 4: Commit**

```bash
git commit -am "feat: add responsive layout and quiz animations"
```

---

### Task 23: E2E tests

**Files:**
- Create: `tests/e2e/quiz-flow.spec.ts`, `playwright.config.ts`

**Step 1: Setup Playwright**

```bash
npx playwright install
```

Create `playwright.config.ts` with base URL `http://localhost:3000`.

**Step 2: Write E2E test for full quiz flow**

Test: login → create quiz → start session → (simulate player join) → verify flow.

**Step 3: Commit**

```bash
git add tests/e2e/ playwright.config.ts
git commit -m "test: add E2E tests for quiz creation and live flow"
```

---

## Phase 6: Deploy

### Task 24: Production Docker setup

**Files:**
- Create: `Dockerfile`
- Modify: `docker-compose.yml`

**Step 1: Create production Dockerfile**

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src/server.ts ./src/server.ts

EXPOSE 3000
CMD ["npx", "tsx", "src/server.ts"]
```

**Step 2: Add app service to docker-compose.yml**

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - db
    restart: always
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: kahoot
      POSTGRES_USER: kahoot
      POSTGRES_PASSWORD: ${DB_PASSWORD:-kahoot}
    volumes:
      - pgdata:/var/lib/postgresql/data
    restart: always

volumes:
  pgdata:
```

**Step 3: Test build**

```bash
docker compose build
docker compose up -d
```

**Step 4: Commit**

```bash
git add Dockerfile docker-compose.yml
git commit -m "feat: add production Docker setup"
```

---

### Task 25: Seed data and documentation

**Files:**
- Create: `prisma/seed.ts`, `docs/SETUP.md`

**Step 1: Create seed script** with demo quiz data.

**Step 2: Create setup guide** for school IT admin: Docker install, Google OAuth config, env vars, startup.

**Step 3: Commit**

```bash
git add prisma/seed.ts docs/SETUP.md
git commit -m "docs: add seed data and deployment guide"
```

---

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1. Foundations | 1-7 | Project setup, DB, auth, types, scoring |
| 2. CRUD Quiz | 8-10 | API, list page, editor with 5 question types |
| 3. Live Quiz | 11-15 | Session API, Socket.io, host screen, player screen, results |
| 4. Statistics | 16-20 | Session stats, quiz stats, dashboard, analytics, export |
| 5. Sharing + Polish | 21-23 | Quiz sharing, responsive, animations, E2E tests |
| 6. Deploy | 24-25 | Docker production, seed, documentation |

**Total: 25 tasks across 6 phases.**
