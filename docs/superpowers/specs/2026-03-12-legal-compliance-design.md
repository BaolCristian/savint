# Legal Compliance & Content Protection System

## Overview

Implement legal protection mechanisms for the SAVINT quiz platform to protect against liability for user-generated content. The system covers: terms acceptance, quiz publication declarations, content licensing, content reporting, and admin moderation tools.

## Database Schema

### New Enums

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

### New Models

```prisma
model Consent {
  id        String      @id @default(cuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      ConsentType
  version   String      // e.g. "1.0" — allows invalidating old consents when texts update
  metadata  Json?       // e.g. { quizId: "xxx" } for quiz publish declarations
  createdAt DateTime    @default(now())
}

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
}
```

### Modified Models

```prisma
model Quiz {
  // ...existing fields...
  license   QuizLicense @default(CC_BY)
  suspended Boolean     @default(false)
  reports   Report[]
}

model User {
  // ...existing fields...
  consents        Consent[]
  reportsMade     Report[]  @relation("reportsMade")
  reportsResolved Report[]  @relation("reportsResolved")
}
```

## Feature 1: Terms Acceptance (First Login)

### Behavior

1. After Google OAuth login, the `(editor)/layout.tsx` checks if the user has a `Consent` record of type `TERMS_ACCEPTANCE` with the current version (e.g. `"1.0"`)
2. If missing → blocking modal appears over dashboard content
3. User cannot close the modal or navigate until they accept
4. On "Accetto" click → `POST /api/consent` saves the record → modal closes → dashboard accessible
5. If terms text is updated, bump version to `"1.1"` → all users see the modal again

### Modal Content

- **Title:** "Accettazione delle condizioni di utilizzo"
- **Body:**
  - Registrandoti su questa piattaforma dichiari di aver letto e accettato le Condizioni di utilizzo e l'Informativa sulla privacy.
  - I contenuti pubblicati sulla piattaforma sono responsabilità esclusiva degli utenti che li caricano.
  - L'utente si impegna a pubblicare esclusivamente contenuti di cui possiede i diritti oppure contenuti originali.
  - Non è consentito pubblicare materiali coperti da copyright (ad esempio contenuti tratti da libri di testo, manuali o piattaforme editoriali) senza autorizzazione dei titolari dei diritti.
- **Links:** to `/savint/terms` and `/savint/privacy`
- **Checkbox (required):** "Dichiaro di aver letto e accettato le condizioni di utilizzo e l'informativa sulla privacy."
- **Button:** "Accetto" — disabled until checkbox is checked

### API

- `POST /api/consent` — body: `{ type: "TERMS_ACCEPTANCE", version: "1.0" }`
- Returns 201 on success
- Check endpoint: `GET /api/consent/check?type=TERMS_ACCEPTANCE&version=1.0` — returns `{ accepted: boolean }`

### Version Management

The current terms version is defined as a constant (e.g. `CURRENT_TERMS_VERSION = "1.0"`) in a shared config file. Changing this value forces re-acceptance.

## Feature 2: Quiz Publish Declaration (Every Save)

### Behavior

1. When a teacher clicks "Salva" in the quiz editor, a modal appears **before** the API call
2. Modal shows the content declaration text + license selector
3. Checkbox required: "Dichiaro che il quiz è originale o che possiedo i diritti per pubblicarlo"
4. On confirm → the `POST/PUT /api/quiz` request includes `consentAccepted: true` and `license`
5. The API saves the quiz **and** creates a `Consent` record of type `QUIZ_PUBLISH_DECLARATION` with `metadata: { quizId }` in a Prisma transaction
6. If `consentAccepted` is not `true`, the API rejects with 400

### Modal Content

- **Title:** "Dichiarazione di responsabilità sui contenuti"
- **Body:**
  - Pubblicando questo quiz dichiari sotto la tua responsabilità che:
  - il contenuto è originale oppure hai il diritto di pubblicarlo
  - il quiz non viola diritti d'autore di terzi
  - il quiz non contiene dati personali di studenti o altre persone identificabili
  - il contenuto rispetta le norme di legge e le regole della piattaforma
  - La piattaforma ospita contenuti caricati dagli utenti e si riserva il diritto di rimuovere contenuti che risultino in violazione delle presenti condizioni.
- **License selector:** dropdown with CC_BY (default) and CC_BY_SA
  - Explanatory text: "I quiz pubblicati su questa piattaforma sono condivisi per scopi didattici. Selezionando una licenza autorizzi altri utenti a utilizzare il quiz secondo le condizioni indicate."
- **Checkbox (required):** "Dichiaro che il quiz è originale o che possiedo i diritti per pubblicarlo."
- **Button:** "Pubblica" — disabled until checkbox is checked

### API Changes

- `POST /api/quiz` and `PUT /api/quiz/[id]` — add to request body:
  - `consentAccepted: boolean` (required, must be `true`)
  - `license: "CC_BY" | "CC_BY_SA"` (required)
