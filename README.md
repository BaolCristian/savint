# SAVINT

**Piattaforma gratuita di quiz interattivi per la scuola.**
**Free interactive quiz platform for schools.**

Il docente crea quiz, li proietta sulla LIM e gli studenti rispondono in tempo reale dal proprio telefono. Pensata per rendere le lezioni piu' coinvolgenti e la valutazione formativa piu' immediata.

Teachers create quizzes, project them on the interactive whiteboard and students answer in real-time from their phones. Designed to make lessons more engaging and formative assessment more immediate.

> SAVINT e' e sara' sempre **gratuito per tutte le scuole**. Nuove funzionalita' verranno aggiunte progressivamente per offrire un'esperienza sempre migliore a docenti e studenti.
>
> SAVINT is and will always be **free for all schools**. New features will be added progressively to provide an ever-better experience for teachers and students.

---

## Funzionalita' / Features

- **9 tipi di domanda / 9 question types**: scelta multipla, vero/falso, risposta aperta, ordinamento, abbinamento, trova l'errore, stima numerica, hotspot su immagine, completamento codice — multiple choice, true/false, open answer, ordering, matching, find the error, numeric estimation, image hotspot, code completion
- **Quiz live in tempo reale / Real-time live quizzes**: lobby con PIN a 6 cifre, countdown, classifica animata, podio finale — lobby with 6-digit PIN, countdown, animated leaderboard, final podium
- **Livello di confidenza / Confidence level**: lo studente indica quanto e' sicuro della risposta, con bonus o malus sul punteggio — students indicate how confident they are, with score bonus or penalty
- **Import da Excel / Excel import**: crea quiz da file Excel, con template scaricabile e supporto AI — create quizzes from Excel files, with downloadable template and AI support
- **Dashboard docente / Teacher dashboard**: crea e modifica quiz, storico sessioni, statistiche avanzate — create and edit quizzes, session history, advanced statistics
- **Statistiche / Statistics**: per sessione, per quiz, per studente, per argomento, con grafici interattivi — by session, quiz, student, topic, with interactive charts
- **Condivisione / Sharing**: condividi quiz tra colleghi con permessi (visualizza/duplica/modifica) — share quizzes with colleagues with permissions (view/duplicate/edit)
- **Export/Import**: formato .qlz per condividere quiz tra scuole diverse, export risultati in CSV/PDF — .qlz format to share quizzes across schools, export results as CSV/PDF
- **Upload immagini / Image upload**: carica immagini nelle domande o usa URL esterni — upload images in questions or use external URLs
- **Emoticon personalizzate / Custom emoticons**: avatar custom per gli studenti (basta aggiungere PNG nella cartella `public/emoticons/`) — custom avatars for students (just add PNGs to the `public/emoticons/` folder)
- **Autenticazione / Authentication**: login con Google Workspace scolastico — login with school Google Workspace
- **Responsive**: interfaccia ottimizzata per LIM (docente) e telefono (studenti) — optimized for interactive whiteboards (teacher) and phones (students)

## Stack tecnologico / Tech Stack

| Componente / Component | Tecnologia / Technology |
|------------------------|------------------------|
| Framework | Next.js 16 (App Router) |
| Linguaggio / Language | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Real-time | Socket.io 4 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Autenticazione / Auth | NextAuth v5 (Google OAuth) |
| Grafici / Charts | Recharts |
| Test | Vitest + Playwright |

---

## Avvio rapido / Quick Start

### Prerequisiti / Prerequisites

- **Node.js 20+**
- **PostgreSQL 16** (locale o via Docker / local or via Docker)
- **Account Google Cloud** per OAuth / for OAuth

### Installazione / Installation

```bash
git clone https://github.com/BaolCristian/savint.git
cd savint
npm install
```

### Configurazione / Configuration

```bash
cp .env.example .env
```

Modifica `.env` con i tuoi valori. Genera il secret di NextAuth:
Edit `.env` with your values. Generate the NextAuth secret:

```bash
openssl rand -base64 32
```

### Database

```bash
# Crea le tabelle / Create tables
npx prisma migrate dev

# (Opzionale / Optional) Carica dati demo / Load demo data
npx prisma db seed
```

Il seed crea un docente demo (`docente@scuola.it`) con quiz di esempio che coprono tutti i 9 tipi di domanda.
The seed creates a demo teacher (`docente@scuola.it`) with sample quizzes covering all 9 question types.

### Avvio / Start

```bash
npm run dev:custom
```

Il server parte su **http://localhost:3000** con Socket.io integrato.
The server starts at **http://localhost:3000** with built-in Socket.io.

> **Nota / Note:** usa sempre `dev:custom` e non `dev`, perche' il server custom e' necessario per Socket.io.
> Always use `dev:custom` instead of `dev`, because the custom server is required for Socket.io.

---

## Come funziona / How it works

### Docente / Teacher

1. Accedi con Google su `/login` — Log in with Google at `/login`
2. Crea un quiz con le domande desiderate — Create a quiz with the desired questions
3. Clicca **Gioca** per avviare una sessione live — Click **Play** to start a live session
4. Proietta lo schermo sulla LIM — gli studenti vedono il PIN — Project the screen on the whiteboard — students see the PIN
5. Avvia il quiz e gestisci il flusso delle domande — Start the quiz and manage the question flow
6. A fine quiz: podio e statistiche dettagliate — At the end: podium and detailed statistics

