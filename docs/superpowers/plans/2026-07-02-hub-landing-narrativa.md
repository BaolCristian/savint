# Home hub narrativa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La home dell'hub racconta lo scopo del progetto (open source, gratuito, per la scuola, condivisione) con sezioni "Perché SAVINT" e "Come funziona" e footer con credit.

**Architecture:** Si modifica il solo server component `src/components/hub/hub-landing.tsx` (nuove sezioni tra hero e "quiz in evidenza", footer nuovo) più le chiavi i18n `hubHome` in `it.json`/`en.json`. Nessun cambio a search/featured/API.

**Tech Stack:** Next.js 16 server components, next-intl (`getTranslations`), Tailwind v4 con token brand (`--brand-*`).

## Global Constraints

- **Copy ESATTO dallo spec** `docs/superpowers/specs/2026-07-02-hub-landing-narrativa-design.md` — non riscrivere le frasi.
- Chiavi i18n in **entrambe** le lingue (next-intl fallisce a runtime se mancano).
- `hub-landing.tsx` resta **server component** (niente "use client").
- Solo token brand (`bg-brand-*`, `text-brand-*`, tinte `-50`); nessun hex nuovo.
- Nessuna modifica a `searchHubQuizzes`, routing, API. Nessun `data-testid` rimosso.
- Guardrail per task: `npm run lint` + `npm run test:run` verdi; `npm run build` alla fine.
- Un commit per task sul branch `hub-landing-narrativa`, trailer: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Chiavi i18n `hubHome` (IT + EN)

**Files:**
- Modify: `src/messages/it.json` (namespace `hubHome`)
- Modify: `src/messages/en.json` (namespace `hubHome`)

**Interfaces:**
- Produces: chiavi `heroTitle, heroSubtitle, whyTitle, whyOpenTitle, whyOpenBody, whyFreeTitle, whyFreeBody, whySchoolTitle, whySchoolBody, whyShareTitle, whyShareBody, howTitle, howStep1Title, howStep1Body, howStep2Title, howStep2Body, howStep3Title, howStep3Body, footer, githubLabel` consumate da Task 2 via `t("<chiave>")`.

- [ ] **Step 1: Aggiornare `it.json`**

Nel namespace `hubHome` di `src/messages/it.json`: sostituire i valori di `heroTitle`, `heroSubtitle`, `footer` e aggiungere le nuove chiavi, con i testi ESATTI della tabella dello spec (colonna IT). Risultato del namespace (chiavi esistenti non in tabella restano invariate):

```json
"heroTitle": "Crea, gioca, condividi",
"heroSubtitle": "SAVINT è la piattaforma open source di quiz interattivi per la scuola: gratuita, libera e costruita sulla condivisione. I docenti creano quiz, li giocano in classe e li mettono a disposizione di tutti.",
"whyTitle": "Perché SAVINT",
"whyOpenTitle": "Open source",
"whyOpenBody": "Codice libero (AGPL-3.0), pubblico su GitHub. Chiunque può verificarlo, migliorarlo e adattarlo alla propria scuola.",
"whyFreeTitle": "Gratuito, per sempre",
"whyFreeBody": "Niente abbonamenti, pubblicità o dati rivenduti. Nato per la scuola, resta gratuito per tutti.",
"whySchoolTitle": "Fatto per la scuola",
"whySchoolBody": "Pensato per la classe: tanti tipi di domande, modalità pratica per lo studio individuale e statistiche per il docente.",
"whyShareTitle": "La condivisione al centro",
"whyShareBody": "Ogni quiz pubblicato è un'esperienza che altri docenti possono riusare, clonare e migliorare. Il sapere cresce quando circola.",
"howTitle": "Come funziona",
"howStep1Title": "Cerca e prova",
"howStep1Body": "Sfoglia i quiz dei docenti e provali subito dal browser, senza registrarti.",
"howStep2Title": "Gioca in classe",
"howStep2Body": "Avvia una partita dal vivo: gli studenti entrano con un PIN dal telefono, come un game show.",
"howStep3Title": "Pubblica e condividi",
"howStep3Body": "Crea i tuoi quiz e pubblicali sull'hub: la tua esperienza diventa un punto di partenza per altre classi.",
"footer": "SAVINT è software libero (AGPL-3.0), scritto da Cristian Virgili con l'ausilio di Claude.",
"githubLabel": "Codice sorgente su GitHub"
```

- [ ] **Step 2: Aggiornare `en.json`**

Stesse chiavi con la colonna EN dello spec:

```json
"heroTitle": "Create, play, share",
"heroSubtitle": "SAVINT is the open-source interactive quiz platform for schools: free, libre and built on sharing. Teachers create quizzes, play them in class and make them available to everyone.",
"whyTitle": "Why SAVINT",
"whyOpenTitle": "Open source",
"whyOpenBody": "Free code (AGPL-3.0), public on GitHub. Anyone can inspect it, improve it and adapt it to their school.",
"whyFreeTitle": "Free, forever",
"whyFreeBody": "No subscriptions, ads or data selling. Born for schools, it stays free for everyone.",
"whySchoolTitle": "Made for school",
"whySchoolBody": "Designed for the classroom: many question types, practice mode for individual study and statistics for the teacher.",
"whyShareTitle": "Sharing at the core",
"whyShareBody": "Every published quiz is an experience other teachers can reuse, clone and improve. Knowledge grows when it circulates.",
"howTitle": "How it works",
"howStep1Title": "Search and try",
"howStep1Body": "Browse quizzes made by teachers and try them right in your browser, no sign-up needed.",
"howStep2Title": "Play in class",
"howStep2Body": "Start a live game: students join with a PIN from their phones, game-show style.",
"howStep3Title": "Publish and share",
"howStep3Body": "Create your own quizzes and publish them on the hub: your experience becomes a starting point for other classes.",
"footer": "SAVINT is free software (AGPL-3.0), written by Cristian Virgili with the help of Claude.",
"githubLabel": "Source code on GitHub"
```

