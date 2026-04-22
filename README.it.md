# SAVINT

**Piattaforma gratuita di quiz interattivi per la scuola.**

> **[English](README.md)** | **[Italiano](README.it.md)**

---

## Indice

- [Descrizione](#descrizione)
- [Funzionalita'](#funzionalita)
- [Stack tecnologico](#stack-tecnologico)
- [Avvio rapido](#avvio-rapido)
- [Come funziona](#come-funziona)
- [Tipi di domanda](#tipi-di-domanda)
- [Comandi principali](#comandi-principali)
- [Deploy in produzione](#deploy-in-produzione)
- [Utente Admin](#utente-admin)
- [Configurazione Google OAuth](#configurazione-google-oauth)
- [Licenza](#licenza)

---

## Descrizione

Il docente crea quiz, li proietta sulla LIM e gli studenti rispondono in tempo reale dal proprio telefono. Pensata per rendere le lezioni piu' coinvolgenti e la valutazione formativa piu' immediata.

> SAVINT e' e sara' sempre **gratuito per tutte le scuole**. Nuove funzionalita' verranno aggiunte progressivamente per offrire un'esperienza sempre migliore a docenti e studenti.

## Funzionalita'

- **9 tipi di domanda**: scelta multipla, vero/falso, risposta aperta, ordinamento, abbinamento, trova l'errore, stima numerica, hotspot su immagine, completamento codice
- **Quiz live in tempo reale**: lobby con PIN a 6 cifre, countdown, classifica animata, podio finale
- **Modalita' test (prova quiz)**: il docente puo' giocare da solo il proprio quiz per verificarlo end-to-end prima di usarlo in classe; i risultati non vengono salvati nelle statistiche
- **Livello di confidenza**: lo studente indica quanto e' sicuro della risposta, con bonus o malus sul punteggio
- **Import da Excel**: crea quiz da file Excel, con template scaricabile e supporto AI
- **Import da Moodle**: importa quiz dal formato Moodle XML (scelta multipla, vero/falso, risposta breve, abbinamento, numerica)
- **Dashboard docente**: crea e modifica quiz, storico sessioni, statistiche avanzate
- **Statistiche**: per sessione, per quiz, per studente, per argomento, con grafici interattivi
- **Condivisione**: condividi quiz tra colleghi con permessi (visualizza/duplica/modifica)
- **Libreria pubblica**: condividi quiz pubblicamente sotto licenza Creative Commons 4.0 per altri docenti
- **Export/Import**: formato .qlz per condividere quiz tra scuole diverse, export risultati in CSV/PDF
- **Upload immagini**: carica immagini nelle domande o usa URL esterni
- **Emoticon personalizzate**: avatar custom per gli studenti (basta aggiungere PNG nella cartella `public/emoticons/`)
- **Autenticazione**: login con Google Workspace scolastico
- **Multilingua**: italiano (default) e inglese, con rilevamento automatico della lingua del browser e facile estensibilita'
- **Riconnessione giocatori**: gli studenti che cambiano app o perdono la connessione possono rientrare automaticamente entro 2 minuti
- **Gestione sessioni**: i docenti possono rientrare nelle sessioni attive e terminarle dalla dashboard; le sessioni scadono automaticamente dopo un timeout configurabile (default 2 ore)
- **Rimozione di giocatori**: durante la lobby, il docente può espellere un giocatore dalla sessione; il nickname espulso non può più rientrare in quella sessione
- **Moderazione contenuti**: sistema di segnalazione, pannello di revisione admin, sospensione quiz
- **Responsive**: interfaccia ottimizzata per LIM (docente) e telefono (studenti)

## Stack tecnologico

| Componente | Tecnologia |
|------------|-----------|
| Framework | Next.js 16 (App Router) |
| Linguaggio | TypeScript |
| UI | React 19, Tailwind CSS 4, shadcn/ui |
| Real-time | Socket.io 4 |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 |
| Autenticazione | NextAuth v5 (Google OAuth) |
| i18n | next-intl |
| Grafici | Recharts |
| Test | Vitest + Playwright |

---

## Avvio rapido

### Prerequisiti

- **Node.js 20+**
- **PostgreSQL 16** (locale o via Docker)
- **Account Google Cloud** per OAuth

### Installazione

```bash
git clone https://github.com/BaolCristian/savint.git
cd savint
npm install
```

### Configurazione

```bash
cp .env.example .env
```

Modifica `.env` con i tuoi valori. Genera il secret di NextAuth:

```bash
openssl rand -base64 32
```

### Database

```bash
# Crea le tabelle
npx prisma migrate dev

# (Opzionale) Carica dati demo
npx prisma db seed
```

Il seed crea un docente demo (`docente@scuola.it`) e un admin demo (`admin@scuola.it`) con quiz di esempio che coprono tutti i 9 tipi di domanda.

### Avvio

```bash
npm run dev:custom
```

Il server parte su **http://localhost:3000** con Socket.io integrato.

> **Nota:** usa sempre `dev:custom` e non `dev`, perche' il server custom e' necessario per Socket.io.

---

## Come funziona

### Docente

1. Accedi con Google su `/login`
2. Crea un quiz con le domande desiderate
3. (Opzionale) Clicca **Prova** per giocare il quiz da solo in modalita' test e verificare che funzioni come previsto (nessuna statistica viene salvata)
4. Clicca **Gioca** per avviare una sessione live
5. Proietta lo schermo sulla LIM — gli studenti vedono il PIN
6. Avvia il quiz e gestisci il flusso delle domande
7. A fine quiz: podio e statistiche dettagliate

### Studente

1. Apri il sito sul telefono
2. Inserisci il PIN a 6 cifre mostrato sulla LIM
3. Scegli un nickname e un avatar
4. Rispondi alle domande entro il tempo limite
5. Feedback immediato dopo ogni risposta
6. Classifica finale e podio

---

## Tipi di domanda

| Tipo | Descrizione |
|------|-------------|
| Scelta multipla | 2-6 opzioni, una o piu' corrette |
| Vero o falso | Classica domanda binaria |
| Risposta aperta | Confronto con risposte accettate |
| Ordinamento | Riordina elementi nella sequenza corretta |
| Abbinamento | Collega elementi sinistra-destra |
| Trova l'errore | Individua le righe con errori in un testo o codice |
| Stima numerica | Inserisci un numero, punteggio basato sulla vicinanza |
| Hotspot immagine | Tocca il punto corretto su un'immagine |
| Completamento codice | Completa la riga mancante (scelta multipla o testo libero) |

---

## Comandi principali

| Comando | Descrizione |
|---------|-------------|
| `npm run dev:custom` | Server di sviluppo con Socket.io |
| `npm run build` | Build di produzione |
| `npm run start:custom` | Avvia in produzione |
| `npm run test:run` | Test unitari |
| `npm run test:e2e` | Test end-to-end |
| `npx prisma studio` | GUI database |
| `npx prisma migrate dev` | Migrazioni database |
| `npx prisma db seed` | Carica dati demo |

---

## Deploy in produzione

### Con Nginx (consigliato)

SAVINT supporta il deploy sotto un subpath (es. `https://tuodominio.it/savint`) tramite Nginx come reverse proxy.

```bash
cp .env.example .env
# Configura .env con i valori di produzione
npm install
npx prisma generate
npx prisma migrate deploy
npm run build
pm2 start npm --name savint -- run start:custom
```

Configura Nginx con un blocco `location /savint` che fa proxy_pass al server Node.js. Sono necessari gli header `Upgrade` e `Connection "upgrade"` per Socket.io.

---

## Utente Admin

Il seed crea un utente admin demo con email `admin@scuola.it`. L'admin ha accesso al pannello **Admin** nella sidebar, dove puo' vedere tutti gli utenti registrati, il numero di quiz e sessioni di ciascuno.

Per promuovere un utente esistente ad admin in produzione:

```sql
UPDATE "User" SET role = 'ADMIN' WHERE email = 'tua-email@esempio.com';
```

Oppure tramite Prisma Studio:

```bash
npx prisma studio
```

| Ruolo | Descrizione |
|-------|-------------|
| `TEACHER` | Ruolo predefinito. Crea quiz, avvia sessioni, vede le proprie statistiche |
| `ADMIN` | Tutto cio' che puo' fare un docente + pannello admin con lista utenti e statistiche globali |

---

## Privacy e GDPR

SAVINT e' progettato con il principio di minimizzazione dei dati:

- **Dati studenti**: vengono memorizzati solo nickname, email opzionale e risposte al gioco. Non vengono creati account per gli studenti.
- **Cancellazione automatica**: le sessioni terminate e tutte le risposte associate vengono eliminate automaticamente dopo un periodo di conservazione configurabile (default: **365 giorni**). Questo garantisce la conformita' ai principi di conservazione dei dati del GDPR.
- **Cancellazione manuale**: i docenti possono eliminare le proprie sessioni in qualsiasi momento dalla dashboard. Gli admin possono eliminare qualsiasi sessione.
- **Configurazione**: imposta `SESSION_RETENTION_DAYS` nel file `.env` per personalizzare il periodo di conservazione (es. `180` per 6 mesi).

---

## Configurazione Google OAuth

1. Vai su [Google Cloud Console](https://console.cloud.google.com)
2. Crea un progetto e configura la schermata di consenso OAuth
3. Crea credenziali **ID client OAuth 2.0**
   - URI di reindirizzamento (dev): `http://localhost:3000/api/auth/callback/google`
   - URI di reindirizzamento (prod con subpath): `https://tuodominio.it/savint/api/auth/callback/google`
4. Copia Client ID e Client Secret nel file `.env`

---

## Licenza

SAVINT e' rilasciato sotto licenza **AGPL-3.0**. Gratuito per uso scolastico ed educativo.

---

## Una nota sulla collaborazione uomo-AI

Questo progetto e stato costruito attraverso una collaborazione tra **Cristian Virgili** e **Claude Code** (di Anthropic). Dall'architettura all'implementazione, dalla correzione dei bug al design dell'esperienza utente, ogni funzionalita e stata sviluppata attraverso un dialogo continuo tra la visione umana e le capacita dell'AI.

SAVINT e un esempio concreto di cio che diventa possibile quando un docente con un'idea chiara e un assistente AI lavorano insieme: una piattaforma completa e pronta per la produzione, realizzata in una frazione del tempo che sarebbe stato tradizionalmente necessario, senza compromessi sulla qualita.

Credo che questo tipo di collaborazione rappresenti il futuro dello sviluppo software — non l'AI che sostituisce l'uomo, ma uomini e AI che costruiscono insieme cio che nessuno dei due potrebbe realizzare da solo.
