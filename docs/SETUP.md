# Guida all'installazione - Quiz Live

Questa guida e pensata per il tecnico IT della scuola che deve installare e configurare Quiz Live sul server scolastico.

## Indice

1. [Prerequisiti](#1-prerequisiti)
2. [Configurazione Google OAuth](#2-configurazione-google-oauth)
3. [Configurazione Pixabay (ricerca immagini)](#3-configurazione-pixabay-ricerca-immagini)
4. [Installazione sul server](#4-installazione-sul-server)
5. [Primo avvio](#5-primo-avvio)
6. [Configurazione HTTPS](#6-configurazione-https)
7. [Gestione quotidiana](#7-gestione-quotidiana)
8. [Backup e ripristino](#8-backup-e-ripristino)
9. [Aggiornamenti](#9-aggiornamenti)
10. [Risoluzione problemi](#10-risoluzione-problemi)

---

## 1. Prerequisiti

### Hardware

- Qualsiasi PC dedicato (anche vecchio) con almeno:
  - 4 GB di RAM
  - 20 GB di spazio disco
  - Connessione alla rete scolastica
- Il PC deve restare acceso durante l'orario scolastico

### Software

- **Sistema operativo**: Linux (Ubuntu 22.04+ consigliato), macOS, o Windows con WSL2
- **Docker**: versione 24+ con Docker Compose v2
- **Git**: per scaricare e aggiornare il codice

### Rete

- Il server deve essere raggiungibile dalla rete WiFi della scuola sulla porta 3000 (o 443 se si usa HTTPS)
- (Opzionale) Un dominio tipo `quiz.nomescuola.it` che punta all'IP del server

### Installare Docker su Ubuntu

```bash
# Aggiorna i pacchetti
sudo apt update && sudo apt upgrade -y

# Installa Docker
curl -fsSL https://get.docker.com | sudo sh

# Aggiungi il tuo utente al gruppo docker (evita di usare sudo)
sudo usermod -aG docker $USER

# Riavvia la sessione
logout
# poi rientra

# Verifica
docker --version
docker compose version
```

---

## 2. Configurazione Google OAuth

Quiz Live usa Google per l'autenticazione dei docenti. Serve un progetto su Google Cloud Console.

### Passo per passo

1. Vai su https://console.cloud.google.com
2. In alto, clicca sul selettore progetti e poi **Nuovo progetto**
   - Nome: `Quiz Live Scuola`
   - Clicca **Crea**
3. Seleziona il progetto appena creato
4. Nel menu laterale, vai su **API e servizi** > **Schermata di consenso OAuth**
   - Tipo di utente: **Interno** (se la scuola usa Google Workspace) oppure **Esterno**
   - Nome app: `Quiz Live`
   - Email assistenza utenti: email del responsabile IT
   - Dominio autorizzato: `tuascuola.it` (o il dominio del server)
   - Clicca **Salva e continua** fino alla fine
5. Nel menu laterale, vai su **API e servizi** > **Credenziali**
6. Clicca **+ Crea credenziali** > **ID client OAuth 2.0**
   - Tipo di applicazione: **Applicazione web**
   - Nome: `Quiz Live`
   - **Origini JavaScript autorizzate**: aggiungi `https://quiz.tuascuola.it` (il dominio del server)
   - **URI di reindirizzamento autorizzati**: aggiungi `https://quiz.tuascuola.it/api/auth/callback/google`
   - Clicca **Crea**
7. Copia il **Client ID** e il **Client Secret** — ti serviranno nel passo successivo

> Se non hai un dominio, usa `http://INDIRIZZO-IP-SERVER:3000` come origine e `http://INDIRIZZO-IP-SERVER:3000/api/auth/callback/google` come redirect.

---

## 3. Configurazione Pixabay (ricerca immagini)

Quiz Live permette ai docenti di cercare immagini gratuite da Pixabay direttamente nell'editor delle domande. Questa funzionalita e opzionale ma consigliata.

### Passo per passo

1. Vai su https://pixabay.com/api/docs/ e clicca **Get Started** (o registrati su https://pixabay.com se non hai un account)
2. Una volta loggato, la tua **API Key** viene mostrata nella pagina della documentazione API
3. Copia la chiave e incollala nel file `.env`:

```bash
PIXABAY_API_KEY=la-tua-chiave-api
```

> La chiave Pixabay e gratuita e permette fino a 5.000 richieste al giorno, piu che sufficienti per l'uso scolastico. Le immagini restituite sono tutte libere da copyright (licenza Pixabay).

---

## 4. Installazione sul server

### Scarica il codice

```bash
cd /opt
sudo git clone <url-del-repo> quizlive
sudo chown -R $USER:$USER /opt/quizlive
cd /opt/quizlive
```

### Configura le variabili d'ambiente

```bash
cp .env.example .env
nano .env
```

Compila il file `.env`:

```bash
# Database — cambia la password!
DATABASE_URL=postgresql://quizlive:CAMBIA_QUESTA_PASSWORD@db:5432/quizlive
DB_PASSWORD=CAMBIA_QUESTA_PASSWORD

# Google OAuth — incolla i valori dal passo 2
GOOGLE_CLIENT_ID=123456789-xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# Segreto per le sessioni — genera con il comando sotto
NEXTAUTH_SECRET=

# URL del sito — cambia con il tuo dominio
NEXTAUTH_URL=https://quiz.tuascuola.it

# Pixabay — ricerca immagini nell'editor (opzionale, vedi passo 3)
PIXABAY_API_KEY=la-tua-chiave-pixabay
```

Genera il segreto per le sessioni:

```bash
openssl rand -base64 32
```

Copia il risultato e incollalo come valore di `NEXTAUTH_SECRET`.

---

## 5. Primo avvio

### Avvia i container

```bash
cd /opt/quizlive
docker compose up -d
```

La prima volta ci vogliono 2-3 minuti per:
- Scaricare l'immagine PostgreSQL
- Buildare l'applicazione Next.js
- Avviare tutto

### Verifica che funzionino

```bash
docker compose ps
```

Devi vedere due container con stato `Up`:
- `quizlive-app-1` (l'applicazione)
- `quizlive-db-1` (il database)

### Inizializza il database

```bash
# Crea le tabelle
docker compose exec app npx prisma migrate deploy

# Carica i quiz di esempio (opzionale)
docker compose exec app npx prisma db seed
```

### Testa

```bash
curl http://localhost:3000
```

Se ricevi HTML, funziona. Apri il browser su `http://INDIRIZZO-IP-SERVER:3000`.

---

## 6. Configurazione HTTPS

HTTPS e fortemente consigliato (Google OAuth potrebbe richiederlo in produzione).

### Con Caddy (il modo piu semplice)

Caddy e un web server che ottiene e rinnova automaticamente i certificati SSL.

```bash
# Installa Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

Configura il reverse proxy:

```bash
sudo tee /etc/caddy/Caddyfile << 'EOF'
quiz.tuascuola.it {
    reverse_proxy localhost:3000
}
EOF

sudo systemctl restart caddy
sudo systemctl enable caddy
```

Prerequisiti:
- Il dominio `quiz.tuascuola.it` deve puntare all'IP pubblico del server (record DNS A)
- Le porte 80 e 443 devono essere aperte sul firewall

### Con nginx (alternativa)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx

sudo tee /etc/nginx/sites-available/quiz << 'EOF'
server {
    server_name quiz.tuascuola.it;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/quiz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl restart nginx

# Ottieni certificato SSL
sudo certbot --nginx -d quiz.tuascuola.it
```

> Le righe `Upgrade` e `Connection` sono essenziali per Socket.io (WebSocket).

---

## 7. Gestione quotidiana

### Controllare lo stato

```bash
cd /opt/quizlive
docker compose ps          # Stato dei container
docker compose logs -f app # Log dell'applicazione (Ctrl+C per uscire)
docker compose logs -f db  # Log del database
```

### Riavviare

```bash
docker compose restart     # Riavvia tutto
docker compose restart app # Riavvia solo l'app
```

### Fermare

```bash
docker compose stop        # Ferma (mantiene i dati)
docker compose down        # Ferma e rimuove i container (i dati nel volume restano)
```

### Avvio automatico al boot

Docker Compose con `restart: always` riavvia automaticamente i container dopo un reboot del server. Verifica che Docker si avvii al boot:

```bash
sudo systemctl enable docker
```

### Esplorare il database

Per ispezionare i dati direttamente:

```bash
# Prisma Studio (GUI web sulla porta 5555)
docker compose exec app npx prisma studio

# Oppure da linea di comando
docker compose exec db psql -U quizlive quizlive
```

---

## 8. Backup e ripristino

### Backup manuale

```bash
# Crea un backup
docker compose exec db pg_dump -U quizlive quizlive > backup_$(date +%Y%m%d_%H%M).sql

# Verifica che il file non sia vuoto
ls -lh backup_*.sql
```

### Backup automatico (cron)

```bash
# Apri il crontab
crontab -e

# Aggiungi questa riga per un backup giornaliero alle 2 di notte
0 2 * * * cd /opt/quizlive && docker compose exec -T db pg_dump -U quizlive quizlive > /opt/quizlive/backups/backup_$(date +\%Y\%m\%d).sql 2>/dev/null

# Crea la cartella backups
mkdir -p /opt/quizlive/backups
```

### Ripristino

```bash
# Ferma l'app per sicurezza
docker compose stop app

# Ripristina il backup
cat backup_20260307.sql | docker compose exec -T db psql -U quizlive quizlive

# Riavvia
docker compose start app
```

---

## 9. Aggiornamenti

Quando viene rilasciata una nuova versione:

```bash
cd /opt/quizlive

# Scarica gli aggiornamenti
git pull

# Ricostruisci e riavvia
docker compose build
docker compose up -d

# Applica eventuali modifiche al database
docker compose exec app npx prisma migrate deploy
```

L'operazione richiede 2-3 minuti. Durante il build il sito resta online con la versione precedente; viene aggiornato solo al riavvio del container.

---

## 10. Risoluzione problemi

### Il sito non si apre

```bash
# Verifica che i container siano attivi
docker compose ps

# Se sono fermi, guarda i log per capire l'errore
docker compose logs app
docker compose logs db

# Riavvia
docker compose up -d
```

### "Cannot connect to database"

```bash
# Verifica che il container db sia attivo
docker compose ps db

# Verifica la connessione
docker compose exec db pg_isready -U quizlive

# Se il volume e corrotto, ricrea (ATTENZIONE: perdi i dati!)
# Fai prima un backup se possibile
docker compose down -v
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

### Google login non funziona

1. Controlla che `NEXTAUTH_URL` nel `.env` corrisponda all'URL che usi nel browser
2. Controlla che l'URI di redirect in Google Console sia esattamente: `{NEXTAUTH_URL}/api/auth/callback/google`
3. Controlla che `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` siano corretti
4. Controlla i log: `docker compose logs app | grep -i auth`

### Studenti non riescono a connettersi

1. Verifica che il telefono sia sulla stessa rete WiFi del server
2. Prova ad aprire `http://INDIRIZZO-IP-SERVER:3000` dal telefono
3. Se usi un firewall, apri la porta 3000 (o 443 con HTTPS)
4. Verifica che il DNS del dominio punti all'IP corretto

### Il quiz live non funziona (Socket.io)

1. Se usi nginx come reverse proxy, assicurati che le intestazioni WebSocket siano configurate (vedi sezione HTTPS)
2. Verifica che il server sia avviato con `dev:custom` (sviluppo) o tramite Docker (produzione)
3. Controlla i log: `docker compose logs app | grep -i socket`

### Dopo un aggiornamento qualcosa non funziona

```bash
# Ricostruisci da zero
docker compose down
docker compose build --no-cache
docker compose up -d
docker compose exec app npx prisma migrate deploy
```

### Spazio disco pieno

```bash
# Pulisci le immagini Docker vecchie
docker system prune -af

# Pulisci i backup vecchi
find /opt/quizlive/backups -name "*.sql" -mtime +30 -delete
```
