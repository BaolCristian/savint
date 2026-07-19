# Labionde 👵🌾 — Game Design Document (v0.1)

> *Un gestionale cozy ambientato a Sterpo di Bertiolo (UD), Friuli Venezia Giulia.*

## Pitch

**La bionde**, 82 anni, contadina tosta della Bassa friulana, gestisce da sola la sua
casa di campagna a **Sterpo di Bertiolo** (frazione di ~25 abitanti sul fiume Stella).
Si semina, si raccoglie, si taglia la legna, si soffia sulla brace della *spolert*,
si sopravvive all'inverno. Ritmo lento, stagionale, giocabile per centinaia di
giornate di gioco. Tono: **cozy realistico con punte comiche** — la bionde commenta
tutto in friulano (con sottotitoli in italiano).

## Ambientazione (tutta vera)

- **Fiume Stella e risorgive** — le acque riaffiorano dal terreno ghiaioso; i campi
  vicino alla Stella crescono più in fretta ma rischiano la **piena** in autunno.
- **Le trote** — a Sterpo c'è un vero allevamento (trota iridea, salmerino): si pesca.
- **La Farnia** — la quercia più vecchia d'Italia (~500-600 anni) accanto a Villa
  Colloredo Venier (l'ex Castello di Sterpo, saccheggiato nel 1509). Una passeggiata
  fino alla Farnia ridà energia alla bionde, una volta al giorno.
- **Il vino** — Bertiolo è "Città del Vino": vigna, vendemmia, e la **Sagra dal Vin**
  in primavera dove il vino si vende al doppio.
- **Colture della Bassa**: forment (frumento), blave (mais), fasûi, coce (zucca),
  radric (radicchio), verze.

## La bionde (dal vero)

Riferimenti visivi e caratteriali presi dalle foto di famiglia (non incluse nel
repo per riservatezza — l'avatar nel gioco è un ritratto SVG stilizzato):

- Capelli bianchi corti, occhi chiari, sorriso furbo.
- **Occhiali da sole da aviatore** — sempre, anche col cappuccio della giacca.
- **Giacchetta nera imbottita** (piumino) e pantaloni neri, **sneakers nere**.
- **Crocetta d'oro** con la catenina al collo.
- Le piacciono le **gite**: Trieste (Piazza Unità, caffè e bora) e Grado
  (bagno, sardine e gelato) → nel gioco sono eventi che danno +1 energia massima
  per quella giornata, e nei giorni di gita la schiena non fa mai male.

## Il borgo (dalle foto di Via Piave)

Luoghi veri di Sterpo documentati dalle foto (Street View di Via Piave), usati
nella veduta SVG in testa al gioco e nelle scenette del "zîr pal borc":

- La **cort**: la lunga schiera di case coloniche ocra e gialle con i tetti in
  coppi, gli **androni** ad arco e il **portico** con le colonne.
- La **casa rossa** con le cornici bianche, gli scuri verdi e il lampione in
  ferro battuto.
- La **torretta sul bivio** col muro di ciottoli di fiume coperto d'edera.
- La **fontana di sassi** con le due vasche a cascata, nel bosco delle risorgive.
- La **panchina semicircolare di claps** col vialetto in pietra.
- La **bacheca del paese** e... le buche di Via Piave.
- Il **mulino con la ruota di legno** ancora al suo posto sulla roggia (ecco
  perché "Roie dai Mulins") → nel gioco si porta la blave a macinare:
  2 mais → 3 farine di polenta.
- Il **ponte di pietra sulla Stella**, con l'acqua verde scura di risorgiva.
- Il **cancello in ferro della villa** in fondo al viale coi lampioni, e il
  grande albero con la targhetta accanto all'ingresso (la Farnia).
- La strada che esce dal paese in **galleria d'alberi**, e il cortile rustico
  con la betoniera d'epoca.

## La protagonista come meccanica

L'età non è un dettaglio, è il design:

- **Energia limitata** al giorno (base 10). Ogni azione costa energia.
- **Pisolino** pomeridiano: +3 energia, una volta al giorno.
- **Cafè** della moka: +2 energia, max 2 al giorno, costa qualche euro.
- Giornate di **"schene a tocs"** (schiena a pezzi): partenza con -2 energia.
  La **sgnape** (grappa) la sistema.
- D'inverno se manca la legna la casa gela → il giorno dopo si parte stanchi.

## Core loop giornaliero

1. Sveglia col gallo → meteo del giorno (soreli / ploie / brome / gelo / tampieste).
2. D'inverno: **soflâ sul fûc** per accendere la spolert (+1 energia, consuma legna).
3. Spendi l'energia: semina, raccogli, taglia/spacca legna, pesca, galline, vigna,
   mercato, passeggiata alla Farnia.
4. **Fin de zornade** → i campi crescono, le galline mangiano e fanno uova,
   l'inverno consuma la catasta, eventi casuali, nuovo meteo, salvataggio.

## Sistemi (v0.1 — già nel prototipo)

| Sistema | Dettagli |
|---|---|
| Stagioni | Primevere / Istât / Autun / Unvier, 28 giorni l'una |
| Campi | 12 campi, gli ultimi 4 "dongje la Stele" (crescita +, rischio piena) |
| Colture | 6 colture stagionali, con semi da comprare al mercato |
| Legna | Taglia (ciocchi) → spacca (legna) → catasta; l'inverno ne consuma 2-3/giorno |
| Galline | Comprale, dagli il paston, raccogli uova (1 volta al giorno); se non mangiano arriva **la bolp** (volpe) |
| Stalla | La **vacje** "Stele" (2 paston/dì → 2 latte), il **purcit** da ingrassare fino a 15 e poi, solo d'inverno come da tradizione, "fâ sù il purcit" → 6 salami. Le **arnie** (max 3) fanno miele gratis nelle stagioni calde |
| Intercalari | La bionde "bestemmia" a modo suo — esclamazioni innocue sparate nei momenti di sorpresa o disastro: *Par mil bucefais!*, *Sante Galine!*, *Beât idraulic!*, *Barbe cantant!* (zio cantante — *barbe* = zio in friulano), *Sacrabolt!*, *Ostrighe di Maran!*, *Sante polente fumante!*... |
| Pesca | **Tre corsi d'acqua veri**: il fiume Stella (trote, salmerini e la rara trota marmorata), la roggia Patisce (cavedani, tinche, gamberi di fiume) e la roggia dei Mulini (anguille, tinche, lucci) — si sceglie dove pescare |
| Alberi | Il **morâr** (gelso, more a maggio-giugno) e il **fiâr** (fico, agosto-settembre): finestre di maturazione vere, raccolta una volta al giorno |
| **Tempo vero** | Modalità "Timp vêr di vite": una giornata di gioco = una giornata VERA. Stagioni dal calendario, colture coi tempi reali (mais 120 giorni, frumento 100, fagioli 60...), Sagra dal Vin a metà marzo come quella vera di Bertiolo, gelsi e fichi nei mesi giusti. Se stai via, il cortile va avanti da solo (recupero automatico fino a 120 giorni: la volpe, la catasta e i campi non ti aspettano). Attivabile/disattivabile in gioco |
| Multilingua | Voce in **friulano** (è l'anima del gioco), sottotitoli commutabili **italiano/inglese** (le righe non ancora tradotte ricadono sull'italiano) |
| Vigna | Vendemmia in autunno → torchio → vin; Sagra dal Vin lo paga doppio |
| Mercato | Vendi raccolti/uova/pesce/vino, compra semi/paston/galline |
| Restauri | Tetto, spolert nuova, ecc. — obiettivi di lungo periodo con bonus permanenti |
| Eventi | Tampieste (grandine), temporali, piena della Stella, la bolp, giornate di schiena, gite a Grado e Trieste |
| **Meteo vero** | Il cielo del gioco è quello VERO di Sterpo (Open-Meteo, coordinate 45.906N 13.079E, nessuna chiave API): condizioni + temperature dei prossimi 7 giorni reali. Con 2 settimane vere quasi senza pioggia e caldo scatta la **secjade** (siccità): i campi lontani dalla Stella non crescono se non annaffiati — quelli sul fiume si salvano con le risorgive. Neve e gelo veri fanno consumare più legna. Disattivabile in gioco; se offline, fallback al meteo simulato. |
| Salvataggio | Automatico a fine giornata (localStorage) |

## Roadmap

- **PROSSIMO PASSO (concordato)** — **v0.7: mappa 2D dall'alto**. Sterpo vista
  dall'alto (canvas), con uno sprite della bionde che cammina per il borgo:
  la sua casa col cortile, i campi, la stalla, il mulino con la ruota, il ponte
  sulla Stella, la fontana di claps, la corte, la villa col cancello, la Farnia.
  Le azioni si fanno andando fisicamente nei posti (al mulino si macina, al
  fiume si pesca...). Sprite della bionde fedele alle foto: capelli bianchi,
  aviatori, piumino nero, scarpe nere.

- **v0.2** — suoni, più eventi (sagra giocabile, vicini di Sterpo, la messa, il mercato
  di Bertiolo), ricette friulane (frico, brovada e muset) cucinabili coi raccolti.
- **v0.3** — grafica vera (tile art da foto di Sterpo), mappa del paese, la Farnia
  come "albero da accudire" con una storyline sui suoi 600 anni.
- **v0.4** — achievement/prestigio, decorazione della casa, animali grandi (mucca, maiale
  → purcit di Nadâl), modalità "vita lunga" con anni che passano.

## Come si gioca (prototipo)

Aprire `labionde/index.html` nel browser — è un file autonomo, senza build:

```bash
npx serve labionde   # oppure doppio click su index.html
```
