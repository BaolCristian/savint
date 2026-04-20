# Quiz Test Mode — Design

**Date:** 2026-04-20
**Status:** Approved (awaiting implementation plan)

## Goal

Permettere al docente di testare un proprio quiz giocandolo da solo, per verificarne correttezza (domande, risposte giuste, tempi) prima di usarlo in aula. I risultati della sessione di test NON devono comparire in statistiche, report o lista sessioni.

## User stories

- Come docente, voglio cliccare "Prova quiz" dall'editor, dalla libreria o dalla pagina del quiz e trovarmi subito in una simulazione della sessione live.
- Come docente, voglio rispondere alle domande con i timer reali come farebbero i miei studenti, ma non voglio aspettare il timer completo se ho già risposto: il quiz deve avanzare subito.
- A fine quiz voglio vedere le mie stats personali (punteggio, risposte corrette, tempi) per validare che il quiz "funzioni".
- Non voglio che la sessione di test inquini le mie statistiche o la cronologia sessioni.

## Architecture

Riuso dell'infrastruttura live esistente (socket, `Session`, `Answer`, `HostView`, `PlayerView`). Una sessione di test è una sessione live normale con un flag `isTest=true`, filtrato fuori da tutte le query di analytics/reporting.

Il docente, in modalità test, apre una pagina unificata `/live/test/[sessionId]` che contiene due pannelli sincronizzati nella stessa finestra:
- pannello Host (riusa `<HostView>`)
- pannello Player (riusa `<PlayerView>`), auto-registrato con nome `"Docente (test)"`

Layout split-screen su desktop, a tab su mobile. Un banner in alto segnala "Modalità test — i risultati non verranno salvati nelle statistiche".

## Database

Aggiunta al model `Session` in `prisma/schema.prisma`:

```prisma
model Session {
  ...
  isTest  Boolean @default(false)
  ...
}
```

Migrazione Prisma con default `false` (retrocompatibile). Nessun nuovo model. Nessuna cancellazione automatica delle sessioni di test per ora (YAGNI).

## API

### `POST /api/session`

Accetta parametro opzionale `isTest: boolean` nel body. Se `true`, crea la sessione con `isTest=true`. Stessa autorizzazione attuale (quiz proprio o pubblico).

### Query da aggiornare per escludere test

- `GET /api/session` (lista sessioni del docente) → filtrare `isTest: false`
- `/dashboard/sessions` → filtrare `isTest: false`
- Tutte le query analytics/stats (`/dashboard/stats`, report aggregati) → filtrare `isTest: false`

## UI

### Punti di ingresso

1. **Editor quiz** (`src/components/quiz/quiz-editor.tsx` o simile): nuovo pulsante `TestQuizButton` accanto a `StartSessionButton`.
2. **Libreria / lista quiz** (`src/components/library/...`): voce "Prova" nel menu card o pulsante secondario.
3. **Pagina quiz** (`src/app/(dashboard)/dashboard/quiz/[id]/page.tsx`): pulsante accanto a "Avvia sessione".

Tutti chiamano `POST /api/session` con `{ quizId, isTest: true }` e navigano a `/live/test/[sessionId]`.

### Pagina `/live/test/[sessionId]`

Nuova route in `src/app/(live)/live/test/[sessionId]/page.tsx`. Componente client che:
- Effettua auth/ownership check (solo il proprietario può usare la test mode sul proprio quiz)
- Renderizza `<HostView>` e `<PlayerView>` affiancati
- Il `PlayerView` si auto-registra via socket con nome hardcoded `"Docente (test)"` senza chiedere input
- Banner informativo sopra entrambi i pannelli

### Avanzamento automatico alla risposta

Quando la sessione ha `isTest=true` e il singolo giocatore (il docente) ha risposto, il server socket emette immediatamente `revealAnswer` senza attendere il timer. Il timer rimane visibile come fallback.

## Socket server changes

File: `src/lib/socket/server.ts`.

- Al caricamento di una sessione in memoria, leggere `isTest` dal DB e memorizzarlo nello stato della room.
- Nel handler `playerAnswer`: se `isTest === true` e tutti i giocatori non-`__host__` hanno risposto (in test è sempre 1), triggerare subito la transizione alla reveal phase invece di attendere il timer.
- Nessun nuovo evento socket custom: riuso del meccanismo "tutti hanno risposto" esistente.

Il filtro `__host__` esistente (commit 9c18000) va bene: il docente si registra col nome `"Docente (test)"` quindi non collide.

## Schermata finale

Il `PlayerView` esistente mostra già le stats personali (punteggio, risposte corrette, tempi) a fine quiz — nessun cambiamento richiesto. L'HostView mostra la sua schermata finale standard.

## Testing

- **Unit API**: `POST /api/session` con `isTest:true` crea record corretto; query di lista sessioni esclude `isTest:true`.
- **Unit stats**: le query statistiche/analytics escludono sessioni `isTest:true`.
- **E2E Playwright** (`tests/`): il docente avvia modalità test dalla libreria, risponde a una domanda, verifica che il quiz avanza subito e che la schermata finale mostra le stats personali; verifica che la sessione non appare in `/dashboard/sessions`.

## Non-obiettivi (YAGNI)

- Nessuna cancellazione automatica delle sessioni di test
- Nessuna modalità "salta timer completamente"
- Nessun replay/rigioca
- Nessuna condivisione di link test con altri utenti
- Nessun debug panel con problemi del quiz (es. domande senza risposta corretta)

## Out of scope

Eventuale futura cleanup job per rimuovere sessioni di test più vecchie di N giorni → valutare in un secondo momento se il numero diventa significativo.
