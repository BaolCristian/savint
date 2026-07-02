# Restyling brand SAVINT — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dare a SAVINT un'identità visiva coerente basata sul brand (gufo: blu/arancio/verde/magenta), scaldando l'hub oggi monocromo e unificando/rifinendo il gioco, mantenendo i layout e la logica.

**Architecture:** Un unico sistema di design token in `globals.css` (colori brand + wiring shadcn) e un modulo TS condiviso `game-theme.ts` (palette risposte + forme + coriandoli) come **sorgente unica** per host e player. I componenti smettono di hardcodare colori e referenziano i token/il modulo. Nessuna modifica a socket/DB/i18n/API.

**Tech Stack:** Next.js 16, React 19, Tailwind v4 (`@theme inline` in `globals.css`), shadcn/ui, next-intl, font Atkinson Hyperlegible.

## Global Constraints

- **Non rompere i test esistenti** né rimuovere/rinominare i `data-testid` (`session-pin`, `player-card`, ecc.). Guardrail per ogni task: `npm run lint` + `npm run test:run` verdi.
- **Nessun cambio** a logica di gioco, socket (`src/lib/socket`), Prisma/DB, messaggi i18n (`src/messages`), API. Solo presentazione.
- **Font invariato**: Atkinson Hyperlegible. Nessuna dark-mode nuova. Nessuna nuova illustrazione (riuso solo `public/logo_savint.png`).
- **Palette brand** (valori ≈, da rifinire campionando il PNG in Task 1): blu `#2C7BE5`, arancio `#F5921E`, verde `#5DB82C`, magenta `#E01B6A`, ink `#1E293B`.
- **Mapping colore↔forma risposte identico** su host e player: 0=blu`▲`, 1=arancio`◆`, 2=magenta`●`, 3=verde`■`.
- **Contrasto testo ≥ AA** su superfici brand.
- **Commit frequenti**, uno per task, sul branch di lavoro `restyle-brand-savint`.
- **Verifica visuale**: dopo i task di gruppo (gioco / hub) fare un giro a schermo con la skill `run`/`verify`.

---

### Task 1: Token brand in `globals.css`

Fondamenta. Introduce i colori brand e li collega ai token semantici shadcn, senza (ancora) stravolgere l'aspetto: dopo questo task l'hub è già leggermente "brandizzato" perché `--primary` diventa blu.

**Files:**
- Modify: `src/app/globals.css` (blocco `@theme inline` righe 7-48, `:root` righe 50-83)

**Interfaces:**
- Produces (variabili CSS disponibili ovunque via Tailwind/`var()`):
  `--brand-blue`, `--brand-orange`, `--brand-green`, `--brand-magenta`, `--brand-ink`,
  le tinte `-50` corrispondenti, e il token `--success` (+ `--success-foreground`).
  `--primary` viene reindirizzato su `--brand-blue`.

- [ ] **Step 1: Campionare i colori esatti dal logo**

