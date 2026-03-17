# Session Analytics — Design Spec

## Goal

Give teachers actionable insights from quiz sessions so they can identify which topics students struggle with and which students need help. Two scopes: single-session analysis (immediate post-game review) and cross-session trends.

## Data Available

All data already exists in the DB. The `Answer` table stores per-student, per-question: the submitted value (JSON), isCorrect, responseTimeMs, score, confidenceLevel.

**Schema change required**: add `tags String[] @default([])` to the `Question` model. Currently tags exist only on `Quiz`, which is too coarse for per-question topic analysis. This enables a teacher to tag individual questions (e.g., Q1="arrays", Q2="loops") within the same quiz. The quiz-level tags remain as a fallback/default.

---

## Part A — Single Session Page (`/dashboard/sessions/[id]`)

Enhance the existing page with four new sections below the current overview cards. All data comes from the existing `Answer` table joined with `Question`.

### A1. Student Profile (Priority 1)

Each row in the existing leaderboard becomes expandable (accordion). Clicking a student reveals:

- **Summary row**: total score, % correct, average response time
- **Question table**: one row per question showing:
  - Question text (truncated)
  - Student's answer (decoded from JSON `value` field, human-readable)
  - Correct/incorrect icon
  - Response time (seconds)
  - Score earned
- **Cumulative score chart**: small Recharts LineChart showing cumulative score progression across questions (X = question number, Y = cumulative score)

**Answer value decoding**: a utility function `decodeAnswerValue(type, value, options)` converts JSON to human-readable text for each question type:
- MULTIPLE_CHOICE: `{ selected: [0, 2] }` → map indices to choice texts from options
- TRUE_FALSE: `{ selected: true }` → "Vero" / "Falso"
- OPEN_ANSWER: `{ text: "answer" }` → the text directly
- ORDERING: `{ orderedTexts: [...] }` → numbered list
- MATCHING: `{ matchedPairs: [{left, right}] }` → "A→B, C→D"
- SPOT_ERROR: `{ selected: [1, 3] }` → map indices to line numbers
- NUMERIC_ESTIMATION: `{ value: 42 }` → the number with unit from options
- IMAGE_HOTSPOT: `{ x, y }` → "(x, y)" coordinates
- CODE_COMPLETION: `{ selected: index }` or `{ text: "code" }` → the selected choice text or typed code

Implementation: a new `<StudentProfilePanel>` component that receives the student's answers array and the session's questions. Rendered inside the leaderboard table as a collapsible row.

### A2. Critical Topics (Priority 2)

A section below the leaderboard, visible only if at least one question has tags (question-level or quiz-level fallback).

- One card per tag, sorted worst-to-best by class average % correct
- Each card shows:
  - Tag name
  - Average % correct (color bar: red <50%, amber 50-70%, green >70% — matching existing stats page thresholds)
  - Number of questions with that tag
  - Number of students who got at least one wrong in that tag

**Tag resolution**: use question-level tags if present; fall back to quiz-level tags for untagged questions.

**Fallback**: if no questions are tagged (neither question-level nor quiz-level), show a message: "Tag your quiz questions to see topic analysis" with a link to the quiz editor.

Implementation: a `<CriticalTopics>` component. Data: group answers by resolved tags, compute aggregates.

### A3. Heatmap (Priority 3)

A visual matrix below the critical topics section.

- Rows: students, sorted by total score (matching leaderboard order)
- Columns: questions, in quiz order (Q1, Q2, Q3...)
- Cells: colored by result
  - Green = correct
  - Red = incorrect
  - Gray = no answer (timeout/disconnection)
- Hover tooltip: student's answer (decoded), response time, score

**Responsive**: hidden on mobile (the student profile table covers the same data). On desktop, horizontal scroll if many questions.

Implementation: a `<SessionHeatmap>` component. Data: the full answers matrix for the session.

### A4. Question Detail (Priority 4)

Accordion section, one entry per question.

- **Header** (always visible): question number, text, type badge, class % correct, avg response time
- **Expanded content**:
  - Correct answer highlighted
  - Answer distribution bar chart:
    - MULTIPLE_CHOICE: horizontal bars, one per choice, count of students who selected it
    - TRUE_FALSE: two bars (Vero/Falso)
    - OPEN_ANSWER: horizontal bars, one per distinct answer text (grouped case-insensitive)
    - ORDERING/MATCHING/SPOT_ERROR/NUMERIC_ESTIMATION/IMAGE_HOTSPOT/CODE_COMPLETION: simple correct/incorrect split bar
  - List of students who answered incorrectly, with their submitted answer (decoded)

**Note**: update the existing `questionTypeLabel` map to include all 9 question types (currently missing SPOT_ERROR, NUMERIC_ESTIMATION, IMAGE_HOTSPOT, CODE_COMPLETION).

Implementation: a `<QuestionDetailAccordion>` component. Data: answers grouped by question.

---

## Part B — Cross-Session Insights (`/dashboard/stats/insights`)

New page accessible from the stats navigation.

### B1. Filters

Top bar with URL searchParams-based filtering (server component pattern, consistent with existing dashboard pages):
- Period selector: last week / last month / all time
- Quiz selector (optional): dropdown to filter by specific quiz

### B2. Topics Over Time

Recharts LineChart:
- X axis: sessions over time (by date)
- Y axis: average % correct
- One line per tag (resolved from question-level tags, falling back to quiz-level)
- Shows whether a topic improves or worsens across sessions

Data: aggregate Answer.isCorrect grouped by resolved tags and Session.createdAt.

**Empty state**: if fewer than 2 sessions in the period, show message "At least 2 sessions needed to show trends."

### B3. Weakest Topics

Ranked list of tags by average % correct across filtered sessions (color thresholds: red <50%, amber 50-70%, green >70%). Similar to existing `/dashboard/stats/topics` but with the period/quiz filters applied.

**Empty state**: "No tagged questions found in the selected period."

### B4. At-Risk Students

Table of students with overall % correct below 40% in the filtered sessions:
- Student name (matched by `playerEmail` when available, falling back to `playerName` for cross-session identification)
- Sessions participated
- Overall % correct
- Trend indicator (improving/declining/stable — compare first half vs second half of filtered period)

**Limitation**: students who enter different names and no email across sessions will appear as separate entries.

**Empty state**: "No at-risk students in the selected period" (positive message).

---

## Part C — Tag UX Improvement

In the quiz question editor:

### C1. Tag Autocomplete

When typing a tag, show a dropdown of existing tags the teacher has used in previous quizzes. Filter as the teacher types.

Data: query distinct tags from Quiz table (existing) and Question table (new field) where Quiz.creatorId = current user.

### C2. Suggested Tags

Below the tag input, show the 5 most frequently used tags by the teacher as clickable chips for quick addition.

---

## Technical Notes

- **Schema change**: add `tags String[] @default([])` to Question model, run migration (non-breaking: existing rows get empty array)
- **Charts**: use Recharts (already a dependency)
- **Data fetching**: server components with Prisma queries; insights page uses URL searchParams for filters
- **Styling**: follow existing Tailwind patterns in the dashboard
- **i18n**: all new strings go through next-intl (existing setup)
- **Color thresholds**: standardize to <50% red, 50-70% amber, >70% green across all pages
- **Answer value decoding**: new utility `decodeAnswerValue(type, value, options)` in `src/lib/answer-decode.ts`
