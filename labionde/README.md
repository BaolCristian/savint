# Labionde 👵🌾

Gestionale cozy ambientato a **Sterpo di Bertiolo (UD)**: la bionde, 82 anni,
manda avanti la sua casa di campagna tra campi, stalla, mulino, rogge e il
fiume Stella. Meteo vero, tempo vero, friulano coi sottotitoli.

## Come si gioca

Il gioco è **un solo file**: `index.html`. Si apre nel browser e basta —
niente da installare, funziona anche offline (senza meteo vero).

```bash
# in locale, dopo aver scaricato la cartella:
doppio click su index.html
# oppure, per servirlo:
npx serve labionde
```

## Come averlo in locale

Due strade:

1. **Scarica solo il gioco**: prendi `index.html` e salvalo in una cartella
   sul tuo computer (es. `Documenti/Labionde/`). È autonomo.
2. **Clona il repository** (per avere tutto e seguire gli aggiornamenti):
   ```bash
   git clone https://github.com/BaolCristian/savint.git
   cd savint/labionde
   ```

I salvataggi vivono nel browser (localStorage) + codici di backup
esporta/importa dal gioco stesso.

## Struttura della cartella

| Cosa | Dove |
|---|---|
| `index.html` | Il gioco completo (logica, grafica canvas, UI) |
| `GDD.md` | Game design document: sistemi, luoghi veri, roadmap |
| `assets/` | Grafica e audio futuri (sprite, tile, suoni) |
| `reference/` | Materiale di riferimento locale (foto di Sterpo) — vedi il suo README |

## Stato della grafica

La mappa 2D è disegnata **in codice** (canvas): niente immagini esterne, così
il gioco resta un file solo. La v0.9 in roadmap prevede tile art vera in
`assets/` (con uno step di build che la incorpora nel file).