Aprire `public/logo_savint.png` (Read tool mostra l'immagine) e leggere i colori del wordmark
"SAVINT": S/T = blu, A/I = arancio, V = verde, N = magenta. Usare quei valori per rifinire gli hex ≈ della tabella qui sotto. Se non si riesce a campionare con precisione, usare i valori ≈ così come sono (sono già buoni).

- [ ] **Step 2: Aggiungere i token brand grezzi in `:root`**

In `src/app/globals.css`, dentro `:root { ... }` (dopo `--radius: 0.625rem;`), aggiungere:

```css
  /* ── SAVINT brand palette (dal logo: gufo + wordmark) ── */
  --brand-blue: #2C7BE5;
  --brand-orange: #F5921E;
  --brand-green: #5DB82C;
  --brand-magenta: #E01B6A;
  --brand-ink: #1E293B;
  /* tinte tenui per sfondi/badge */
  --brand-blue-50: color-mix(in srgb, var(--brand-blue) 10%, white);
  --brand-orange-50: color-mix(in srgb, var(--brand-orange) 12%, white);
  --brand-green-50: color-mix(in srgb, var(--brand-green) 12%, white);
  --brand-magenta-50: color-mix(in srgb, var(--brand-magenta) 10%, white);
  /* stato successo (prima inesistente) */
  --success: var(--brand-green);
  --success-foreground: oklch(0.985 0 0);
```

- [ ] **Step 3: Reindirizzare i token semantici su brand + sfondo caldo**

Sempre in `:root`, sostituire queste righe:

```css
  --background: oklch(1 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --ring: oklch(0.708 0 0);
```

con:

```css
  --background: oklch(0.994 0.004 95);      /* bianco caldo, non clinico */
  --primary: var(--brand-blue);
  --primary-foreground: oklch(0.985 0 0);
  --ring: var(--brand-blue);
```

- [ ] **Step 4: Esporre i token brand in `@theme inline`**

Dentro il blocco `@theme inline { ... }` (righe 7-48), aggiungere (così diventano utilities Tailwind tipo `bg-brand-blue`, `text-brand-orange`, ecc.):

```css
  --color-brand-blue: var(--brand-blue);
  --color-brand-orange: var(--brand-orange);
  --color-brand-green: var(--brand-green);
  --color-brand-magenta: var(--brand-magenta);
  --color-brand-ink: var(--brand-ink);
  --color-brand-blue-50: var(--brand-blue-50);
  --color-brand-orange-50: var(--brand-orange-50);
  --color-brand-green-50: var(--brand-green-50);
  --color-brand-magenta-50: var(--brand-magenta-50);
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
```

- [ ] **Step 5: Verifica**

Run: `npm run lint && npm run test:run`
Expected: PASS (nessuna regressione). Poi `npx tsc --noEmit` — Expected: nessun errore.
Verifica a schermo opzionale: la home/dashboard ora ha bottoni/link blu-brand invece che neri.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): sistema di design token brand SAVINT (blu/arancio/verde/magenta)"
```

---

### Task 2: Modulo condiviso `game-theme.ts`

Sorgente unica per la palette del gioco: elimina la duplicazione di gradienti/coriandoli tra host e player e definisce il mapping colore↔forma.

**Files:**
- Create: `src/lib/game-theme.ts`

**Interfaces:**
- Produces:
  - `ANSWER_TILES: { gradient: string; solid: string; shape: string; ring: string }[]` (length 4)
  - `CONFETTI_COLORS: string[]`
  - `GAME = { correctGradient: string; wrongGradient: string; brandGradient: string }`

- [ ] **Step 1: Creare il modulo**

Create `src/lib/game-theme.ts`:

```ts
/**
 * Sorgente unica per i colori del gioco live (host + player).
 * Mapping colore↔forma coerente su entrambe le viste (utile anche ai daltonici).
 * Ordine tessere: 0=blu ▲, 1=arancio ◆, 2=magenta ●, 3=verde ■.
 */

export const ANSWER_TILES = [
  { gradient: "from-brand-blue to-blue-700",       solid: "bg-brand-blue",    shape: "▲", ring: "ring-blue-300" },     // ▲
  { gradient: "from-brand-orange to-orange-600",   solid: "bg-brand-orange",  shape: "◆", ring: "ring-orange-300" },   // ◆
  { gradient: "from-brand-magenta to-pink-700",    solid: "bg-brand-magenta", shape: "●", ring: "ring-pink-300" },     // ●
  { gradient: "from-brand-green to-green-700",     solid: "bg-brand-green",   shape: "■", ring: "ring-green-300" },     // ■
] as const;

/** Palette coriandoli unica (prima duplicata in host-view e player-view). */
export const CONFETTI_COLORS = [
  "#2C7BE5", "#F5921E", "#5DB82C", "#E01B6A",
  "#4D96FF", "#FFD93D", "#00E5FF", "#FF6B6B",
  "#76FF03", "#E040FB", "#FF8C00", "#536DFE",
];

