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
| Galline | Comprale, dagli il paston, raccogli uova; se non mangiano arriva **la bolp** (volpe) |
| Pesca | Trote e salmerini nella Stella |
| Vigna | Vendemmia in autunno → torchio → vin; Sagra dal Vin lo paga doppio |
| Mercato | Vendi raccolti/uova/pesce/vino, compra semi/paston/galline |
| Restauri | Tetto, spolert nuova, ecc. — obiettivi di lungo periodo con bonus permanenti |
| Eventi | Tampieste (grandine), piena della Stella, la bolp, giornate di schiena |
| Salvataggio | Automatico a fine giornata (localStorage) |

## Roadmap

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
