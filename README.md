# SAVINT

**Free interactive quiz platform for schools.**

> **[English](README.md)** | **[Italiano](README.it.md)**

---

## Table of Contents

- [Description](#description)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [How it Works](#how-it-works)
- [Question Types](#question-types)
- [Main Commands](#main-commands)
- [Production Deploy](#production-deploy)
- [Admin User](#admin-user)
- [Google OAuth Setup](#google-oauth-setup)
- [License](#license)

---

## Description

Teachers create quizzes, project them on the interactive whiteboard and students answer in real-time from their phones. Designed to make lessons more engaging and formative assessment more immediate.

> SAVINT is and will always be **free for all schools**. New features will be added progressively to provide an ever-better experience for teachers and students.

## Features

- **9 question types**: multiple choice, true/false, open answer, ordering, matching, find the error, numeric estimation, image hotspot, code completion
- **Real-time live quizzes**: lobby with 6-digit PIN, countdown, animated leaderboard, final podium
- **Confidence level**: students indicate how confident they are in their answer, with score bonus or penalty
- **Excel import**: create quizzes from Excel files, with downloadable template and AI support
- **Moodle import**: import quizzes from Moodle XML format (multichoice, truefalse, shortanswer, matching, numerical)
- **Teacher dashboard**: create and edit quizzes, session history, advanced statistics
- **Statistics**: by session, quiz, student, topic, with interactive charts
- **Sharing**: share quizzes with colleagues with permissions (view/duplicate/edit)
- **Public library**: share quizzes publicly under Creative Commons 4.0 license for other teachers to play or duplicate
- **Export/Import**: .qlz format to share quizzes across schools, export results as CSV/PDF
- **Image upload**: upload images in questions or use external URLs
- **Custom emoticons**: custom avatars for students (just add PNGs to the `public/emoticons/` folder)
- **Authentication**: login with school Google Workspace
- **Multilingual**: Italian (default) and English, with automatic browser language detection and easy extensibility
- **Player reconnection**: players who switch apps or lose connection can automatically rejoin within 2 minutes
- **Session management**: teachers can rejoin active sessions and terminate them from the dashboard; sessions auto-expire after a configurable timeout (default 2 hours)
- **Content moderation**: report system, admin review panel, quiz suspension
- **Responsive**: optimized for interactive whiteboards (teacher) and phones (students)

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Real-time | Socket.io 4 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Auth | NextAuth v5 (Google OAuth) |
| i18n | next-intl |
| Charts | Recharts |
| Test | Vitest + Playwright |

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- **PostgreSQL 16** (local or via Docker)
- **Google Cloud account** for OAuth

### Installation

```bash
git clone https://github.com/BaolCristian/savint.git
cd savint
npm install
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env` with your values. Generate the NextAuth secret:

```bash
openssl rand -base64 32
```

### Database

```bash
# Create tables
npx prisma migrate dev

# (Optional) Load demo data
npx prisma db seed
```

The seed creates a demo teacher (`docente@scuola.it`) and a demo admin (`admin@scuola.it`) with sample quizzes covering all 9 question types.

### Start

```bash
npm run dev:custom
```

The server starts at **http://localhost:3000** with built-in Socket.io.

> **Note:** always use `dev:custom` instead of `dev`, because the custom server is required for Socket.io.

---

## How it Works

### Teacher

1. Log in with Google at `/login`
2. Create a quiz with the desired questions
3. Click **Play** to start a live session
4. Project the screen on the whiteboard — students see the PIN
5. Start the quiz and manage the question flow
6. At the end: podium and detailed statistics

### Student

1. Open the site on your phone
2. Enter the 6-digit PIN shown on the whiteboard
3. Choose a nickname and an avatar
4. Answer questions before time runs out
5. Immediate feedback after each answer
6. Final leaderboard and podium

---

## Question Types

| Type | Description |
|------|-------------|
| Multiple choice | 2-6 options, one or more correct |
| True or false | Classic binary question |
| Open answer | Matched against accepted answers |
| Ordering | Reorder elements in the correct sequence |
| Matching | Connect left-right elements |
| Find the error | Find rows with errors in text or code |
| Numeric estimation | Enter a number, score based on proximity |
| Image hotspot | Tap the correct point on an image |
| Code completion | Complete the missing line (multiple choice or free text) |

---

## Main Commands

| Command | Description |
|---------|-------------|
| `npm run dev:custom` | Dev server with Socket.io |
| `npm run build` | Production build |
| `npm run start:custom` | Start in production |
| `npm run test:run` | Unit tests |
| `npm run test:e2e` | E2E tests |
| `npx prisma studio` | Database GUI |
| `npx prisma migrate dev` | Database migrations |
| `npx prisma db seed` | Load demo data |

---

## Production Deploy

### With Nginx (recommended)

SAVINT supports deployment under a subpath (e.g. `https://yourdomain.com/savint`) using Nginx as a reverse proxy.

```bash
cp .env.example .env
# Set .env with production values
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start npm --name savint -- run start:custom
```

Configure Nginx with a `location /savint` block that proxies to the Node.js server. The `Upgrade` and `Connection "upgrade"` headers are required for Socket.io.

---

## Admin User

The seed creates a demo admin user with email `admin@scuola.it`. The admin has access to the **Admin** panel in the sidebar, where they can see all registered users, and each user's quiz and session counts.

To promote an existing user to admin in production:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

Or via Prisma Studio:

```bash
npx prisma studio
```

| Role | Description |
|------|-------------|
| `TEACHER` | Default role. Creates quizzes, starts sessions, views own statistics |
| `ADMIN` | Everything a teacher can do + admin panel with user list and global statistics |

---

## Privacy and GDPR

SAVINT is designed with data minimization in mind:

- **Student data**: only nickname, optional email, and game responses are stored. No accounts are created for students.
- **Automatic deletion**: finished sessions and all associated answers are automatically deleted after a configurable retention period (default: **365 days**). This ensures compliance with GDPR data retention principles.
- **Manual deletion**: teachers can delete any of their own sessions at any time from the dashboard. Admins can delete any session.
- **Configuration**: set `SESSION_RETENTION_DAYS` in `.env` to customize the retention period (e.g. `180` for 6 months).

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project and configure the OAuth consent screen
3. Create **OAuth 2.0 Client ID** credentials
   - Redirect URI (dev): `http://localhost:3000/api/auth/callback/google`
   - Redirect URI (prod with subpath): `https://yourdomain.com/savint/api/auth/callback/google`
4. Copy Client ID and Client Secret to your `.env` file

---

## License

SAVINT is released under the **AGPL-3.0** license. Free for school and educational use.