- Both save quiz + consent in a Prisma `$transaction`

## Feature 3: Content Reporting

### Report Button Placement

- In the public quiz library (where users browse shared quizzes)
- In the shared quiz view (quizzes opened via share link)
- **Not** on the user's own quizzes in their personal dashboard

### Flow

1. Flag icon button "Segnala contenuto" visible on quizzes not authored by the current user
2. Click → modal with:
   - Introductory text: "Se ritieni che questo contenuto violi diritti d'autore, contenga dati personali o non rispetti le regole della piattaforma puoi segnalarlo agli amministratori. Le segnalazioni verranno verificate e, se necessario, il contenuto verrà rimosso."
   - Radio buttons for reason: Copyright / Dati personali / Contenuto offensivo / Altro
   - Optional text field for details
   - "Invia segnalazione" button
3. `POST /api/report` → saves `Report` with status `PENDING`
4. Success message: "Segnalazione inviata. Verrà verificata dagli amministratori."
5. Unique constraint: a user cannot report the same quiz twice (DB `@@unique([quizId, reporterId])`)

### API

- `POST /api/report` — body: `{ quizId, reason, description? }`
- Returns 201 on success, 409 if already reported by this user

## Feature 4: Admin Moderation Dashboard

### Access

- New section in the sidebar, visible only to users with `role: ADMIN`
- Route: `/savint/dashboard/admin/reports`

### Features

- List of reports with filters by status (PENDING / REVIEWED / RESOLVED / DISMISSED)
- Each report shows: quiz title, quiz author, reason, date, description
- Actions per report:
  - **"Segna come revisionata"** → status = REVIEWED
  - **"Sospendi quiz"** → status = RESOLVED, quiz `suspended = true`, `resolvedAt` and `resolvedBy` set
  - **"Archivia"** → status = DISMISSED (no action on quiz)
  - **"Elimina quiz"** → status = RESOLVED, quiz deleted from DB (for severe cases)

### Quiz Suspension

- `suspended: true` on the Quiz model
- Suspended quizzes:
  - Not visible in the public library
  - Not playable (cannot create a game session)
  - Visible in the author's dashboard with a "Sospeso" badge and explanation
  - Author can edit the quiz and contact admin for review
- Admin can unsuspend: `PUT /api/admin/quiz/[id]/suspend` with `{ suspended: false }`

### API

- `GET /api/admin/reports` — list reports (admin only), supports `?status=PENDING` filter
- `PUT /api/admin/reports/[id]` — update report status (admin only)
- `PUT /api/admin/quiz/[id]/suspend` — toggle quiz suspension (admin only)
- `DELETE /api/admin/quiz/[id]` — delete quiz (admin only)

## Feature 5: Static Legal Pages

### Routes

- `/savint/terms` — Platform rules + content removal clause
- `/savint/privacy` — Privacy policy

### `/savint/terms` Content

**Title: "Regole della piattaforma"**

Section 1 — Rules:
- Gli utenti si impegnano a non pubblicare:
  - contenuti copiati da libri di testo o materiali editoriali protetti da copyright
  - dati personali di studenti o altre persone
  - contenuti offensivi, discriminatori o illegali
- L'amministratore della piattaforma si riserva il diritto di rimuovere contenuti che violino queste regole o le normative vigenti.

Section 2 — Content removal:
- La piattaforma agisce come servizio di hosting dei contenuti caricati dagli utenti.
- Qualora venga segnalata una violazione di legge o dei diritti di terzi, i contenuti potranno essere rimossi senza preavviso.

Section 3 — Licenses:
- Explanation of CC BY and CC BY-SA licenses and their implications

### `/savint/privacy` Content

- Placeholder privacy policy text covering:
  - Data collected (name, email, Google profile via OAuth)
  - Purpose (platform access, content attribution)
  - Data retention
  - User rights
- **Note:** Should be reviewed by a legal professional before production deployment

### Layout

- Public pages (no login required)
- Outside the `(editor)` layout group — in a new `(legal)` group or at app root level
- Consistent styling with the rest of the site
- Accessible from links in the terms acceptance modal and optionally from a footer

## Guards & Enforcement

### Suspended Quiz Guard

All quiz-facing endpoints and UI must check `suspended` status:
- `GET /api/quiz` (library) — exclude suspended quizzes
- `POST /api/session` — reject session creation for suspended quizzes
- Quiz dashboard — show suspended badge, disable "Gioca" button

### Consent Check

- Layout-level check in `(editor)/layout.tsx` for terms acceptance
- API-level check in `POST/PUT /api/quiz` for publish declaration

## Not Included (Future Work)

- Email notifications to teacher when quiz is suspended
- Teacher appeal workflow after suspension
- Cookie consent banner
- GDPR data export/deletion requests
- Admin notification of new reports
