/**
 * Il pacchetto di esercizi sulle PERCENTUALI per il biennio (file da 09 a 17
 * di `content/esercizi/`).
 *
 * Ogni esercizio è scritto qui come modello dell'editor (`EsercizioEditor`) e
 * convertito con `versoFile`, la stessa conversione che usa l'editor dei
 * docenti: è l'unico modo per avere file che l'editor sa riaprire (vedi
 * `daNumbas`, che accetta solo ciò che `versoNumbas` produrrebbe identico).
 * I file JSON NON vanno corretti a mano: si corregge il modello qui e si
 * rigenera con
 *
 *     npx tsx scripts/genera-percentuali.ts
 *
 * La prova `src/lib/esercizi/__tests__/pacchetto-percentuali.test.ts`
 * controlla che i file su disco coincidano byte per byte con quello che
 * questo script produce.
 *
 * Convenzioni del testo (testo semplice, come lo scrive l'editor):
 * - le formule stanno in `\( ... \)`; il valore di una variabile si scrive
 *   `\var{nome}` SOLO dentro una formula (fuori non viene sostituito);
 * - il simbolo di percentuale dentro una formula è `\%`;
 * - gli importi in euro sono variabili già arrotondate con `precround(x, 2)` e si
 *   MOSTRANO con `dpformat(x, 2)`: sempre due decimali, con la virgola in italiano
 *   (`dpformat` senza stile segue lo stile dei numeri della domanda).
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import type { EsercizioEditor } from "../src/lib/esercizi/editor/modello";
import { esercizioEditorSchema } from "../src/lib/esercizi/editor/modello";
import { versoFile } from "../src/lib/esercizi/editor/verso-numbas";

const r = String.raw;

const ETICHETTE = ["percentuali", "INVALSI", "Numeri"];

/** Il nome del file (senza `.json`) e il modello dell'editor. */
export interface EsercizioPacchetto {
  nome: string;
  modello: EsercizioEditor;
}

