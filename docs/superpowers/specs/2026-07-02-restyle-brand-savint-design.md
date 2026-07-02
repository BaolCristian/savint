# Restyling brand SAVINT — Hub & Gioco

**Data:** 2026-07-02
**Autore:** brainstorming (Opus) → esecuzione (Sonnet)
**Stato:** approvato (direzione), in attesa piano operativo

## Contesto

SAVINT è una piattaforma di quiz interattivi per la scuola (clone Kahoot), Next.js 16 +
React 19 + Tailwind v4 + shadcn. Una scuola è già live (Paolo Sarpi), quindi il rischio
di regressione conta.

Analisi dello stato attuale:

- **Brand**: il logo (`public/logo_savint.png`) è un gufo-mascotte con tocco di laurea e
  matita, wordmark multicolore **blu / arancione / verde / magenta**. Giocoso, educativo.
  Oggi usato solo come iconcina 80px nella landing. **Non esiste come sistema di colori.**
- **Gioco** (`src/components/live/host-view.tsx`, `player-view.tsx`): già di qualità
  "Kahoot" (tessere colorate, coriandoli, podio, suoni, molte animazioni in `globals.css`),
  ma con palette **incoerente** tra schermate e tra host/player, colori **hardcoded e
  duplicati** (array coriandoli, gradienti risposte), **forme ▲◆●■ solo sul proiettore
  (host)** e non sui pulsanti dello studente, **brand mark incoerente** ("Q" sull'host vs
  logo sul player).
- **Hub** (landing, dashboard, editor, auth): è lo **shadcn di default monocromo** — token
  tutti grigi (chroma 0) in `src/app/globals.css`, primario quasi nero, accenti indaco
  casuali. Sembra un template admin non brandizzato; la mascotte è quasi assente.

## Obiettivo

Rendere l'interfaccia **più accattivante e usabile**, con l'identità di un ambiente di
**quiz online per studenti: giocoso ma di studio**. Strategia scelta con l'utente:

1. **Ambizione**: restyling brand-driven **+ ritocchi di gerarchia/layout** sulle pagine
   hub chiave e **più presenza della mascotte** (livello "redesign più deciso", ma senza
   ripensare tutto da zero). Layout invariati dove non serve.
2. **Palette**: colori del logo, **disciplinati** — blu primario, arancione accento,
   verde successo, magenta highlight. I 4 colori diventano anche le tessere risposta.
3. **Focus**: **bilanciato, hub-first** — identità forte sull'hub (landing + dashboard
   prioritarie), polish mirato sul gioco (già buono).

## Principi di design

- **Giocoso ma di studio**: colori brand vivaci ma disciplinati, angoli morbidi, mascotte
  amichevole ricorrente; tipografia leggibile e gerarchia chiara. Non "arcade caotico".
- **Accessibilità**: si mantiene **Atkinson Hyperlegible** (font ad alta leggibilità).
  Il mapping colore↔forma sulle risposte aiuta anche i daltonici. Contrasto AA sui testi.
- **Token, non hardcoded**: i colori vivono in `globals.css` come variabili CSS; i
  componenti li referenziano. Fine agli hex duplicati.
- **Rischio basso**: nessuna modifica a logica di gioco/socket/DB/i18n. Solo presentazione.

## Sistema di design token

### Colori brand (in `src/app/globals.css`, blocco `:root` + `@theme inline`)

Aggiungere token brand grezzi (valori **approssimati** — Sonnet li **campiona dai pixel
saturi** di `public/logo_savint.png` per i valori esatti; formato hex o oklch, Tailwind v4
accetta entrambi in `@theme`):

| Token | ≈ Valore | Ruolo |
|---|---|---|
| `--brand-blue` | `#2C7BE5` | Primario: primary, link, header, CTA principale |
| `--brand-orange` | `#F5921E` | Accento energia, evidenze, matita |
| `--brand-green` | `#5DB82C` | Successo, "corretto", stat positive |
| `--brand-magenta` | `#E01B6A` | Highlight, badge, elementi in evidenza |
| `--brand-ink` | `#1E293B` (navy tocco) | Testi forti, superfici scure "brand" |

Derivare inoltre varianti chiare per gli sfondi tenui (es. `--brand-blue-50`,
`--brand-orange-50`, ecc.) usando `color-mix` o tinte oklch.

### Wiring nei token semantici shadcn

- `--primary` → `--brand-blue` (e `--primary-foreground` bianco).
- `--ring` → tinta del blu-brand.
- `--background` leggermente **caldo** invece del bianco puro (es. oklch ~`0.99 0.005 90`),
  `--card` bianco, per un hub meno clinico.
- `--destructive` resta rosso; introdurre `--success` = `--brand-green` per gli stati
  positivi (oggi non esiste un token successo).
- **Non toccare** i `--chart-*` (usati da recharts) se non per allinearli al brand in modo
  opzionale/basso rischio.

### Palette di gioco (nuovo blocco condiviso)

Definire **un'unica sorgente** per la palette del gioco, riusata da host e player. Opzioni:
un modulo TS `src/lib/game-theme.ts` (preferito, tipizzato) **oppure** variabili CSS
dedicate. Contenuto:

- **`ANSWER_TILES`**: array di 4 elementi `{ colorClass/gradient, shape }`, mapping
  colore↔forma **identico su host e player**. Proposta (Sonnet può rifinire l'ordine):
  - 0 → blu, forma `▲`
  - 1 → arancione, forma `◆`
  - 2 → magenta, forma `●`
  - 3 → verde, forma `■`
- **`CONFETTI_COLORS`**: unico array (oggi duplicato identico in host-view e player-view).
- Colori semantici gioco: `correct` = brand-green, `wrong` = rosso, `timer-critical` = rosso.

> Nota sul verde: il verde è sia colore di una tessera risposta sia colore "corretto". I due
> non compaiono mai simultaneamente (il feedback è una fase a schermo intero separata) e le
> **forme** disambiguano; l'uso è quindi accettabile e mantiene i 4 colori brand.

## Mascotte-gufo come personaggio ricorrente

Oggi il gufo è solo un'iconcina. Dargli presenza (riusando l'asset esistente, niente nuove
illustrazioni da produrre):