- [ ] **Step 3: Verifica parità chiavi**

Run:
```bash
node -e "const it=require('./src/messages/it.json').hubHome,en=require('./src/messages/en.json').hubHome;const a=Object.keys(it).sort(),b=Object.keys(en).sort();console.log(JSON.stringify(a)===JSON.stringify(b)?'PARITY OK ('+a.length+' keys)':'MISMATCH: '+a.filter(k=>!b.includes(k))+' | '+b.filter(k=>!a.includes(k)))"
```
Expected: `PARITY OK (…)`. Poi `npm run test:run` → verde (stessi fallimenti pre-esistenti solo in `.worktrees/`).

- [ ] **Step 4: Commit**

```bash
git add src/messages/it.json src/messages/en.json
git commit -m "feat(hub): copy i18n per home narrativa (scopo, valori, come funziona, credit)"
```

---

### Task 2: Sezioni nuove in `hub-landing.tsx`

**Files:**
- Modify: `src/components/hub/hub-landing.tsx` (~108 righe attuali)

**Interfaces:**
- Consumes: chiavi i18n del Task 1 via `t("...")` (il componente usa già `getTranslations("hubHome")`).

- [ ] **Step 1: Sezione "Perché SAVINT" dopo l'hero**

Inserire subito DOPO la `</section>` dell'hero (prima di "Quiz in evidenza"). Definire in cima al file (fuori dal componente) i dati delle card, poi renderizzarle:

```tsx
const WHY_CARDS = [
  { emoji: "🔓", titleKey: "whyOpenTitle", bodyKey: "whyOpenBody", tint: "bg-brand-blue-50", accent: "text-brand-blue" },
  { emoji: "🆓", titleKey: "whyFreeTitle", bodyKey: "whyFreeBody", tint: "bg-brand-green-50", accent: "text-brand-green" },
  { emoji: "🏫", titleKey: "whySchoolTitle", bodyKey: "whySchoolBody", tint: "bg-brand-orange-50", accent: "text-brand-orange" },
  { emoji: "🤝", titleKey: "whyShareTitle", bodyKey: "whyShareBody", tint: "bg-brand-magenta-50", accent: "text-brand-magenta" },
] as const;
```

```tsx
{/* Perché SAVINT */}
<section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
  <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("whyTitle")}</h2>
  <div className="grid gap-4 sm:grid-cols-2">
    {WHY_CARDS.map((card) => (
      <div key={card.titleKey} className={`rounded-2xl ${card.tint} p-6`}>
        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl" aria-hidden>{card.emoji}</span>
          <h3 className={`text-lg font-bold ${card.accent}`}>{t(card.titleKey)}</h3>
        </div>
        <p className="text-slate-700 leading-relaxed">{t(card.bodyKey)}</p>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Sezione "Come funziona" subito dopo**

```tsx
const HOW_STEPS = [
  { n: 1, titleKey: "howStep1Title", bodyKey: "howStep1Body", circle: "bg-brand-blue" },
  { n: 2, titleKey: "howStep2Title", bodyKey: "howStep2Body", circle: "bg-brand-orange" },
  { n: 3, titleKey: "howStep3Title", bodyKey: "howStep3Body", circle: "bg-brand-green" },
] as const;
```

```tsx
{/* Come funziona */}
<section className="max-w-5xl mx-auto px-4 sm:px-6 pb-12">
  <h2 className="text-2xl font-bold text-slate-900 mb-4">{t("howTitle")}</h2>
  <div className="grid gap-6 sm:grid-cols-3">
    {HOW_STEPS.map((step) => (
      <div key={step.n} className="flex sm:flex-col items-start gap-4 sm:gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${step.circle} text-lg font-black text-white`} aria-hidden>
          {step.n}
        </span>
        <div>
          <h3 className="font-bold text-slate-900 mb-1">{t(step.titleKey)}</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{t(step.bodyKey)}</p>
        </div>
      </div>
    ))}
  </div>
</section>
```

- [ ] **Step 3: Footer con credit + link GitHub**

Sostituire l'attuale `<p className="mt-8 text-center text-xs text-slate-400">{t("footer")}</p>` con:

```tsx
<footer className="mt-8 text-center text-xs text-slate-400 space-y-1">
  <p>{t("footer")}</p>
  <p>
    <a
      href="https://github.com/BaolCristian/savint"
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-brand-blue hover:underline"
    >
      {t("githubLabel")} →
    </a>
  </p>
</footer>
```

- [ ] **Step 4: Verifica**

Run: `npm run lint && npm run test:run && npx tsc --noEmit && npm run build`
Expected: tutto verde (build `✓ Compiled successfully`); nessun errore i18n "missing message".

- [ ] **Step 5: Commit**

```bash
git add src/components/hub/hub-landing.tsx
git commit -m "feat(hub): home narrativa — perché SAVINT, come funziona, footer con credit"
```

## Self-review (autore del piano)

- **Copertura spec**: hero copy→T1 (chiavi) reso da componente esistente; card valori→T2 S1; 3 passi→T2 S2; footer credit+GitHub→T2 S3; featured/scuola invariati (nessun task, corretto); verifica→T2 S4; screenshot finale a carico del reviewer (Opus).
- **Placeholder**: nessuno; JSX e JSON completi.
- **Coerenza**: le chiavi usate in T2 (`whyTitle`, `howStep1Title`, ecc.) coincidono con quelle definite in T1.