/** Gradienti semantici condivisi. */
export const GAME = {
  correctGradient: "from-emerald-400 to-brand-green",   // "corretto" resta verde
  wrongGradient: "from-red-400 to-rose-600",            // "sbagliato" resta rosso
  brandGradient: "from-brand-blue to-brand-magenta",    // gradiente brand per header/CTA
} as const;
```

> Nota: le utilities `from-brand-*` / `bg-brand-*` funzionano perché i colori sono esposti in `@theme inline` (Task 1, Step 4). Verificare che Tailwind le generi; se una utility gradient non venisse generata, usare `bg-[var(--brand-blue)]` come fallback.

- [ ] **Step 2: Verifica**

Run: `npx tsc --noEmit`
Expected: nessun errore (il modulo è tipizzato, non ancora importato).

- [ ] **Step 3: Commit**

```bash
git add src/lib/game-theme.ts
git commit -m "feat(game): modulo condiviso game-theme (palette risposte, forme, coriandoli)"
```

---

### Task 3: Host-view — palette condivisa, brand mark gufo

**Files:**
- Modify: `src/components/live/host-view.tsx` (confetti 24-57, `MC_COLORS`/`MC_ICONS` 164-171, lobby header 434-452, risposte 744-772, distribution 940-990)

**Interfaces:**
- Consumes: `ANSWER_TILES`, `CONFETTI_COLORS`, `GAME` da `@/lib/game-theme`.

- [ ] **Step 1: Importare la sorgente condivisa e rimuovere i duplicati**

In cima al file aggiungere `import { ANSWER_TILES, CONFETTI_COLORS, GAME } from "@/lib/game-theme";`.
In `HostConfetti` sostituire l'array locale `colors` con `CONFETTI_COLORS`.
Sostituire `MC_COLORS` (164-169) con l'uso di `ANSWER_TILES[i].gradient`, e `MC_ICONS` (171) con `ANSWER_TILES[i].shape`. Aggiornare tutti i punti che usavano `MC_COLORS`/`MC_ICONS` (risposte MC riga ~750-753, e la distribution ~955/973 dove `MC_COLORS` è usato per le barre).

- [ ] **Step 2: Brand mark gufo al posto della "Q"**

Nel lobby header (righe ~438-441) sostituire il div con la lettera "Q":

```tsx
<div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 ...">Q</div>
```

con la mascotte:

```tsx
<img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-9 h-9 object-contain shrink-0" />
```

(`withBasePath` è già importato nel file.)

- [ ] **Step 3: Allineare gli accenti brand (basso rischio)**

Dove l'host usa `indigo-*`/`purple-*` come accento cromatico "di sistema" (badge PIN, barra progresso domanda, pulsante "salta ai risultati", CTA finale) preferire il blu-brand: sostituire `bg-indigo-600`→`bg-brand-blue`, `bg-indigo-500` (barra progresso)→`bg-brand-blue`, e il gradiente footer `from-indigo-500 to-purple-600`→`GAME.brandGradient`. **Lasciare invariati** i gradienti di stato già sensati (verde start, ambra azioni, podio oro/argento/bronzo, countdown ambra→verde).

- [ ] **Step 4: Verifica**

Run: `npm run lint && npm run test:run`
Expected: PASS. Verificare che i test host (se presenti) e i `data-testid` (`session-pin`, `player-card`) siano intatti.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/host-view.tsx
git commit -m "feat(live): host-view su palette brand condivisa + brand mark gufo"
```

---

### Task 4: Player-view — palette condivisa, forme sulle risposte, coerenza fasi

**Files:**
- Modify: `src/components/live/player-view.tsx` (confetti 69-111, `MC_GRADIENTS` 1133-1138, `MultipleChoiceInput` 1140-1190, feedback confidence 834/842-844, brand accenti join/kicked)

**Interfaces:**
- Consumes: `ANSWER_TILES`, `CONFETTI_COLORS`, `GAME` da `@/lib/game-theme`.

- [ ] **Step 1: Importare la sorgente condivisa**

Aggiungere `import { ANSWER_TILES, CONFETTI_COLORS, GAME } from "@/lib/game-theme";`.
In `Confetti` sostituire l'array locale `colors` con `CONFETTI_COLORS`.
Sostituire `MC_GRADIENTS` (1133-1138) con l'uso di `ANSWER_TILES[i].gradient` (o `.solid`).

- [ ] **Step 2: Forme ▲◆●■ sui pulsanti risposta dello studente**

In `MultipleChoiceInput` (render ~1167-1176), aggiungere la forma coerente con l'host accanto/sopra al testo, così lo studente mappa il proprio pulsante alla risposta proiettata:

```tsx
<button
  key={i}
  onClick={() => isMulti ? toggle(i) : onSubmit({ selected: [i] })}
  className={`flex items-center justify-center gap-2 rounded-2xl min-h-16 sm:min-h-20 lg:min-h-24 p-2 sm:p-3 lg:p-4 text-white font-bold text-base sm:text-lg lg:text-xl shadow-lg transition-all bg-gradient-to-br ${ANSWER_TILES[i % 4].gradient} ${isMulti && isSelected ? "ring-4 ring-white scale-105" : ""} ${isMulti && !isSelected ? "opacity-80 hover:opacity-100" : "hover:scale-105 active:scale-95"}`}
>
  <span className="text-xl sm:text-2xl opacity-70 shrink-0">{ANSWER_TILES[i % 4].shape}</span>
  {isMulti && isSelected && <span>✓</span>}
  <span>{c.text}</span>
</button>
```

- [ ] **Step 3: Coerenza palette tra le fasi**

Ridurre la dispersione cromatica verso il brand, **mantenendo** correct=verde / wrong=rosso:
- Join screen (472, 497, 513, 526, 548, 568, 600): gli accenti `emerald-*` del form → blu-brand (`focus:border-brand-blue`, `focus:ring-brand-blue/20`, tab attiva `bg-brand-blue`, bottone "Entra" `bg-brand-blue`/`hover:bg-blue-700`). Il link "explore" `indigo-*` → `text-brand-blue`.
- Feedback "confidence" (834 gradiente `from-indigo-500 to-purple-700`) → `GAME.brandGradient`.
- Podio player (992 `from-amber-400 via-orange-500 to-pink-500`): mantenere festoso ma virare verso brand (`from-brand-orange via-brand-magenta to-brand-blue`) — scelta estetica di Sonnet, purché coerente col resto.
- Schermata `kicked` (640) e altri `indigo-*` di sistema → blu-brand.

> Mantenere invariati i gradienti countdown (ambra→rosso→verde) e i feedback correct/wrong.

- [ ] **Step 4: Verifica**

Run: `npm run lint && npm run test:run`
Expected: PASS. Controllare i test del player (join/answer) se presenti.

- [ ] **Step 5: Commit**

```bash
git add src/components/live/player-view.tsx
git commit -m "feat(live): player-view su palette brand + forme sulle risposte + coerenza fasi"
```

- [ ] **Step 6: Verifica a schermo del GIOCO (checkpoint)**

Usare la skill `run`/`verify`: avviare l'app, fare un giro lobby host → join player → domanda (verificare forme+colori coerenti host/player) → feedback → podio. Confermare coerenza palette, forme, brand mark gufo, leggibilità.

---

### Task 5: Hub — landing + header

**Files:**
- Modify: `src/components/hub/hub-landing.tsx` (108 righe), `src/components/hub/hub-header.tsx` (53 righe)

- [ ] **Step 1: Landing hero brandizzato + mascotte protagonista**

In `hub-landing.tsx`: sfondo `from-indigo-50 via-white to-violet-50` (18) → sfondo brand caldo (es. `from-brand-blue-50 via-background to-brand-magenta-50`). Ingrandire la mascotte hero (24: da `h-20 w-20` a `h-28 w-28 sm:h-36 sm:w-36`). CTA: bottone "cerca"/`browseAll` (42, 50) `bg-indigo-600` → `bg-brand-blue hover:bg-blue-700`; `signUp` (56) accento arancio/brand. Titolo `text-slate-900` invariato (leggibilità).

- [ ] **Step 2: Card "quiz in evidenza" e sezione scuola**

Card (69-79): accento brand su hover/bordo (`hover:border-brand-blue/40`), ombre morbide. Sezione "porta SAVINT a scuola" (86 `bg-slate-900`) → superficie brand più invitante (es. `bg-brand-ink` o gradiente `GAME.brandGradient` equivalente in classi), CTA leggibili in AA.

- [ ] **Step 3: Header hub**

In `hub-header.tsx`: logo + eventuale wordmark, link/stato attivo in `text-brand-blue`, hover coerenti. Mantenere struttura sticky.

- [ ] **Step 4: Verifica**

Run: `npm run lint && npm run test:run` → PASS.
A schermo: la landing deve leggersi "SAVINT" (mascotte + colori brand), non un template neutro.

- [ ] **Step 5: Commit**

```bash
git add src/components/hub/hub-landing.tsx src/components/hub/hub-header.tsx
git commit -m "feat(hub): landing hero brandizzato con mascotte + header brand"
```

---

### Task 6: Hub — dashboard stat cards + sidebar