- **Hero landing**: mascotte grande e centrale.
- **Empty states**: "nessun quiz ancora", "in attesa di giocatori", liste vuote → gufo al
  posto dei soli emoji.
- **Attesa/lobby del gioco**: il gufo come compagno d'attesa (player `waiting`, host lobby).
- **Brand mark unico**: sostituire la "Q" dell'header host (`host-view.tsx` ~riga 438) con
  il gufo, così host e player condividono lo stesso segno.

## Interventi HUB (priorità)

Layout mantenuti salvo i ritocchi di gerarchia indicati.

### Landing — `src/components/hub/hub-landing.tsx`
- Hero: mascotte grande + trattamento brand del wordmark + CTA primaria blu / secondaria
  arancio; sostituire il gradiente indaco/violetto con sfondo brand caldo.
- Card "quiz in evidenza": più calde/gerarchiche (accento brand, ombre morbide, meta).
- Sezione "porta SAVINT a scuola": oggi blocco `bg-slate-900` anonimo → versione brand
  (blu-ink o gradiente brand) più invitante.

### Header hub — `src/components/hub/hub-header.tsx`
- Logo + wordmark brand, link/stati attivi in blu-brand.

### Dashboard — `src/app/(dashboard)/dashboard/page.tsx` + `src/components/dashboard/sidebar.tsx`
- Le 4 stat-card assumono i 4 colori brand: quiz=blu, sessioni=arancio, studenti=magenta,
  media%=verde (icone + accenti coerenti).
- Sidebar: stato attivo blu-brand, migliore leggibilità gerarchica.

### Auth — `src/app/(hub)/hub-login/page.tsx`, `hub-register/page.tsx` (+ forgot/verify)
- Tocco brand + mascotte; oggi molto spogli. Solo presentazione, non la logica dei form.

### Card/quiz card riusabili — `src/components/hub/hub-quiz-card.tsx`
- Allineare al nuovo linguaggio (accenti brand, meta, hover).

## Interventi GIOCO (polish mirato)

### `src/components/live/host-view.tsx` e `src/components/live/player-view.tsx`
- Sostituire `MC_COLORS` / `MC_GRADIENTS` / array coriandoli locali con la **sorgente
  condivisa** (`game-theme.ts`).
- **Forme ▲◆●■ anche sui pulsanti risposta dello studente** (`MultipleChoiceInput`),
  coerenti con l'host.
- **Unificare la palette** tra host/player e tra le fasi (join, attesa, domanda, feedback,
  podio) attorno al brand: ridurre la dispersione indaco/viola / emerald / ambra-rosa a una
  gamma coerente derivata dai token brand (mantenendo correct=verde, wrong=rosso).
- **Brand mark**: gufo al posto della "Q" nell'host.
- Estrarre `AvatarDisplay`/`HostAvatar` e la palette in punti condivisi dove riduce
  duplicazione **senza** riscrivere la struttura a fasi (no refactor rischioso).

## Fuori scope (YAGNI)

- Nessuna dark-mode nuova; nessun cambio font; nessuna nuova illustrazione oltre alla
  mascotte esistente.
- Nessuna modifica a logica di gioco, socket, DB/Prisma, i18n/messaggi, API.
- Nessun ridisegno "da zero" di layout complessi (editor quiz, pannelli admin restano
  funzionalmente identici; ricevono solo l'ereditarietà dei token brand).

## Verifica

- **Build/lint**: `npm run build` e `npm run lint` verdi.
- **Test**: `npm run test:run` verde (i test esistenti non devono rompersi; attenzione ai
  `data-testid` come `session-pin`, `player-card` — **non rimuoverli/rinominarli**).
- **A schermo** (skill `run`/`verify`): landing, dashboard, e un giro di gioco
  (lobby host → join player → domanda → feedback → podio) per validare coerenza palette,
  forme sulle risposte, mascotte e leggibilità.
- **Contrasto**: testo su superfici brand ≥ AA.

## Esecuzione

Piano a step con checkpoint (Sonnet 5), ordine consigliato per minimizzare il rischio:
1. **Token brand** in `globals.css` + `game-theme.ts` (fondamenta, nessun cambio visivo
   evidente finché non referenziati).
2. **Gioco**: puntare host/player alla sorgente condivisa, forme sullo studente, brand mark,
   coerenza palette.
3. **Hub**: landing → dashboard/sidebar → header → auth → card.
4. Verifica build/lint/test + giro a schermo.

## File coinvolti (inventario)

- `src/app/globals.css` — token brand, wiring shadcn, sfondo caldo.
- `src/lib/game-theme.ts` — **nuovo**, sorgente condivisa palette/forme/coriandoli gioco.
- `src/components/live/host-view.tsx`, `src/components/live/player-view.tsx` — gioco.
- `src/components/hub/hub-landing.tsx`, `hub-header.tsx`, `hub-quiz-card.tsx` — hub pubblico.
- `src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/sidebar.tsx` — dashboard.
- `src/app/(hub)/hub-login/page.tsx`, `hub-register/page.tsx` (+ forgot/verify) — auth.
- (Eventuali) `src/components/ui/button.tsx` / `card.tsx` solo se serve un ritocco varianti
  brand; preferibile lasciarli guidati dai token.