export const PACCHETTO_PERCENTUALI: EsercizioPacchetto[] = [
  // ---- classe prima ------------------------------------------------------
  {
    nome: "09-percentuale-di-un-numero",
    modello: {
      meta: {
        titolo: "Percentuale di un numero",
        descrizione: "Calcolare il p% di un numero. I numeri sono scelti perché il risultato sia intero.",
        anno: 1,
        argomento: "percentuali",
        tag: [...ETICHETTE, "percentuale di un numero"],
        difficolta: 1,
      },
      testo: r`Calcola il \(\var{p}\%\) di \(\var{n}\).`,
      suggerimento:
        r`Il \(\var{p}\%\) di un numero è \(\frac{\var{p}}{100}\) di quel numero: si moltiplica per \(\var{p}\) e si divide per \(100\). ` +
        r`Quindi \(\var{n} \cdot \var{p} \div 100 = \var{n*p} \div 100 = \var{ris}\).`,
      variabili: [
        { nome: "p", definizione: "5*random(1..19)", descrizione: "la percentuale, multiplo di 5" },
        { nome: "n", definizione: "20*random(2..30)", descrizione: "il numero, multiplo di 20: così il risultato è intero" },
        { nome: "ris", definizione: "n*p/100", descrizione: "il risultato" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: r`Il \(\var{p}\%\) di \(\var{n}\) è:`,
          punti: 1,
          valore: "ris",
          tolleranza: { tipo: "esatta" },
        },
      ],
    },
  },
  {
    nome: "10-sconto",
    modello: {
      meta: {
        titolo: "Lo sconto",
        descrizione: "Dato il prezzo e la percentuale di sconto, calcolare il risparmio e il prezzo finale in euro.",
        anno: 1,
        argomento: "percentuali",
        tag: [...ETICHETTE, "sconto"],
        difficolta: 1,
      },
      testo: r`Un paio di scarpe costa \(\var{prezzo}\) euro. Durante i saldi il negozio applica uno sconto del \(\var{s}\%\).`,
      suggerimento:
        r`Lo sconto è il \(\var{s}\%\) del prezzo: \(\var{prezzo} \cdot \var{s} \div 100 = \var{dpformat(risp, 2)}\) euro. ` +
        r`Il prezzo finale si ottiene togliendo lo sconto dal prezzo iniziale: \(\var{prezzo} - \var{dpformat(risp, 2)} = \var{dpformat(fin, 2)}\) euro. ` +
        r`Allo stesso risultato si arriva calcolando direttamente il \(\var{100-s}\%\) del prezzo: \(\var{prezzo} \cdot \var{100-s} \div 100 = \var{fin}\).`,
      variabili: [
        { nome: "prezzo", definizione: "random(20..300)", descrizione: "il prezzo iniziale in euro (intero)" },
        { nome: "s", definizione: "random(10, 15, 20, 25, 30, 35, 40, 50)", descrizione: "lo sconto in percentuale" },
        { nome: "risp", definizione: "precround(prezzo*s/100, 2)", descrizione: "quanto si risparmia, in euro" },
        { nome: "fin", definizione: "precround(prezzo - risp, 2)", descrizione: "il prezzo finale, in euro" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: "a) Quanti euro si risparmiano?",
          punti: 1,
          valore: "risp",
          tolleranza: { tipo: "decimali", cifre: 2 },
        },
        {
          tipo: "numerica",
          consegna: "b) Qual è il prezzo finale, in euro?",
          punti: 1,
          valore: "fin",
          tolleranza: { tipo: "decimali", cifre: 2 },
        },
      ],
    },
  },
  {
    nome: "11-iva",
    modello: {
      meta: {
        titolo: "Il prezzo con l'IVA",
        descrizione: "Dato un prezzo senza IVA, calcolare l'IVA al 22% e il prezzo con IVA in euro.",
        anno: 1,
        argomento: "percentuali",
        tag: [...ETICHETTE, "aumento percentuale", "IVA"],
        difficolta: 1,
      },
      testo: r`Un tablet costa \(\var{prezzo}\) euro IVA esclusa. Sul prezzo va aggiunta l'IVA del \(22\%\).`,
      suggerimento:
        r`L'IVA è il \(22\%\) del prezzo: \(\var{prezzo} \cdot 22 \div 100 = \var{dpformat(iva, 2)}\) euro. ` +
        r`Il prezzo con IVA è \(\var{prezzo} + \var{dpformat(iva, 2)} = \var{dpformat(tot, 2)}\) euro. ` +
        r`In un solo passaggio: aggiungere il \(22\%\) vuol dire prendere il \(122\%\) del prezzo, cioè \(\var{prezzo} \cdot 1{,}22 = \var{dpformat(tot, 2)}\).`,
      variabili: [
        { nome: "prezzo", definizione: "5*random(4..160)", descrizione: "il prezzo senza IVA in euro, multiplo di 5" },
        { nome: "iva", definizione: "precround(prezzo*22/100, 2)", descrizione: "l'IVA in euro" },
        { nome: "tot", definizione: "precround(prezzo + iva, 2)", descrizione: "il prezzo con IVA in euro" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: "a) A quanti euro ammonta l'IVA?",
          punti: 1,
          valore: "iva",
          tolleranza: { tipo: "decimali", cifre: 2 },
        },
        {
          tipo: "numerica",
          consegna: "b) Qual è il prezzo con IVA, in euro?",
          punti: 1,
          valore: "tot",
          tolleranza: { tipo: "decimali", cifre: 2 },
        },
      ],
    },
  },
  {
    nome: "12-percentuale-da-trovare",
    modello: {
      meta: {
        titolo: "Che percentuale è?",
        descrizione: "Trovare quale percentuale di un totale rappresenta una parte. Il risultato è sempre intero.",
        anno: 1,
        argomento: "percentuali",
        tag: [...ETICHETTE, "percentuale da trovare"],
        difficolta: 1,
      },
      testo: r`In una scuola ci sono \(\var{b}\) studenti; \(\var{a}\) di loro vengono a scuola in bicicletta. Che percentuale degli studenti viene a scuola in bicicletta?`,
      suggerimento:
        r`Si divide la parte per il totale: \(\var{a} \div \var{b} = \var{q}\). ` +
        r`Per avere la percentuale si moltiplica per \(100\): \(\var{q} \cdot 100 = \var{p}\). ` +
        r`Quindi \(\var{a}\) su \(\var{b}\) è il \(\var{p}\%\).`,
      variabili: [
        { nome: "k", definizione: "random(2..15)", descrizione: "" },
        { nome: "m", definizione: "random(1..19)", descrizione: "" },
        { nome: "b", definizione: "20*k", descrizione: "il totale, multiplo di 20" },
        { nome: "p", definizione: "5*m", descrizione: "la percentuale cercata, multiplo di 5" },
        { nome: "a", definizione: "k*m", descrizione: "la parte: è il p% di b" },
        { nome: "q", definizione: "p/100", descrizione: "il rapporto a/b in forma decimale" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: r`Percentuale (scrivi solo il numero, senza il simbolo \(\%\)):`,
          punti: 1,
          valore: "p",
          tolleranza: { tipo: "esatta" },
        },
      ],
    },
  },
  {
    nome: "13-totale-dalla-parte",
    modello: {
      meta: {
        titolo: "Il totale dalla parte",
        descrizione: "Conoscendo una parte e la percentuale che rappresenta, risalire al totale.",
        anno: 1,
        argomento: "percentuali",
        tag: [...ETICHETTE, "totale dalla percentuale"],
        difficolta: 2,
      },
      testo: r`Un negozio ha venduto \(\var{x}\) magliette, cioè il \(\var{p}\%\) delle magliette che aveva in magazzino. Quante magliette c'erano in magazzino?`,
      suggerimento:
        r`Se \(\var{x}\) magliette sono il \(\var{p}\%\) del totale, l'\(1\%\) del totale è \(\var{x} \div \var{p}\) e il totale, cioè il \(100\%\), è ` +
        r`\(\var{x} \div \var{p} \cdot 100 = \var{x*100} \div \var{p} = \var{totale}\). ` +
        r`Controllo: il \(\var{p}\%\) di \(\var{totale}\) è \(\var{totale} \cdot \var{p} \div 100 = \var{x}\).`,
      variabili: [
        { nome: "p", definizione: "5*random(1..19)", descrizione: "la percentuale, multiplo di 5" },
        { nome: "totale", definizione: "20*random(2..40)", descrizione: "il totale cercato, multiplo di 20" },
        { nome: "x", definizione: "totale*p/100", descrizione: "la parte venduta (intera)" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: "Magliette in magazzino:",
          punti: 1,
          valore: "totale",
          tolleranza: { tipo: "esatta" },
        },
      ],
    },
  },
  {
    nome: "14-percentuali-frazioni-decimali",
    modello: {
      meta: {
        titolo: "Percentuali, frazioni e decimali",
        descrizione: "Riconoscere il numero decimale e la frazione equivalenti a una percentuale.",
        anno: 1,
        argomento: "percentuali",
        tag: [...ETICHETTE, "equivalenze", "frazioni"],
        difficolta: 1,
      },
      testo: r`Considera la percentuale \(\var{p}\%\).`,
      suggerimento:
        r`Una percentuale è una frazione con denominatore \(100\): \(\var{p}\% = \frac{\var{p}}{100}\). ` +
        r`Dividendo per \(100\) si ottiene il numero decimale \(\var{d}\); semplificando la frazione si ottiene \(\frac{\var{num}}{\var{den}}\).`,
      variabili: [
        { nome: "i", definizione: "random(0..4)", descrizione: "quale percentuale si sceglie dall'elenco" },
        { nome: "p", definizione: "[5, 20, 25, 40, 50][i]", descrizione: "la percentuale" },
        { nome: "num", definizione: "[1, 1, 1, 2, 1][i]", descrizione: "numeratore della frazione ridotta" },
        { nome: "den", definizione: "[20, 5, 4, 5, 2][i]", descrizione: "denominatore della frazione ridotta" },
        { nome: "d", definizione: "p/100", descrizione: "il numero decimale equivalente" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "scelta",
          consegna: r`a) Quale numero decimale è uguale a \(\var{p}\%\)?`,
          punti: 1,
          risposte: [r`\(\var{d}\)`, r`\(\var{p/10}\)`, r`\(\var{p}\)`, r`\(\var{100/p}\)`],
          indiceGiusta: 0,
          spiegazioni: [
            "",
            r`Hai diviso per \(10\) invece che per \(100\): \(\var{p}\%\) vuol dire \(\var{p}\) centesimi.`,
            r`Hai tolto il simbolo di percentuale senza dividere per \(100\): \(\var{p}\%\) vale \(\var{p} \div 100\), non \(\var{p}\).`,
            r`Hai calcolato \(100 \div \var{p}\), cioè il contrario: la percentuale si divide per \(100\), non il contrario.`,
          ],
        },
        {
          tipo: "scelta",
          consegna: r`b) Quale frazione è uguale a \(\var{p}\%\)?`,
          punti: 1,
          risposte: [
            r`\(\frac{\var{num}}{\var{den}}\)`,
            r`\(\frac{\var{p}}{10}\)`,
            r`\(\frac{1}{\var{p}}\)`,
            r`\(\frac{\var{p}}{1000}\)`,
          ],
          indiceGiusta: 0,
          spiegazioni: [
            "",
            r`Il denominatore di una percentuale è sempre \(100\), non \(10\): \(\var{p}\% = \frac{\var{p}}{100}\).`,
            r`\(\frac{1}{\var{p}}\) è l'inverso di \(\var{p}\), non la sua percentuale: \(\var{p}\% = \frac{\var{p}}{100}\).`,
            r`Il denominatore di una percentuale è \(100\), non \(1000\) (quello sarebbe il per mille).`,
          ],
        },
      ],
    },
  },

  // ---- classe seconda ----------------------------------------------------
  {
    nome: "15-variazione-percentuale",
    modello: {
      meta: {
        titolo: "Variazione percentuale",
        descrizione: "Calcolare di quanto per cento è aumentato o diminuito un prezzo. Il risultato è sempre intero.",
        anno: 2,
        argomento: "percentuali",
        tag: [...ETICHETTE, "variazione percentuale"],
        difficolta: 2,
      },
      testo: r`Il prezzo di un abbonamento passa da \(\var{v1}\) euro a \(\var{v2}\) euro. Di quanto per cento è cambiato il prezzo?`,
      suggerimento:
        r`La variazione percentuale si calcola dividendo la differenza fra il nuovo e il vecchio valore per il vecchio valore, e moltiplicando per \(100\): ` +
        r`\(\frac{\var{v2} - \var{v1}}{\var{v1}} \cdot 100 = \frac{\var{d}}{\var{v1}} \cdot 100 = \var{c}\). ` +
        r`Il prezzo è quindi cambiato del \(\var{c}\%\): un numero positivo indica un aumento, uno negativo una diminuzione.`,
      variabili: [
        { nome: "k", definizione: "random(2..30)", descrizione: "" },
        { nome: "m", definizione: "random(-12..12 except 0)", descrizione: "" },
        { nome: "v1", definizione: "20*k", descrizione: "il prezzo iniziale, multiplo di 20" },
        { nome: "c", definizione: "5*m", descrizione: "la variazione percentuale (da -60 a +60, mai 0)" },
        { nome: "d", definizione: "k*m", descrizione: "la differenza v2 - v1" },
        { nome: "v2", definizione: "v1 + d", descrizione: "il prezzo finale" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: r`Variazione percentuale (scrivi solo il numero, con il segno meno se il prezzo è diminuito, senza il simbolo \(\%\)):`,
          punti: 1,
          valore: "c",
          tolleranza: { tipo: "esatta" },
        },
      ],
    },
  },
  {
    nome: "16-sconti-successivi",
    modello: {
      meta: {
        titolo: "Sconti successivi",
        descrizione:
          "Due sconti applicati uno dopo l'altro non si sommano: riconoscere l'errore e calcolare lo sconto totale effettivo.",
        anno: 2,
        argomento: "percentuali",
        tag: [...ETICHETTE, "sconto", "sconti successivi"],
        difficolta: 2,
      },
      testo:
        r`Un giubbotto viene scontato prima del \(\var{p}\%\); poi, sul prezzo già scontato, viene applicato un ulteriore sconto del \(\var{q}\%\).`,
      suggerimento:
        r`Dopo il primo sconto resta il \(\var{100-p}\%\) del prezzo; il secondo sconto lascia il \(\var{100-q}\%\) di quello che restava. ` +
        r`In tutto resta \(\var{a1} \cdot \var{a2} = \var{f}\), cioè il \(\var{resto}\%\) del prezzo iniziale. ` +
        r`Lo sconto totale è quindi \(100\% - \var{resto}\% = \var{tot}\%\), meno di \(\var{p}\% + \var{q}\% = \var{p+q}\%\): ` +
        r`il secondo sconto si calcola sul prezzo già scontato, che è più basso di quello iniziale, e quindi toglie meno euro.`,
      variabili: [
        { nome: "p", definizione: "5*random(2..8)", descrizione: "il primo sconto in percentuale" },
        { nome: "q", definizione: "5*random(2..8)", descrizione: "il secondo sconto in percentuale" },
        { nome: "a1", definizione: "(100-p)/100", descrizione: "quanto resta dopo il primo sconto, come decimale" },
        { nome: "a2", definizione: "(100-q)/100", descrizione: "quanto resta dopo il secondo sconto, come decimale" },
        { nome: "f", definizione: "precround(a1*a2, 4)", descrizione: "quanto resta in tutto, come decimale" },
        { nome: "resto", definizione: "precround(100*f, 2)", descrizione: "quanto resta in tutto, in percentuale" },
        { nome: "tot", definizione: "precround(100 - resto, 2)", descrizione: "lo sconto totale effettivo, in percentuale" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "scelta",
          consegna: r`a) Lo sconto totale è del \(\var{p+q}\%\)?`,
          punti: 1,
          risposte: [
            r`No, è minore del \(\var{p+q}\%\).`,
            r`Sì, gli sconti si sommano: \(\var{p}\% + \var{q}\% = \var{p+q}\%\).`,
            r`No, è maggiore del \(\var{p+q}\%\).`,
          ],
          indiceGiusta: 0,
          spiegazioni: [
            "",
            r`È l'errore più comune: il \(\var{q}\%\) non si calcola sul prezzo iniziale ma su quello già scontato, che è più basso. Il secondo sconto toglie quindi meno euro, e il totale è meno del \(\var{p+q}\%\).`,
            r`Il secondo sconto si calcola su un prezzo già più basso di quello iniziale, quindi toglie meno euro di quanti ne toglierebbe sul prezzo iniziale: il totale è minore della somma, non maggiore.`,
          ],
        },
        {
          tipo: "numerica",
          consegna: r`b) Qual è lo sconto totale effettivo, in percentuale? (scrivi solo il numero, senza il simbolo \(\%\))`,
          punti: 2,
          valore: "tot",
          tolleranza: { tipo: "decimali", cifre: 2 },
        },
      ],
    },
  },
  {
    nome: "17-interesse-semplice",
    modello: {
      meta: {
        titolo: "Interesse semplice",
        descrizione: "Calcolare l'interesse semplice e il montante di un capitale dati il tasso annuo e la durata in anni.",
        anno: 2,
        argomento: "percentuali",
        tag: [...ETICHETTE, "interesse semplice"],
        difficolta: 1,
      },
      testo:
        r`Si depositano \(\var{capitale}\) euro in banca, al tasso di interesse semplice del \(\var{tasso}\%\) annuo, per \(\var{t}\) anni.`,
      suggerimento:
        r`Ogni anno il capitale produce il \(\var{tasso}\%\) di \(\var{capitale}\), cioè \(\var{capitale} \cdot \var{tasso} \div 100 = \var{annuo}\) euro. ` +
        r`In \(\var{t}\) anni l'interesse è \(I = \frac{C \cdot r \cdot t}{100} = \frac{\var{capitale} \cdot \var{tasso} \cdot \var{t}}{100} = \var{interesse}\) euro. ` +
        r`Il montante è il capitale più l'interesse: \(\var{capitale} + \var{interesse} = \var{montante}\) euro.`,
      variabili: [
        { nome: "capitale", definizione: "100*random(5..50)", descrizione: "il capitale in euro, multiplo di 100" },
        { nome: "tasso", definizione: "random(1..6)", descrizione: "il tasso annuo in percentuale" },
        { nome: "t", definizione: "random(2..5)", descrizione: "la durata in anni" },
        { nome: "annuo", definizione: "capitale*tasso/100", descrizione: "l'interesse di un anno" },
        { nome: "interesse", definizione: "capitale*tasso*t/100", descrizione: "l'interesse totale" },
        { nome: "montante", definizione: "capitale + interesse", descrizione: "il montante" },
      ],
      condizione: "",
      parti: [
        {
          tipo: "numerica",
          consegna: "a) Quanti euro di interesse si ottengono in tutto?",
          punti: 1,
          valore: "interesse",
          tolleranza: { tipo: "esatta" },
        },
        {
          tipo: "numerica",
          consegna: r`b) Qual è il montante (capitale più interesse) dopo \(\var{t}\) anni, in euro?`,
          punti: 1,
          valore: "montante",
          tolleranza: { tipo: "esatta" },
        },
      ],
    },
  },
];

/** I byte esatti del file di un esercizio: lo stesso formato usato per tutti
 * i file del pacchetto (due spazi di rientro, a capo finale). */
export function testoFile(modello: EsercizioEditor): string {
  return `${JSON.stringify(versoFile(esercizioEditorSchema.parse(modello)), null, 2)}\n`;
}

function scrivi(): void {
  const dir = path.resolve(process.cwd(), "content/esercizi");
  mkdirSync(dir, { recursive: true });
  for (const { nome, modello } of PACCHETTO_PERCENTUALI) {
    writeFileSync(path.join(dir, `${nome}.json`), testoFile(modello));
    console.log(`scritto content/esercizi/${nome}.json`);
  }
}

// Scrive i file solo quando lanciato direttamente: la prova importa i
// modelli da qui senza effetti collaterali.
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  scrivi();
}
