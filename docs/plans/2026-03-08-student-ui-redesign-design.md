# Design: Interfaccia Studente - Giovane, Moderna e Divertente

Data: 2026-03-08

## Panoramica

Ridisegnare l'interfaccia studente di Quiz Live per renderla vivace, colorata e divertente. Aggiungere avatar emoji, gradienti bold, micro-animazioni e effetti speciali (confetti/vibrazione).

## Avatar Emoji

- ~55 emoji organizzate in 4 categorie:
  - Faccine (15): grinning, laughing, heart_eyes, sunglasses, thinking, nerd, zany, party, star_struck, shushing, monocle, exploding_head, ghost, alien, robot
  - Animali (15): dog, cat, fox, unicorn, bear, panda, koala, tiger, lion, frog, monkey, penguin, owl, butterfly, octopus
  - Cibo (12): pizza, burger, taco, sushi, ice_cream, donut, cookie, watermelon, avocado, popcorn, cake, chocolate
  - Sport/Oggetti (13): soccer, basketball, football, tennis, guitar, gamepad, rocket, rainbow, lightning, fire, star, diamond, crown
- Griglia scrollabile 5 colonne nel form di join, sotto il campo nome
- Emoji selezionata con ring colorato e scala leggermente piu grande
- Selezione casuale di default quando lo studente apre la pagina
- Avatar inviato nel joinSession event come `playerAvatar: string`

## Stile Visivo

### Palette

- Join: gradiente `from-purple-600 via-pink-500 to-orange-400`
- Question: sfondo `bg-gray-950` con accenti gradiente sui bottoni
- Feedback corretto: `from-emerald-400 to-green-600`
- Feedback sbagliato: `from-red-400 to-rose-600`
- Podio: `from-amber-400 via-orange-500 to-pink-500`

### Componenti

- Bordi: `rounded-2xl` ovunque
- Ombre: colorate e sfumate (`shadow-lg shadow-purple-500/25`)
- Bottoni: gradienti con hover:scale-105, active:scale-95
- Glass effect: `bg-white/10 backdrop-blur-md` per card overlay

### Bottoni risposta

- MULTIPLE_CHOICE: 4 bottoni gradiente (rosso, blu, giallo, verde) piu grandi, rounded-2xl
- TRUE_FALSE: due bottoni full-height con gradienti verde/rosso
- Tutti con hover:scale-105 e active:scale-95

## Effetti Speciali

### Confetti (risposta corretta)

- CSS puro: 30 particelle colorate che cadono dall'alto
- Durata: 1.5s
- Colori: mix di rosa, giallo, verde, blu, viola
- Implementazione: pseudo-elementi o span animati con keyframes random-ish (posizioni X distribuite, velocita leggermente diverse)

### Vibrazione (risposta sbagliata)

- `navigator.vibrate(200)` (supportato su Android, ignorato su iOS/desktop)
- Shake animation CSS sul container: traslazione X rapida per 0.5s

### Micro-animazioni

- Avatar bounce lento nella fase waiting (1.5s infinite ease-in-out)
- Pulse sull'emoji selezionata nel picker
- Slide-up-fade migliorato con spring-like easing
- Score counter che "conta su" da 0 al punteggio ottenuto

## Fasi Ridisegnate

### Join

- Gradiente viola/rosa/arancio come sfondo
- Titolo "Quiz Live" con testo piu grande e text-shadow leggero
- Campo PIN e Nome con sfondo glass (white/20 backdrop-blur)
- Emoji picker: griglia 5 colonne con tabs per categoria
- Bottone "Entra" con gradiente e shadow colorata

### Waiting

- Sfondo gradiente viola/rosa
- Avatar emoji grande (text-8xl) con animazione bounce
- Nome dello studente sotto
- Messaggio "In attesa..." con pulsini animati (...)

### Question

- Sfondo molto scuro (gray-950)
- Timer con gradiente rosso quando sotto i 5 secondi
- Testo domanda bianco, grande
- Bottoni risposta con gradienti, piu grandi, rounded-2xl
- Stato "inviato" con avatar e messaggio

### Feedback

- Corretto: sfondo gradiente verde, confetti che cadono, checkmark bounce grande, "+X punti" che scala su
- Sbagliato: sfondo gradiente rosso, shake del container, vibrazione device, cross con bounce
- In entrambi: avatar mostrato, posizione in classifica, percentuale classe

### Podio

- Gradiente arancio/rosa caldo
- Top 3 con avatar emoji grandi (text-5xl) accanto al nome
- Medaglie emoji piu grandi
- Animazione rise migliorata con bounce
- Card glass effect (white/15 backdrop-blur)
- Classifica completa sotto con avatar piccoli

## Impatto Tecnico

### Socket.io Events

Aggiungere `playerAvatar: string` a:
- Client->Server: `joinSession` (aggiungere campo)
- Server->Client: `playerJoined` (propagare avatar)
- Server->Client: `gameOver` (includere avatar nel podium/fullResults)

### File da modificare

| File | Modifica |
|------|----------|
| src/types/index.ts | Aggiungere playerAvatar ai tipi eventi |
| src/lib/socket/server.ts | Propagare avatar nei risultati |
| src/components/live/player-view.tsx | Ridisegno completo dell'interfaccia |
| src/components/live/host-view.tsx | Mostrare avatar nella lobby |
| src/app/globals.css | Aggiungere animazioni confetti, shake, bounce |

### File da creare

| File | Contenuto |
|------|-----------|
| src/lib/emoji-avatars.ts | Lista emoji organizzata per categoria |

### Nessuna modifica al DB

L'avatar e solo nella sessione live (in memoria via Socket.io), non viene persistito nel database.

### Nessuna nuova dipendenza

Confetti, shake e tutte le animazioni sono in CSS puro.
