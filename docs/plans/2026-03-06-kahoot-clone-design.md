# Design Document: Quiz Live per la Scuola

Data: 2026-03-06

## Requisiti

| Aspetto | Scelta |
|---------|--------|
| Utenti | Mono-scuola ora, SaaS dopo |
| Scala | 30-40 concorrenti (1 classe) |
| Hosting | Server della scuola (Docker) |
| Auth | Google Workspace (@scuola.edu.it) |
| Domande | Tutti i tipi: multipla, V/F, aperta, ordinamento, abbinamento |
| Modalita | Solo live (quiz televisivo) |
| Statistiche | Avanzate con dashboard docente, trend, export |

## Architettura

Stack: Next.js 15 (App Router) + PostgreSQL 16 + Socket.io 4 + Prisma 6

```
Docker Compose
  app (Next.js :3000)
    - Frontend React 19 + Tailwind 4 + shadcn/ui
    - API Routes + Server Actions
    - Socket.io server (quiz live real-time)
    - NextAuth v5 (Google OAuth2)
    - Prisma ORM
  db (PostgreSQL 16)
```

Deploy: Docker Compose su server scolastico, porta 3000 (o 443 con reverse proxy SSL).

## Stack tecnologico

| Livello | Tecnologia |
|---------|-----------|
| Runtime | Node.js 20 LTS |
| Framework | Next.js 15 (App Router) |
| Linguaggio | TypeScript 5 |
| UI | React 19 + Tailwind CSS 4 |
| Componenti | shadcn/ui |
| Real-time | Socket.io 4 |
| Auth | NextAuth.js v5 |
| ORM | Prisma 6 |
| Database | PostgreSQL 16 |
| Grafici | Recharts |
| Export PDF | @react-pdf/renderer |
| Export CSV | papaparse |
| Drag & Drop | @dnd-kit |
| Validazione | Zod |
| Container | Docker + Docker Compose |
| Test | Vitest + Playwright |

## Modello dati

### Entita principali

**User** (docente/admin)
- id, email, name, role (TEACHER/ADMIN), googleId, avatarUrl, createdAt

**Quiz**
- id, title, description, authorId (FK User), isPublic, tags[], createdAt, updatedAt

**Question**
- id, quizId (FK Quiz), type (ENUM), text, mediaUrl?, timeLimit (sec), points, order, options (JSON)

**QuizShare**
- id, quizId (FK Quiz), sharedWithId (FK User), permission (VIEW/DUPLICATE/EDIT)

**Session**
- id, quizId (FK Quiz), hostId (FK User), pin (6 cifre), status (LOBBY/IN_PROGRESS/FINISHED), startedAt, endedAt

**Answer**
- id, sessionId (FK Session), questionId (FK Question), playerName, playerEmail?, value (JSON), isCorrect, responseTimeMs, score, createdAt

### Tipi di domanda

| Tipo | options (JSON) | value risposta (JSON) |
|------|----------------|----------------------|
| MULTIPLE_CHOICE | {choices: [{text, isCorrect}]} | {selected: [0,2]} |
| TRUE_FALSE | {correct: true} | {selected: true} |
| OPEN_ANSWER | {acceptedAnswers: ["Roma","rome"]} | {text: "Roma"} |
| ORDERING | {items: ["A","B","C"], correctOrder: [2,0,1]} | {order: [2,0,1]} |
| MATCHING | {pairs: [{left: "IT", right: "Italia"}]} | {matches: [[0,1],[1,0]]} |

## Flusso live del quiz

```
Docente (LIM)                Server                  Studente (telefono)
  |-- Crea sessione -------->|                              |
  |<-- PIN sessione ---------|                              |
  |                           |<-- Entra con PIN -----------|
  |<-- Studente connesso ----|                              |
  |-- Avvia domanda -------->|-- Mostra domanda ---------->|
  |                           |<-- Risposta + tempo --------|
  |<-- Aggiorna classifica --|-- Feedback corretto/no ---->|
  |-- Prossima domanda ----->|          ...ripeti...        |
  |-- Fine quiz ------------>|-- Classifica finale ------->|
```

Real-time via Socket.io con room per sessione (PIN a 6 cifre).