### Studente / Student

1. Apri il sito sul telefono — Open the site on your phone
2. Inserisci il PIN a 6 cifre mostrato sulla LIM — Enter the 6-digit PIN shown on the whiteboard
3. Scegli un nickname e un avatar — Choose a nickname and an avatar
4. Rispondi alle domande entro il tempo limite — Answer questions before time runs out
5. Feedback immediato dopo ogni risposta — Immediate feedback after each answer
6. Classifica finale e podio — Final leaderboard and podium

---

## Tipi di domanda / Question Types

| Tipo / Type | Descrizione / Description |
|-------------|--------------------------|
| Scelta multipla / Multiple choice | 2-6 opzioni, una o piu' corrette — 2-6 options, one or more correct |
| Vero o falso / True or false | Classica domanda binaria — Classic binary question |
| Risposta aperta / Open answer | Confronto con risposte accettate — Matched against accepted answers |
| Ordinamento / Ordering | Riordina elementi nella sequenza corretta — Reorder elements in the correct sequence |
| Abbinamento / Matching | Collega elementi sinistra-destra — Connect left-right elements |
| Trova l'errore / Find the error | Individua le righe con errori in un testo o codice — Find rows with errors in text or code |
| Stima numerica / Numeric estimation | Inserisci un numero, punteggio basato sulla vicinanza — Enter a number, score based on proximity |
| Hotspot immagine / Image hotspot | Tocca il punto corretto su un'immagine — Tap the correct point on an image |
| Completamento codice / Code completion | Completa la riga mancante (scelta multipla o testo libero) — Complete the missing line (multiple choice or free text) |

---

## Comandi principali / Main Commands

| Comando / Command | Descrizione / Description |
|-------------------|--------------------------|
| `npm run dev:custom` | Server di sviluppo con Socket.io / Dev server with Socket.io |
| `npm run build` | Build di produzione / Production build |
| `npm run start:custom` | Avvia in produzione / Start in production |
| `npm run test:run` | Test unitari / Unit tests |
| `npm run test:e2e` | Test end-to-end / E2E tests |
| `npx prisma studio` | GUI database / Database GUI |
| `npx prisma migrate dev` | Migrazioni database / Database migrations |
| `npx prisma db seed` | Carica dati demo / Load demo data |

---

## Deploy in produzione / Production Deploy

### Con Nginx / With Nginx (consigliato / recommended)

SAVINT supporta il deploy sotto un subpath (es. `https://tuodominio.it/savint`) tramite Nginx come reverse proxy.
SAVINT supports deployment under a subpath (e.g. `https://yourdomain.com/savint`) using Nginx as a reverse proxy.

```bash
cp .env.example .env
# Configura .env con i valori di produzione / Set .env with production values
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start npm --name savint -- run start:custom
```

Configura Nginx con un blocco `location /savint` che fa proxy_pass al server Node.js. Sono necessari gli header `Upgrade` e `Connection "upgrade"` per Socket.io.
Configure Nginx with a `location /savint` block that proxies to the Node.js server. The `Upgrade` and `Connection "upgrade"` headers are required for Socket.io.

---

## Utente Admin / Admin User

Il seed crea un utente admin demo con email `admin@scuola.it`. L'admin ha accesso al pannello **Admin** nella sidebar, dove puo' vedere tutti gli utenti registrati, il numero di quiz e sessioni di ciascuno.

The seed creates a demo admin user with email `admin@scuola.it`. The admin has access to the **Admin** panel in the sidebar, where they can see all registered users, and each user's quiz and session counts.

Per promuovere un utente esistente ad admin in produzione:
To promote an existing user to admin in production:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'your-email@example.com';
```

Oppure tramite Prisma Studio: / Or via Prisma Studio:

```bash
npx prisma studio
```

| Ruolo / Role | Descrizione / Description |
|--------------|--------------------------|
| `TEACHER` | Ruolo predefinito. Crea quiz, avvia sessioni, vede le proprie statistiche — Default role. Creates quizzes, starts sessions, views own statistics |
| `ADMIN` | Tutto cio' che puo' fare un docente + pannello admin con lista utenti e statistiche globali — Everything a teacher can do + admin panel with user list and global statistics |

---

## Configurazione Google OAuth / Google OAuth Setup

1. Vai su [Google Cloud Console](https://console.cloud.google.com) — Go to [Google Cloud Console](https://console.cloud.google.com)
2. Crea un progetto e configura la schermata di consenso OAuth — Create a project and configure the OAuth consent screen
3. Crea credenziali **ID client OAuth 2.0** — Create **OAuth 2.0 Client ID** credentials
   - URI di reindirizzamento (dev / dev redirect URI): `http://localhost:3000/api/auth/callback/google`
   - URI di reindirizzamento (prod con subpath / prod with subpath): `https://yourdomain.com/savint/api/auth/callback/google`
4. Copia Client ID e Client Secret nel file `.env` — Copy Client ID and Client Secret to your `.env` file

---

## Licenza / License

SAVINT e' rilasciato sotto licenza **AGPL-3.0**. Gratuito per uso scolastico ed educativo.
SAVINT is released under the **AGPL-3.0** license. Free for school and educational use.