**Files:**
- Modify: `src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/sidebar.tsx`

- [ ] **Step 1: Stat-card nei 4 colori brand**

In `dashboard/page.tsx`, dare alle 4 stat-card i colori brand (icona + accento): quiz=blu, sessioni=arancio, studenti=magenta, media%=verde. Usare le tinte `-50` per gli sfondi e il colore pieno per icone/numeri. Mantenere struttura/griglia e i dati invariati.

- [ ] **Step 2: Sidebar con stato attivo brand**

In `sidebar.tsx`, la voce attiva usa `bg-brand-blue-50 text-brand-blue` (o `border-l` blu-brand), hover coerenti; icone allineate. Nessun cambio alle rotte/voci.

- [ ] **Step 3: Verifica**

Run: `npm run lint && npm run test:run` → PASS.
A schermo: dashboard con 4 card colorate e sidebar con evidenza blu sulla voce attiva.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(dashboard)/dashboard/page.tsx" src/components/dashboard/sidebar.tsx
git commit -m "feat(hub): dashboard stat-card e sidebar brandizzate"
```

---

### Task 7: Hub — auth + quiz card riusabile

**Files:**
- Modify: `src/app/(hub)/hub-login/page.tsx`, `src/app/(hub)/hub-register/page.tsx`, `src/components/hub/hub-quiz-card.tsx`
- (Se il tempo lo consente, allineare anche `hub-forgot-password/page.tsx`, `hub-verify-email/page.tsx`.)

- [ ] **Step 1: Auth brandizzata + mascotte**

In login/register: aggiungere la mascotte in testa al form (`/logo_savint.png`, ~`h-16 w-16`), CTA primaria `bg-brand-blue`, link in `text-brand-blue`. **Non toccare** campi, submit, validazione, OAuth: solo classi/presentazione.

- [ ] **Step 2: Quiz card riusabile**

In `hub-quiz-card.tsx`: allineare al linguaggio brand (accento su hover/bordo, meta leggibili, ombre morbide). Coerente con le card della landing.

- [ ] **Step 3: Verifica**

Run: `npm run lint && npm run test:run` → PASS. Attenzione ai test affiliazione/auth mockati (getProviders/useRouter) — non cambiare la logica.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(hub)/hub-login/page.tsx" "src/app/(hub)/hub-register/page.tsx" src/components/hub/hub-quiz-card.tsx
git commit -m "feat(hub): auth e quiz card brandizzate"
```

---

### Task 8: Verifica finale complessiva

**Files:** nessuna modifica (solo verifica; eventuali fix mirati emersi).

- [ ] **Step 1: Build completa**

Run: `npm run build`
Expected: build OK, nessun errore TypeScript/ESLint bloccante.

- [ ] **Step 2: Suite test**

Run: `npm run test:run`
Expected: tutti verdi.

- [ ] **Step 3: Giro a schermo end-to-end**

Skill `run`/`verify`: landing → dashboard → editor (eredita i token) → giro di gioco completo. Checklist: palette brand coerente ovunque, mascotte presente (hero/empty/lobby), forme sulle risposte host+player, contrasto AA, nessuna regressione funzionale.

- [ ] **Step 4: Commit finale (se fix)**

```bash
git add -A
git commit -m "fix(ui): rifiniture restyling brand SAVINT dopo verifica"
```

## Self-review (autore del piano)

- **Copertura spec**: token brand→T1; game-theme/palette unica→T2; host (palette+brand mark)→T3; player (palette+forme+coerenza)→T4; landing+header→T5; dashboard+sidebar→T6; auth+card→T7; verifica+mascotte empty states verificati→T8. Empty states/lobby mascotte: coperti come parte di T3 (lobby host)/T4 (waiting player)/T5 (landing) — se emergono altri empty state, aggiungerli nel task hub pertinente.
- **Placeholder**: nessun TBD; codice completo per token e modulo; edit puntuali con esempi per i componenti. (Il restyling estetico dei componenti è volutamente guidato-non-dettagliato al 100% perché richiede giudizio visivo; il guardrail è lint+test+build verdi e verifica a schermo.)
- **Coerenza tipi**: `ANSWER_TILES`/`CONFETTI_COLORS`/`GAME` definiti in T2 e consumati con gli stessi nomi in T3/T4.
