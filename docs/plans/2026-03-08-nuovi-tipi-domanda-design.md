# Design: Nuovi Tipi di Domanda + Livello di Confidenza

Data: 2026-03-08

## Obiettivo

Aggiungere 4 nuovi tipi di domanda (Fase 1) e il livello di confidenza come feature trasversale al sistema Quiz Live.

## Nuovi tipi

### 1. SPOT_ERROR (Trova l'errore)
- Righe numerate di testo/codice, il player seleziona le righe errate
- Selezione multipla con punteggio parziale
- Options: `{ lines: string[], errorIndices: number[], explanation?: string }`
- Answer: `{ selected: number[] }`

### 2. NUMERIC_ESTIMATION (Stima numerica)
- Il player inserisce un valore numerico
- Scoring ibrido: pieno entro tolleranza, decrescente fino a maxRange, 0 oltre
- Options: `{ correctValue: number, tolerance: number, maxRange: number, unit?: string }`
- Answer: `{ value: number }`

### 3. IMAGE_HOTSPOT (Hotspot su immagine)
- Il player tocca un punto su un'immagine
- Coordinate normalizzate 0-1 (indipendenti dalla risoluzione)
- Hotspot definito come cerchio (centro + raggio)
- Options: `{ imageUrl: string, hotspot: { x: number, y: number, radius: number }, tolerance: number }`
- Answer: `{ x: number, y: number }`

### 4. CODE_COMPLETION (Completa il codice)
- Blocco di codice con una riga mancante
- Due modalità: scelta multipla o input testuale (configurabile dal docente)
- Options: `{ codeLines: string[], blankLineIndex: number, correctAnswer: string, mode: "choice" | "text", choices?: string[] }`
- Answer: `{ text: string }` o `{ selected: number }`

## Livello di Confidenza (trasversale)

Flag `confidenceEnabled` sulla Question. Dopo la risposta, il player indica la confidenza (1=bassa, 2=media, 3=alta).

Scoring confidenza:
- Corretta + alta = score x 1.2
- Corretta + media = score x 1.0
- Corretta + bassa = score x 0.8
- Errata + alta = score - 200 malus (floor 0)
- Errata + media/bassa = invariato

## Scoring per tipo

### SPOT_ERROR (parziale)
- Ogni errore trovato = maxPoints / totalErrors
- Selezione sbagliata = -maxPoints / totalErrors (floor 0)
- Bonus velocita applicato al totale

### NUMERIC_ESTIMATION (ibrido)
- Entro tolleranza: pieno punteggio + bonus velocita
- Fuori tolleranza, entro maxRange: maxPoints x (1 - (scarto - tolleranza) / (maxRange - tolleranza))
- Oltre maxRange: 0

### IMAGE_HOTSPOT
- Entro raggio: pieno punteggio + bonus velocita
- Entro raggio + tolleranza: punteggio parziale decrescente
- Oltre: 0

### CODE_COMPLETION
- Choice: corretto/errato binario + bonus velocita
- Text: confronto normalizzato (trim, case-insensitive, collapse spazi) + bonus velocita

## Modifiche al modello dati

Schema Prisma:
- Enum QuestionType: +SPOT_ERROR, +NUMERIC_ESTIMATION, +IMAGE_HOTSPOT, +CODE_COMPLETION
- Question: +confidenceEnabled Boolean @default(false)
- Answer: +confidenceLevel Int? (1/2/3)

Nessun'altra modifica strutturale: options e value restano JSON.

## Sanitizzazione server-side

| Tipo | Campi nascosti al player |
|------|--------------------------|
| SPOT_ERROR | errorIndices, explanation |
| NUMERIC_ESTIMATION | correctValue, tolerance, maxRange |
| IMAGE_HOTSPOT | hotspot (coordinate + raggio) |
| CODE_COMPLETION | correctAnswer (+ choices shufflate se mode=choice) |

## File da modificare

| File | Modifiche |
|------|-----------|
| prisma/schema.prisma | Enum + 2 campi |
| src/types/index.ts | Nuovi tipi options/answer + confidenza |
| src/lib/validators/quiz.ts | Schema Zod nuovi tipi |
| src/lib/scoring.ts | checkAnswer + calculateScore estesi |
| src/lib/socket/server.ts | sanitizeOptions per nuovi tipi |
| src/components/quiz/question-editor.tsx | Switch nuovi editor + toggle confidenza |
| src/components/live/host-view.tsx | Rendering nuovi tipi |
| src/components/live/player-view.tsx | UI risposta nuovi tipi + confidenza |
| src/lib/validators/qlz.ts | Export/import nuovi tipi |

## Nuovi componenti

Editor (src/components/quiz/):
- spot-error-editor.tsx
- numeric-estimation-editor.tsx
- image-hotspot-editor.tsx
- code-completion-editor.tsx
- confidence-toggle.tsx

Player (src/components/live/):
- player-spot-error.tsx
- player-numeric-estimation.tsx
- player-image-hotspot.tsx
- player-code-completion.tsx
- player-confidence.tsx
