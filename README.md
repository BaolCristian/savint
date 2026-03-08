# Quiz Live

Piattaforma di quiz live per la scuola. Il docente crea quiz, li proietta sulla LIM e gli studenti rispondono in tempo reale dal telefono.

## Funzionalita

- **5 tipi di domanda**: scelta multipla, vero/falso, risposta aperta, ordinamento, abbinamento
- **Quiz live in tempo reale**: lobby con PIN a 6 cifre, countdown, classifica animata, podio finale
- **Dashboard docente**: crea/modifica quiz, storico sessioni, statistiche avanzate
- **Statistiche**: per sessione, per quiz, per studente, per argomento, con grafici
- **Condivisione**: condividi quiz tra docenti con permessi (visualizza/duplica/modifica)
- **Export**: scarica risultati in CSV o PDF
- **Autenticazione**: login con Google Workspace scolastico
- **Responsive**: sidebar mobile, interfaccia ottimizzata per telefono (studenti)

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
| Grafici | Recharts |
| Test | Vitest + Playwright |
| Deploy | Docker Compose |

## Avvio rapido (sviluppo locale)

### Prerequisiti

- **Node.js 20+** - [download](https://nodejs.org)
- **Docker Desktop** - [download](https://www.docker.com/products/docker-desktop) - serve per PostgreSQL
- **Account Google Cloud** per OAuth (vedi sezione dedicata)

### 1. Clona e installa

```bash
git clone <url-del-repo>
cd quizlive
npm install
```

### 2. Avvia PostgreSQL

```bash
docker compose -f docker-compose.dev.yml up -d
```

Verifica che il container sia attivo:

```bash
docker compose -f docker-compose.dev.yml ps
```

### 3. Configura le variabili d'ambiente

```bash
cp .env.example .env
```

Modifica `.env` con i tuoi valori. Per lo sviluppo locale il database e gia configurato. Devi solo aggiungere le credenziali Google OAuth (vedi sotto) e generare il secret:

```bash
# Genera NEXTAUTH_SECRET
openssl rand -base64 32
```

Il file `.env` dovra contenere:

```
DATABASE_URL=postgresql://quizlive:quizlive@localhost:5432/quizlive
GOOGLE_CLIENT_ID=il-tuo-client-id
GOOGLE_CLIENT_SECRET=il-tuo-client-secret
NEXTAUTH_SECRET=il-secret-generato-sopra
NEXTAUTH_URL=http://localhost:3000
```

### 4. Inizializza il database

```bash
# Crea le tabelle
npx prisma migrate dev --name init

# (Opzionale) Carica dati demo
npx prisma db seed
```

Il seed crea un docente demo (`docente@scuola.it`) con due quiz di esempio (Geografia e Scienze) che coprono tutti e 5 i tipi di domanda.

### 5. Avvia il server di sviluppo

```bash
npm run dev:custom
```

Il server parte su **http://localhost:3000** con Socket.io integrato.

> **Importante:** usa `dev:custom` e non `dev`, perche il server custom e necessario per far funzionare Socket.io (quiz in tempo reale).

### 6. Apri nel browser

| URL | Cosa vedi |
|-----|-----------|
| http://localhost:3000 | Pagina studente - inserisci PIN per entrare in un quiz |
| http://localhost:3000/login | Login docente con Google |
| http://localhost:3000/dashboard | Dashboard docente (richiede login) |

## Configurazione Google OAuth

### Per sviluppo locale

1. Vai su [Google Cloud Console](https://console.cloud.google.com)
2. Crea un nuovo progetto (o usa uno esistente)
3. Vai su **API e servizi** > **Schermata di consenso OAuth**
   - Tipo: Esterno (o Interno se hai Google Workspace)
   - Compila nome app e email di supporto
4. Vai su **API e servizi** > **Credenziali**
5. Clicca **Crea credenziali** > **ID client OAuth 2.0**
   - Tipo applicazione: **Applicazione web**
   - Nome: Quiz Live
   - Origini JavaScript autorizzate: `http://localhost:3000`
   - URI di reindirizzamento autorizzati: `http://localhost:3000/api/auth/callback/google`
6. Copia **Client ID** e **Client Secret** nel file `.env`

### Per produzione

Stessi passaggi, ma con il dominio reale:
- Origini: `https://quiz.tuascuola.it`
- Redirect: `https://quiz.tuascuola.it/api/auth/callback/google`

## Come funziona

### Flusso del docente

1. Accedi con Google su `/login`
2. Vai su **I miei Quiz** > **Nuovo Quiz**
3. Crea le domande (tutti e 5 i tipi disponibili)
4. Salva il quiz
5. Dalla lista quiz, clicca **Gioca** per avviare una sessione live
6. Proietta lo schermo sulla LIM - gli studenti vedono il PIN
7. Quando tutti sono connessi, clicca **Avvia Quiz**
8. Dopo ogni domanda: mostra risultati, poi prosegui
9. A fine quiz: podio con i vincitori
10. Vai su **Sessioni** per rivedere risultati e statistiche

### Flusso dello studente

1. Apri il sito sul telefono (pagina principale)
2. Inserisci il PIN a 6 cifre mostrato sulla LIM
3. Inserisci il tuo nome
4. Rispondi alle domande entro il tempo limite
5. Dopo ogni risposta: feedback immediato (corretto/sbagliato, punti, posizione)
6. A fine quiz: classifica finale e podio

## Struttura del progetto

```
quizlive/
  docker-compose.yml          # Produzione (app + db)
  docker-compose.dev.yml      # Sviluppo (solo db)
  Dockerfile                  # Build produzione multi-stage
  prisma/
    schema.prisma             # Schema database
    seed.ts                   # Dati demo
  src/
    server.ts                 # Server custom (Next.js + Socket.io)
    app/
      page.tsx                # Landing (PIN entry per studenti)
      (auth)/login/           # Login Google
      (dashboard)/dashboard/  # Area docente
        page.tsx              #   Home con statistiche rapide
        quiz/                 #   CRUD quiz
        sessions/             #   Storico e dettaglio sessioni
        stats/                #   Statistiche globali, studenti, argomenti
        share/                #   Gestione condivisioni
      (live)/                 # Quiz live
        live/host/            #   Schermo docente (LIM)
        play/                 #   Schermo studente (telefono)
      api/
        auth/                 #   NextAuth endpoints
        quiz/                 #   CRUD quiz + condivisione
        session/              #   Creazione sessioni con PIN
        stats/export/         #   Export CSV/PDF
    components/
      quiz/                   # Editor quiz e domande
      live/                   # Host view e player view
      dashboard/              # Sidebar navigazione
      stats/                  # Grafici (Recharts)
      ui/                     # Componenti shadcn/ui
    lib/
      auth/config.ts          # Configurazione NextAuth
      db/client.ts            # Prisma client singleton
      socket/server.ts        # Gestione Socket.io lato server
      socket/client.ts        # Hook useSocket() lato client
      scoring.ts              # Calcolo punteggi e verifica risposte
      validators/             # Schema Zod per validazione
    types/
      index.ts                # Tipi condivisi (eventi Socket.io, opzioni domande)
  tests/
    unit/                     # Test unitari (Vitest)
    e2e/                      # Test E2E (Playwright)
```

## Comandi disponibili

| Comando | Descrizione |
|---------|-------------|
| `npm run dev:custom` | Avvia server di sviluppo con Socket.io |
| `npm run build` | Build di produzione |
| `npm run start:custom` | Avvia in produzione con Socket.io |
| `npm run test:run` | Esegui test unitari |
| `npm run test` | Test unitari in watch mode |
| `npm run test:e2e` | Test E2E con Playwright |
| `npm run lint` | Linting con ESLint |
| `npx prisma studio` | GUI per esplorare il database |
| `npx prisma migrate dev` | Crea e applica migrazioni |
| `npx prisma db seed` | Carica dati demo |

## Deploy in produzione (server della scuola)

### Requisiti server

- Qualsiasi PC con almeno 4GB RAM e 20GB disco
- Docker e Docker Compose installati
- Porta 3000 accessibile dalla rete scolastica (o porta 443 con reverse proxy)

### Procedura

#### 1. Clona il repository sul server

```bash
git clone <url-del-repo>
cd quizlive
```

#### 2. Crea il file `.env`

```bash
cp .env.example .env
nano .env
```

Configura tutti i valori:

```
DATABASE_URL=postgresql://quizlive:UNA_PASSWORD_SICURA@db:5432/quizlive
DB_PASSWORD=UNA_PASSWORD_SICURA
GOOGLE_CLIENT_ID=il-tuo-client-id
GOOGLE_CLIENT_SECRET=il-tuo-client-secret
NEXTAUTH_SECRET=genera-con-openssl-rand-base64-32
NEXTAUTH_URL=https://quiz.tuascuola.it
```

Per generare `NEXTAUTH_SECRET`:

```bash
openssl rand -base64 32
```

#### 3. Avvia con Docker Compose

```bash
docker compose up -d
```

Questo comando:
- Scarica l'immagine PostgreSQL
- Builda l'applicazione Next.js (multi-stage, circa 2-3 minuti la prima volta)
- Avvia entrambi i container

#### 4. Inizializza il database (solo la prima volta)

```bash
# Applica lo schema al database
docker compose exec app npx prisma migrate deploy

# (Opzionale) Carica quiz di esempio
docker compose exec app npx prisma db seed
```

#### 5. Verifica

```bash
# Controlla che i container siano attivi
docker compose ps

# Testa la connessione
curl http://localhost:3000
```

### HTTPS con Caddy (consigliato)

Per servire il sito su HTTPS con certificato SSL automatico:

```bash
# Installa Caddy
sudo apt install -y caddy

# Configura il reverse proxy
sudo tee /etc/caddy/Caddyfile << 'EOF'
quiz.tuascuola.it {
    reverse_proxy localhost:3000
}
EOF

# Riavvia Caddy
sudo systemctl restart caddy
```

Caddy ottiene e rinnova automaticamente i certificati SSL tramite Let's Encrypt. Assicurati che il dominio punti all'IP del server e che le porte 80 e 443 siano aperte.

### Aggiornamenti

```bash
cd quizlive
git pull
docker compose build
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

### Backup del database

```bash
# Crea backup
docker compose exec db pg_dump -U quizlive quizlive > backup_$(date +%Y%m%d).sql

# Ripristina da backup
cat backup.sql | docker compose exec -T db psql -U quizlive quizlive
```

## Sistema di punteggio

Il punteggio di ogni risposta corretta dipende dalla velocita:

```
punteggio = punti_base x (1.0 - tempo_impiegato / tempo_limite x 0.5)
```

| Velocita | Punti (su 1000) |
|----------|----------------|
| Istantanea | 1000 |
| Meta del tempo | 750 |
| Al limite | 500 |
| Sbagliata | 0 |

## Risoluzione problemi

| Problema | Soluzione |
|----------|----------|
| "Cannot connect to database" | Verifica che il container db sia attivo: `docker compose ps` |
| Google login non funziona | Controlla che l'URL di callback in Google Console corrisponda a `NEXTAUTH_URL/api/auth/callback/google` |
| Studenti non riescono a connettersi | Verifica che la porta 3000 sia raggiungibile dalla rete WiFi della scuola |
| Socket.io non funziona | Assicurati di usare `npm run dev:custom` e non `npm run dev` |
| Errori dopo un aggiornamento | Esegui `npx prisma migrate deploy` per applicare nuove migrazioni |

## Licenza

Uso interno scolastico.