### Sistema di punteggio

```
Punteggio = punti_base * moltiplicatore_tempo
punti_base:  1000 se corretta, 0 se sbagliata
molt_tempo:  1.0 - (tempo_impiegato / tempo_limite) * 0.5
```

### Gestione disconnessioni

- Socket.io riprova automaticamente la connessione
- Al riconnessione il server invia lo stato attuale
- Domanda scaduta durante disconnessione = non risposta

## Dashboard e statistiche

### Pagine

```
/dashboard
  /                     Home: quiz recenti, sessioni recenti, quick stats
  /quiz                 Lista quiz (miei + condivisi)
  /quiz/new             Crea nuovo quiz
  /quiz/[id]/edit       Modifica quiz
  /quiz/[id]/stats      Statistiche aggregate del quiz
  /stats                Analytics globali docente
  /stats/students       Andamento per studente
  /stats/topics         Performance per argomento/tag
  /sessions             Storico sessioni
  /sessions/[id]        Dettaglio sessione (classifica, risposte)
  /share                Gestione condivisioni
```

### Metriche

**Per sessione:** classifica finale, % corrette per domanda, tempo medio risposta, domanda piu difficile/facile.

**Per quiz (cross-sessione):** n. volte giocato, score medio nel tempo, domande problematiche (<30%), distribuzione tempi.

**Per studente (se loggato Google):** andamento nel tempo, punti di forza/debolezza per tag, partecipazione.

**Per docente (globali):** argomenti deboli, confronto classi, engagement, export CSV/PDF.

## Struttura progetto

```
quizlive/
  docker-compose.yml
  Dockerfile
  package.json
  prisma/
    schema.prisma
    seed.ts
  src/
    app/
      layout.tsx
      page.tsx                    landing / join con PIN
      (auth)/login/page.tsx
      (dashboard)/
        layout.tsx                sidebar docente
        page.tsx                  home dashboard
        quiz/
          page.tsx                lista quiz
          new/page.tsx            crea quiz
          [id]/edit/page.tsx
          [id]/stats/page.tsx
        sessions/
          page.tsx
          [id]/page.tsx
        stats/
          page.tsx
          students/page.tsx
          topics/page.tsx
        share/page.tsx
      (live)/
        host/[sessionId]/page.tsx
        play/[sessionId]/page.tsx
      api/
        auth/[...nextauth]/route.ts
        quiz/route.ts
        session/route.ts
        stats/route.ts
    components/
      ui/                         shadcn components
      quiz/                       editor domande
      live/                       host + player views
      stats/                      grafici e tabelle
    lib/
      socket/
        server.ts                 Socket.io server
        events.ts                 tipi eventi condivisi
        client.ts                 hook useSocket()
      auth/config.ts              NextAuth config
      db/client.ts                Prisma singleton
      scoring.ts                  logica punteggio
      validators/                 schema Zod
    types/index.ts
  tests/
    unit/
    e2e/
```

## Prerequisiti server scuola

- Hardware: qualsiasi PC con 4GB RAM, 20GB disco
- Software: Docker + Docker Compose
- Rete: porta 3000 (o 443 con reverse proxy) accessibile dalla rete scolastica
- Dominio (opzionale): quiz.nomescuola.it con SSL (Let's Encrypt)
- Google Cloud Console: progetto con OAuth2 configurato

## Roadmap

| Fase | Contenuto | Durata |
|------|-----------|--------|
| 1. Fondamenta | Setup progetto, schema DB, auth Google, layout base | 2 settimane |
| 2. CRUD Quiz | Editor quiz, 5 tipi domanda, upload immagini, lista/filtri | 2 settimane |
| 3. Live Quiz | Socket.io, lobby/PIN, flusso domande, UI host + player, podio | 3 settimane |
| 4. Statistiche | Dashboard, stats sessione/quiz/studente/argomento, export | 2 settimane |
| 5. Condivisione + Polish | Share tra docenti, responsive, animazioni, test E2E | 2 settimane |
| 6. Deploy | Docker su server, OAuth prod, SSL, seed, formazione | 1 settimana |
| **Totale** | | **~12 settimane** |
