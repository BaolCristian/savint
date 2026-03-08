# Design: Export/Import .qlz + Upload Immagini

Data: 2026-03-08

## Panoramica

Formato `.qlz` (Quiz Live Zip) per esportare e importare quiz tra istanze diverse di Quiz Live. Il formato e autocontenuto: include manifest JSON + immagini fisiche.

## Formato .qlz

Un file ZIP rinominato con estensione `.qlz`:

```
quiz.qlz
├── manifest.json
└── assets/
    ├── q0.png
    └── q3.jpg
```

### manifest.json

```json
{
  "version": 1,
  "exportedAt": "2026-03-08T10:00:00Z",
  "quiz": {
    "title": "Quiz di Geografia",
    "description": "Descrizione opzionale",
    "tags": ["geografia", "europa"],
    "questions": [
      {
        "type": "MULTIPLE_CHOICE",
        "text": "Qual e la capitale della Francia?",
        "image": "assets/q0.png",
        "timeLimit": 20,
        "points": 1000,
        "options": {
          "choices": [
            { "text": "Londra", "isCorrect": false },
            { "text": "Parigi", "isCorrect": true }
          ]
        }
      }
    ]
  }
}
```

Il campo `image` e opzionale e punta a un file dentro `assets/`.

## Upload immagini

- Le immagini caricate dall'utente vengono salvate in `public/uploads/quiz/{quizId}/`
- Next.js le serve staticamente
- Il campo `mediaUrl` nel DB contiene il path locale (es. `/uploads/quiz/abc123/q0.png`)
- Il question editor offre due opzioni: upload file OPPURE incolla URL
- Nuova API: `POST /api/upload` accetta un file e restituisce il path

## Export (GET /api/quiz/[id]/export)

1. Legge quiz + domande dal DB
2. Per ogni domanda con `mediaUrl`:
   - Path locale (`/uploads/...`): legge il file dal disco
   - URL esterno (`https://...`): lo scarica
   - Salva in `assets/qN.ext` nello ZIP
3. Genera `manifest.json` con riferimenti relativi (`assets/qN.ext`)
4. Risponde con il file `.qlz` (Content-Disposition: attachment)

## Import (POST /api/quiz/import)

1. Riceve il `.qlz` come upload multipart
2. Apre lo ZIP, legge `manifest.json`
3. Valida con schema Zod
4. Crea il quiz nel DB
5. Estrae immagini da `assets/` e le salva in `public/uploads/quiz/{newQuizId}/`
6. Aggiorna `mediaUrl` delle domande con i path locali

## Componenti

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/lib/validators/qlz.ts` | Nuovo | Schema Zod per manifest.json |
| `src/app/api/quiz/[id]/export/route.ts` | Nuovo | API export .qlz |
| `src/app/api/quiz/import/route.ts` | Nuovo | API import .qlz |
| `src/app/api/upload/route.ts` | Nuovo | API upload immagini |
| `src/components/quiz/question-editor.tsx` | Modifica | Aggiunge upload file accanto a URL |
| `src/components/quiz/import-button.tsx` | Nuovo | Bottone importa con file picker |
| `src/app/(dashboard)/dashboard/quiz/page.tsx` | Modifica | Bottoni export e import nella lista |

## Libreria

JSZip per creazione/lettura ZIP lato server e client.

## Tipi di domanda supportati

MULTIPLE_CHOICE, TRUE_FALSE, OPEN_ANSWER, ORDERING, MATCHING — tutti e 5.
