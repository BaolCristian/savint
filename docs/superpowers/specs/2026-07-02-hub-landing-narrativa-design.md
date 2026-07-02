# Home hub narrativa — spiegare lo scopo del progetto

**Data:** 2026-07-02
**Stato:** design approvato dall'utente (copy compreso), esecuzione Sonnet con review Opus

## Contesto

La home dell'hub (`savint.it`, componente `src/components/hub/hub-landing.tsx`) oggi è
scarna: hero + ricerca + quiz in evidenza + box scuola. Non racconta lo scopo del
progetto. L'utente vuole che la home spieghi bene: **open source, per le scuole,
gratuito/libero, condivisione dei quiz e delle esperienze**, con credit
"scritto da Cristian Virgili con l'ausilio di Claude".

Approccio scelto (tra tre proposte): **landing narrativa completa** — lo scopo
raccontato in home con sezioni dedicate, non in una pagina separata.

## Struttura della pagina (dall'alto in basso)

1. **Hero** (rinnovato nel copy, layout attuale): mascotte, titolo, sottotitolo,
   form di ricerca, CTA Sfoglia/Registrati.
2. **Perché SAVINT** — 4 card valori in griglia 2×2 (1 colonna su mobile), ognuna con
   emoji, titolo e 1-2 frasi; accento in uno dei 4 colori brand (blu, verde, arancio,
   magenta) usando le tinte `-50` per lo sfondo, come le stat-card della dashboard.
3. **Come funziona** — 3 passi numerati (cerchi numerati nei colori brand, layout
   orizzontale su desktop, verticale su mobile).
4. **Quiz in evidenza** — invariato (logica `searchHubQuizzes` esistente).
5. **Porta SAVINT nella tua scuola** — invariato (già restyled col gradiente brand).
6. **Footer** — credit + link GitHub.

## Copy esatto (i18n, namespace `hubHome`)

Chiavi nuove/modificate in `src/messages/it.json` e `src/messages/en.json`.
Le chiavi esistenti non elencate (searchPlaceholder, searchButton, browseAll, signUp,
featuredTitle, schoolTitle, schoolBody, tryItButton, installCta) restano invariate.

| chiave | IT | EN |
|---|---|---|
| `heroTitle` | Crea, gioca, condividi | Create, play, share |
| `heroSubtitle` | SAVINT è la piattaforma open source di quiz interattivi per la scuola: gratuita, libera e costruita sulla condivisione. I docenti creano quiz, li giocano in classe e li mettono a disposizione di tutti. | SAVINT is the open-source interactive quiz platform for schools: free, libre and built on sharing. Teachers create quizzes, play them in class and make them available to everyone. |
| `whyTitle` | Perché SAVINT | Why SAVINT |
| `whyOpenTitle` | Open source | Open source |
| `whyOpenBody` | Codice libero (AGPL-3.0), pubblico su GitHub. Chiunque può verificarlo, migliorarlo e adattarlo alla propria scuola. | Free code (AGPL-3.0), public on GitHub. Anyone can inspect it, improve it and adapt it to their school. |
| `whyFreeTitle` | Gratuito, per sempre | Free, forever |
| `whyFreeBody` | Niente abbonamenti, pubblicità o dati rivenduti. Nato per la scuola, resta gratuito per tutti. | No subscriptions, ads or data selling. Born for schools, it stays free for everyone. |
| `whySchoolTitle` | Fatto per la scuola | Made for school |
| `whySchoolBody` | Pensato per la classe: tanti tipi di domande, modalità pratica per lo studio individuale e statistiche per il docente. | Designed for the classroom: many question types, practice mode for individual study and statistics for the teacher. |
| `whyShareTitle` | La condivisione al centro | Sharing at the core |
| `whyShareBody` | Ogni quiz pubblicato è un'esperienza che altri docenti possono riusare, clonare e migliorare. Il sapere cresce quando circola. | Every published quiz is an experience other teachers can reuse, clone and improve. Knowledge grows when it circulates. |
| `howTitle` | Come funziona | How it works |
| `howStep1Title` | Cerca e prova | Search and try |
| `howStep1Body` | Sfoglia i quiz dei docenti e provali subito dal browser, senza registrarti. | Browse quizzes made by teachers and try them right in your browser, no sign-up needed. |
| `howStep2Title` | Gioca in classe | Play in class |
| `howStep2Body` | Avvia una partita dal vivo: gli studenti entrano con un PIN dal telefono, come un game show. | Start a live game: students join with a PIN from their phones, game-show style. |
| `howStep3Title` | Pubblica e condividi | Publish and share |
| `howStep3Body` | Crea i tuoi quiz e pubblicali sull'hub: la tua esperienza diventa un punto di partenza per altre classi. | Create your own quizzes and publish them on the hub: your experience becomes a starting point for other classes. |
| `footer` (sostituisce l'attuale) | SAVINT è software libero (AGPL-3.0), scritto da Cristian Virgili con l'ausilio di Claude. | SAVINT is free software (AGPL-3.0), written by Cristian Virgili with the help of Claude. |
| `githubLabel` | Codice sorgente su GitHub | Source code on GitHub |

Emoji per le card (hardcoded nel componente, non i18n): 🔓 open, 🆓 gratuito,
🏫 scuola, 🤝 condivisione. Numeri dei passi: 1/2/3 in cerchi colorati
(blu, arancio, verde).

Link GitHub nel footer: `https://github.com/BaolCristian/savint` (target _blank,
rel noopener).

## Vincoli

- Solo presentazione: **nessuna** modifica a search/featured/API/routing.
- `hub-landing.tsx` resta un **server component** (usa `getTranslations`).
- Token brand esistenti (`--brand-*`, tinte `-50`): niente colori hardcoded nuovi.
- Chiavi i18n aggiunte a **entrambe** le lingue (next-intl fallisce a runtime se mancano).
- Responsive: card 2×2 → 1 colonna, passi orizzontali → verticali.
- Lint + `npm run test:run` + `npm run build` verdi.

## Verifica

Build + test + screenshot della home (desktop e mobile) per confermare gerarchia,
leggibilità e contrasto AA sulle superfici tinte.
