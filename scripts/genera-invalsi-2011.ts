/**
 * La prova INVALSI di matematica 2010/11 (classe seconda della secondaria di
 * secondo grado): 30 domande, una per esercizio, nei file
 * `content/esercizi/invalsi-2011-dNN-*.json`.
 *
 * Le regole comuni a tutte le prove sono in `scripts/invalsi/comune.ts`.
 * I file JSON NON si correggono a mano: si corregge qui e si rigenera con
 *
 *     npx tsx scripts/genera-invalsi-2011.ts
 *
 * `src/lib/esercizi/__tests__/pacchetto-invalsi-2011.test.ts` controlla che i
 * file su disco coincidano con quello che questo script produce, che reggano
 * la verifica a venti semi e che le risposte giuste prendano tutti i punti.
 *
 * Scelte di trascrizione proprie di questa prova:
 * - le tabelle della D1, D11, D19 e D26 sono riscritte in formula, in
 *   colonna (la D1 e la D11 trasposte);
 * - la tabella a tre colonne della D12 (Vero / Falso / Non si può ricavare)
 *   diventa una scelta a tre risposte per ogni affermazione;
 * - le risposte da scrivere o da argomentare (D4, D6, D20b, D23b) diventano
 *   a scelta o numeriche, e la descrizione lo dice;
 * - nella D7 la scala non si può misurare sullo schermo: si dà la lunghezza
 *   misurata sul fascicolo stampato.
 */
import {
  creaPacchetto,
  espressione,
  img as immagine,
  lanciatoDirettamente,
  numerica,
  r,
  scelta,
  scriviPacchetto,
  testoFile,
  veroFalso,
  type Domanda,
  type EsercizioPacchetto,
} from "./invalsi/comune";

export { testoFile };
export type { EsercizioPacchetto };

/** Le immagini ritagliate dal fascicolo (in `content/esercizi/immagini/`). */
const IMMAGINE = {
  d06a: "af793232-849a-42bd-a6d4-3d460a78dbc2.png",
  d06b: "9336690a-6dfa-4cb0-9f38-ae59525b004a.png",
  d07: "9f1dd18c-02a4-47f1-93c7-1fca372bb047.png",
  d09: "51bfa504-181a-42c9-89bd-32d84fd36f7b.png",
  d12: "bd9150df-9087-4ea3-bb86-7b61ba76dace.png",
  d17: "1829f7f7-48d5-4013-ac9e-073e7d962062.png",
  d18: "e784bb5a-b75a-42d3-bd01-e555b1fb15d5.png",
  d20: "4296a38a-c3a0-4392-b012-dfe48c34b901.png",
  d30: "bbef3ed9-ccf4-47d8-b9f9-b503da08a60a.png",
} as const;

const img = (chiave: keyof typeof IMMAGINE, descrizione: string) => immagine(IMMAGINE[chiave], descrizione);

const PROVENIENZE = ["Autoproduzione", "Mercato libero", "Mercato vincolato"];
const VFN = ["Vero", "Falso", "Non si può ricavare dal grafico"];

const DOMANDE: Domanda[] = [
  {
    numero: 1,
    slug: "alunni-e-insegnanti",
    titolo: "Alunni e insegnanti",
    ambito: "Dati e previsioni",
    temi: ["tabelle", "rapporti"],
    difficolta: 2,
    adattamento: "La tabella è trasposta: le aree geografiche sono in colonna.",
    testo:
      "Nella tabella che vedi sono riportati i dati relativi alla distribuzione di alunni e insegnanti nella scuola secondaria di primo grado in Italia. " +
      r`\[\begin{array}{|l|r|r|r|r|} \hline & \text{ITALIA} & \text{Nord} & \text{Centro} & \text{Sud} \\ \hline ` +
      r`\text{Scuole} & 7\,939 & 3\,381 & 1\,358 & 3\,200 \\ \hline ` +
      r`\text{Classi} & 82\,446 & 33\,131 & 14\,656 & 34\,659 \\ \hline ` +
      r`\text{Alunni (compresi i ripetenti), maschi e femmine} & 1\,727\,339 & 711\,292 & 312\,700 & 703\,347 \\ \hline ` +
      r`\text{Alunni (compresi i ripetenti), femmine} & 826\,869 & 339\,508 & 150\,098 & 337\,263 \\ \hline ` +
      r`\text{Ripetenti, maschi e femmine} & 51\,407 & 19\,615 & 8\,066 & 23\,726 \\ \hline ` +
      r`\text{Ripetenti, femmine} & 16\,199 & 5\,679 & 2\,508 & 8\,012 \\ \hline ` +
      r`\text{Insegnanti} & 212\,041 & 86\,312 & 36\,570 & 89\,159 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Nel Nord gli alunni sono 711 292, di cui 339 508 femmine: i maschi sono \(711\,292 - 339\,508 = 371\,784\), più delle femmine. Falsa. ` +
      r`b) In Italia \(212\,041 : 82\,446 \approx 2{,}57\) insegnanti per classe, meno di 3. Vera. ` +
      r`c) Nel Sud \(34\,659 : 3\,200 \approx 10{,}8\) classi per scuola, più di 10. Vera.`,
    parti: [
      veroFalso(
        [
          "Nel Nord gli alunni maschi sono meno delle femmine",
          "In Italia il rapporto insegnanti/classi è inferiore a 3",
          "Nel Sud ci sono mediamente più di 10 classi per scuola",
        ],
        [false, true, true],
        "Sulla base dei dati in tabella, indica se le seguenti affermazioni sono vere o false.",
      ),
    ],
  },
  {
    numero: 2,
    slug: "la-corriera",
    titolo: "La corriera",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "percentuali"],
    difficolta: 1,
    testo:
      "La corriera passa alle 6:30 alla fermata dove sale Giorgio. Nel 40% dei casi è in orario, nel 50% dei casi ha un ritardo di 5 minuti e nei rimanenti casi ha un ritardo di 10 minuti. " +
      "Se Giorgio arriva alla fermata alle 6:34, che probabilità ha di prendere la corriera?",
    suggerimento:
      "Alle 6:34 la corriera in orario è già passata. Giorgio la prende se è in ritardo di 5 minuti (50% dei casi) o di 10 minuti (il restante 100% − 40% − 50% = 10%): 50% + 10% = 60%.",
    parti: [scelta("", ["10%", "40%", "50%", "60%"], 3)],
  },
  {
    numero: 3,
    slug: "terzo-lato",
    titolo: "Il terzo lato",
    ambito: "Spazio e figure",
    temi: ["triangoli", "disuguaglianza triangolare"],
    difficolta: 1,
    testo: "Un triangolo ha un lato di 6 cm e uno di 10 cm. Quale tra le seguenti NON può essere la misura della lunghezza del terzo lato?",
    suggerimento:
      "In un triangolo ogni lato è minore della somma degli altri due e maggiore della loro differenza: il terzo lato deve stare fra 10 − 6 = 4 cm e 10 + 6 = 16 cm. 17 cm è troppo lungo.",
    parti: [scelta("", ["6,5 cm", "10 cm", "15,5 cm", "17 cm"], 3)],
  },
  {
    numero: 4,
    slug: "controesempio-primo",
    titolo: "Un controesempio",
    ambito: "Numeri",
    temi: ["numeri primi", "potenze", "controesempio"],
    difficolta: 2,
    adattamento: "Nel fascicolo l'esempio andava scritto: qui si sceglie fra esempi proposti.",
    testo: r`Considera l'affermazione: «Per ogni numero naturale \(n\), \(2^n + 1\) è un numero primo». Quale dei seguenti esempi mostra che l'affermazione è falsa?`,
    suggerimento:
      r`Basta un solo valore di \(n\) per cui \(2^n + 1\) non è primo. Per \(n = 1, 2, 4\) si ottengono 3, 5, 17, che sono primi; ` +
      r`per \(n = 3\) si ottiene \(2^3 + 1 = 9 = 3 \cdot 3\), che non è primo: l'affermazione è falsa.`,
    parti: [
      scelta(
        "",
        [
          r`\(n = 1\): \(2^1 + 1 = 3\)`,
          r`\(n = 2\): \(2^2 + 1 = 5\)`,
          r`\(n = 3\): \(2^3 + 1 = 9\)`,
          r`\(n = 4\): \(2^4 + 1 = 17\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 5,
    slug: "eta-della-terra",
    titolo: "L'età della Terra",
    ambito: "Numeri",
    temi: ["notazione scientifica", "stime", "potenze di 10"],
    difficolta: 2,
    testo:
      r`L'età della Terra è valutata intorno ai \(4{,}5 \times 10^9\) anni. L'Homo Erectus è comparso circa \(10^6\) anni fa. ` +
      "Qual è la stima che più si avvicina all'età che la Terra aveva quando è comparso l'Homo Erectus?",
    suggerimento:
      r`L'età di allora è \(4{,}5 \times 10^9 - 10^6 = 4\,500\,000\,000 - 1\,000\,000 = 4\,499\,000\,000\) anni: ` +
      r`un milione è trascurabile rispetto a 4,5 miliardi, quindi la stima migliore resta \(4{,}5 \times 10^9\) anni.`,
    parti: [
      scelta(
        "",
        [r`\(4{,}5 \times 10^9\) anni`, r`\(3{,}5 \times 10^9\) anni`, r`\(4{,}5 \times 10^6\) anni`, r`\(4{,}5 \times 10^3\) anni`],
        0,
      ),
    ],
  },
  {
    numero: 6,
    slug: "consumi-elettrici",
    titolo: "Consumi elettrici",
    ambito: "Dati e previsioni",
    temi: ["grafici", "lettura di grafici", "istogrammi"],
    difficolta: 1,
    adattamento: "Nel fascicolo la provenienza andava scritta: qui si sceglie fra le tre.",
    testo:
      "Nel diagramma di figura 1 sono riportati i consumi elettrici (in TWh, terawattora) in Italia dal 2000 al 2005 in funzione della provenienza dell'energia dall'Autoproduzione, dal Mercato libero o dal Mercato vincolato. " +
      img("d06a", "Figura 1: istogramma a barre sovrapposte dei consumi elettrici dal 2000 al 2005, divisi in Mercato vincolato, Mercato libero e Autoproduzione") +
      " I grafici A, B e C in figura 2 sono stati costruiti con gli stessi dati rappresentati nel diagramma di figura 1. " +
      img("d06b", "Figura 2: tre grafici a linee A, B e C dei consumi dal 2000 al 2005; C scende dall'alto, B sale, A resta basso e quasi costante") +
      " Confronta le figure 1 e 2 e completa le frasi indicando la provenienza dell'energia.",
    suggerimento:
      "Nella figura 1 l'Autoproduzione resta bassa e quasi costante (da 23,8 a 21,3 TWh): è il grafico A. " +
      "Il Mercato libero cresce (da 46,1 a 135,5 TWh): è il grafico B. Il Mercato vincolato è il più grande e diminuisce (da 209,4 a 153,0 TWh): è il grafico C.",
    parti: [
      scelta("1. Il grafico A corrisponde all'andamento dei consumi di energia proveniente da", PROVENIENZE, 0),
      scelta("2. Il grafico B corrisponde all'andamento dei consumi di energia proveniente da", PROVENIENZE, 1),
      scelta("3. Il grafico C corrisponde all'andamento dei consumi di energia proveniente da", PROVENIENZE, 2),
    ],
  },
  {
    numero: 7,
    slug: "mappa-di-torino",
    titolo: "La mappa",
    ambito: "Spazio e figure",
    temi: ["scala", "mappe", "proporzioni"],
    difficolta: 3,
    adattamento:
      "Sullo schermo la mappa non ha le dimensioni della stampa: si dice quanto misurava, sul fascicolo, il tratto di via 20 Settembre percorso.",
    testo:
      "Il Signor Carlo scende dal tram all'incrocio di via Pietro Micca con via 20 Settembre (nella mappa che vedi qui sotto il punto è contrassegnato da un asterisco). " +
      img("d07", "Mappa di un quartiere con via Pietro Micca, via 20 Settembre, via A. G. I. Bertola, via G. Botero; un asterisco all'incrocio di via Pietro Micca con via 20 Settembre") +
      " Il Signor Carlo percorre 150 metri di via 20 Settembre e, all'incrocio con via A. G. I. Bertola, svolta a destra risalendo fino all'incrocio con via G. Botero. " +
      "Sulla mappa stampata nel fascicolo il tratto di via 20 Settembre percorso (150 m) misurava circa 2,8 cm.",
    suggerimento:
      r`a) Sulla mappa il tratto di via Bertola fino a via Botero è lungo circa 3 volte il tratto di via 20 Settembre: circa \(3 \cdot 150 = 450\) m. ` +
      r`In tutto circa \(150 + 450 = 600\) m. ` +
      r`b) 150 m sono \(15\,000\) cm, rappresentati da circa 2,8 cm: \(15\,000 : 2{,}8 \approx 5\,400\). La scala più vicina è 1:6 000 (1 cm sulla mappa corrisponde a 60 m).`,
    parti: [
      numerica("a) Quanti metri all'incirca ha percorso in tutto?", "600", "100"),
      scelta("b) Qual è, all'incirca, la scala della mappa?", ["1:60", "1:600", "1:6 000", "1:60 000"], 2),
    ],
  },
  {
    numero: 8,
    slug: "televisore",
    titolo: "Il televisore 16:9",
    ambito: "Spazio e figure",
    temi: ["teorema di Pitagora", "proporzioni", "rettangolo"],
    difficolta: 2,
    testo:
      "La dimensione di un televisore è la misura della diagonale dello schermo espressa in pollici (1 pollice = 2,54 cm). " +
      "Nei televisori di nuova generazione il rapporto tra la larghezza e l'altezza dello schermo è 16:9.",
    suggerimento:
      r`a) \(\frac{\text{altezza}}{57{,}5} = \frac{9}{16}\), quindi altezza \(= 57{,}5 \cdot 9 : 16 \approx 32{,}3\) cm. ` +
      r`b) Con il teorema di Pitagora la diagonale è \(\sqrt{57{,}5^2 + 32{,}3^2} \approx \sqrt{4\,350} \approx 66\) cm, cioè 26 pollici (66,04 cm).`,
    parti: [
      numerica("a) Se la larghezza dello schermo di uno di questi televisori è circa 57,5 cm, qual è all'incirca la sua altezza, in cm?", "32.34", "0.5"),
      scelta(
        "b) Da quanti pollici è il televisore?",
        ["20 pollici (= 50,80 cm)", "26 pollici (= 66,04 cm)", "28 pollici (= 71,12 cm)", "32 pollici (= 81,28 cm)"],
        1,
      ),
    ],
  },
  {
    numero: 9,
    slug: "triangolo-nel-cubo",
    titolo: "Il triangolo nel cubo",
    ambito: "Spazio e figure",
    temi: ["cubo", "teorema di Pitagora", "geometria solida"],
    difficolta: 3,
    testo:
      "Nella figura è rappresentato un cubo. " +
      img("d09", "Un cubo con il triangolo ABC: C vertice in alto dietro, A vertice in basso dietro sotto C, B vertice in basso davanti") +
      " Il triangolo ABC ha come lati uno spigolo del cubo, la diagonale di una sua faccia e una diagonale del cubo.",
    suggerimento:
      r`AC è uno spigolo, AB la diagonale della faccia di base, BC la diagonale del cubo. Lo spigolo AC è perpendicolare alla faccia di base, quindi ad AB: il triangolo è rettangolo in A e BC, l'ipotenusa, è il lato più lungo. ` +
      r`b) \(AC = 1\) m, \(AB = \sqrt{1^2 + 1^2} = \sqrt{2} \approx 1{,}41\) m, \(BC = \sqrt{AB^2 + AC^2} = \sqrt{3} \approx 1{,}73\) m. ` +
      r`Quindi AB non è uguale ad AC, e l'angolo in B non è di 45° (lo sarebbe se i cateti fossero uguali: ha la tangente \(\frac{1}{\sqrt{2}}\), circa 35°).`,
    parti: [
      veroFalso(
        ["Il lato AB è uguale al lato AC", "Il triangolo ABC è rettangolo", "Il lato BC è il più lungo dei tre", "L'angolo ABC è di 45°"],
        [false, true, true, false],
        "a) Indica se ciascuna delle seguenti affermazioni è vera o falsa.",
      ),
      numerica("b) Se lo spigolo del cubo misura 1 m, quanto misurano i lati del triangolo ABC? Arrotonda ai centesimi. AC (in m) =", "1"),
      numerica("AB (in m) =", "sqrt(2)", "0.01"),
      numerica("BC (in m) =", "sqrt(3)", "0.01"),
    ],
  },
  {
    numero: 10,
    slug: "meta-di-una-potenza",
    titolo: "La metà di una potenza",
    ambito: "Numeri",
    temi: ["potenze"],
    difficolta: 1,
    testo: r`Qual è la metà del numero \(\left(\frac{1}{2}\right)^{50}\)?`,
    suggerimento: r`La metà si ottiene moltiplicando per \(\frac{1}{2}\): \(\left(\frac{1}{2}\right)^{50} \cdot \frac{1}{2} = \left(\frac{1}{2}\right)^{51}\).`,
    parti: [
      scelta(
        "",
        [
          r`\(\left(\frac{1}{4}\right)^{50}\)`,
          r`\(\left(\frac{1}{2}\right)^{25}\)`,
          r`\(\left(\frac{1}{2}\right)^{51}\)`,
          r`\(\left(\frac{1}{2}\right)^{49}\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 11,
    slug: "spesa-automobile",
    titolo: "La spesa per l'automobile",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "modellizzazione", "confronto di tariffe"],
    difficolta: 2,
    adattamento: "La tabella è trasposta: le auto sono in colonna.",
    testo:
      r`La relazione seguente esprime la spesa annuale per l'automobile, composta da una parte fissa e da una parte proporzionale al numero di km percorsi: \[S = F + c \cdot k\] ` +
      r`dove \(F\) sono le spese fisse, \(c\) è il costo al km e \(k\) è il numero di km percorsi. Nella tabella sono riportate le spese fisse e il costo al km per alcuni tipi di automobile. ` +
      r`\[\begin{array}{|c|c|c|} \hline & \text{Spese fisse } F & \text{Costo al km } c \\ \hline ` +
      r`\text{Auto A} & 900 \text{ euro} & 0{,}25 \text{ euro/km} \\ \hline ` +
      r`\text{Auto B} & 580 \text{ euro} & 0{,}33 \text{ euro/km} \\ \hline ` +
      r`\text{Auto C} & 650 \text{ euro} & 0{,}27 \text{ euro/km} \\ \hline ` +
      r`\text{Auto D} & 1\,200 \text{ euro} & 0{,}31 \text{ euro/km} \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Con \(k = 10\,000\): A \(900 + 2\,500 = 3\,400\), B \(580 + 3\,300 = 3\,880\), C \(650 + 2\,700 = 3\,350\), D \(1\,200 + 3\,100 = 4\,300\) euro: la più conveniente è C. ` +
      r`b) \(900 + 0{,}25k = 3\,000\), cioè \(0{,}25k = 2\,100\), \(k = 8\,400\) km. ` +
      r`c) B ha spese fisse più basse ma costa di più al km: \(580 + 0{,}33k = 1\,200 + 0{,}31k\) per \(k = 31\,000\). Fino a 31 000 km conviene B, oltre conviene D.`,
    parti: [
      scelta("a) Se percorro 10 000 km all'anno, quale auto è più conveniente?", ["L'auto A", "L'auto B", "L'auto C", "L'auto D"], 2),
      numerica("b) Il proprietario di un'auto di tipo A ha speso 3 000 euro in un anno. Quanti km ha percorso?", "8400"),
      scelta(
        "c) Se confrontiamo un'auto di tipo B con una di tipo D, possiamo dire che",
        [
          "è sempre più economico utilizzare l'auto di tipo B",
          "è sempre più economico utilizzare l'auto di tipo D",
          "l'auto di tipo B conviene fino a un certo numero di km annuali, oltre questo numero conviene l'auto di tipo D",
          "l'auto di tipo D conviene fino a un certo numero di km annuali, oltre questo numero conviene l'auto di tipo B",
        ],
        2,
      ),
    ],
  },
  {
    numero: 12,
    slug: "temperature-e-precipitazioni",
    titolo: "Temperature e precipitazioni",
    ambito: "Dati e previsioni",
    temi: ["grafici", "lettura di grafici"],
    difficolta: 2,
    adattamento: "La tabella con tre colonne (Vero, Falso, Non si può ricavare) è diventata una scelta per ogni affermazione.",
    testo:
      "Osserva il seguente grafico che rappresenta l'andamento delle temperature (scala a sinistra) e delle precipitazioni piovose (scala a destra) in Italia negli ultimi anni. " +
      img(
        "d12",
        "Figura 1: media annua della temperatura media, massima e minima giornaliera (linee) e precipitazioni totali annue (barre) in Italia, anni 2000-2009",
      ) +
      " Indica per ciascuna delle seguenti affermazioni se è vera o falsa o se non si può ricavare dal grafico.",
    suggerimento:
      "a) Il grafico non riporta dati del periodo 1971-2000: non si può ricavare. " +
      "b) La linea delle temperature massime ha il punto più alto nel 2003: vera. " +
      "c) Nel 2005 la media delle temperature minime è la più bassa, non la più alta (la più alta è nel 2009): falsa. " +
      "d) Le massime sono più alte nel 2003, ma le precipitazioni più basse sono nel 2001: falsa. " +
      "e) Il grafico riporta solo medie annue, non le temperature dei singoli giorni: non si può ricavare. " +
      "f) La barra più alta è quella del 2002, non del 2004: falsa.",
    parti: [
      scelta("a) Nel decennio 2000-2009 la temperatura media annua è risultata più alta di 0,8 gradi rispetto al periodo 1971-2000", VFN, 2),
      scelta("b) L'anno 2003 è quello in cui si è registrato il più alto valore per la media delle temperature massime", VFN, 0),
      scelta("c) L'anno 2005 è quello in cui si è registrato il più alto valore per la media delle temperature minime", VFN, 1),
      scelta("d) L'anno in cui la media delle temperature massime è stata più alta è anche quello in cui le precipitazioni sono state minori", VFN, 1),
      scelta("e) L'anno 2005 è quello in cui c'è stato il giorno più freddo", VFN, 2),
      scelta("f) Il 2004 è stato l'anno più piovoso", VFN, 1),
    ],
  },
  {
    numero: 13,
    slug: "test-di-inglese",
    titolo: "Il test di inglese",
    ambito: "Relazioni e funzioni",
    temi: ["formule", "modellizzazione", "disequazioni"],
    difficolta: 2,
    testo:
      r`L'insegnante di inglese dà ai suoi studenti un test formato da 25 domande e spiega che il punteggio totale \(p\) è calcolato assegnando 4 punti per ogni risposta esatta e togliendo 2 punti per ogni risposta sbagliata o mancante.`,
    suggerimento:
      r`a) Con 25 risposte esatte: \(25 \cdot 4 = 100\). ` +
      r`b) Con \(n\) risposte esatte le altre sono \(25 - n\): \(p = 4n - 2(25 - n) = 6n - 50\). ` +
      r`c) \(6n - 50 > 60\) dà \(n > \frac{110}{6} \approx 18{,}3\): servono almeno 19 risposte esatte (\(6 \cdot 19 - 50 = 64\), mentre con 18 si hanno 58 punti).`,
    parti: [
      numerica("a) Il punteggio massimo possibile è", "100"),
      espressione(r`b) Scrivi la formula che fornisce il punteggio \(p\) complessivo, indicando con \(n\) il numero di risposte esatte. \(p =\)`, "6*n - 50"),
      numerica(
        "c) Se la sufficienza si ottiene con più di 60 punti, qual è il numero minimo di domande al quale occorre rispondere correttamente per avere la sufficienza?",
        "19",
      ),
    ],
  },
  {
    numero: 14,
    slug: "somma-di-dispari",
    titolo: "La somma di tre dispari consecutivi",
    ambito: "Numeri",
    temi: ["calcolo letterale", "multipli", "numeri pari e dispari"],
    difficolta: 2,
    testo:
      r`L'insegnante chiede: «Se \(n\) è un numero naturale qualsiasi, cosa si ottiene addizionando i tre numeri \(2n+1\), \(2n+3\) e \(2n+5\)?» ` +
      "Mario afferma: «Si ottiene sempre il triplo di uno dei tre numeri». Luisa risponde: «Si ottiene sempre un numero dispari». Giovanni dice: «Si ottiene sempre un multiplo di 3». Chi ha ragione?",
    suggerimento:
      r`La somma è \(6n + 9 = 3(2n + 3)\): è il triplo del numero centrale \(2n + 3\) (Mario), è un multiplo di 3 (Giovanni) ed è dispari, ` +
      r`perché \(6n\) è pari e \(9\) è dispari (Luisa). Hanno ragione tutti e tre.`,
    parti: [scelta("", ["Tutti e tre", "Solo Mario", "Solo Luisa", "Solo Giovanni"], 0)],
  },
  {
    numero: 15,
    slug: "dividere-per-0-2",
    titolo: "Dividere per 0,2",
    ambito: "Numeri",
    temi: ["numeri decimali", "reciproco"],
    difficolta: 1,
    testo: "Dividere un numero per 0,2 è lo stesso che moltiplicarlo per",
    suggerimento: r`\(0{,}2 = \frac{1}{5}\), e dividere per \(\frac{1}{5}\) vuol dire moltiplicare per il reciproco, 5. Per esempio \(1 : 0{,}2 = 5\).`,
    parti: [scelta("", [r`\(\frac{1}{5}\)`, r`\(\frac{1}{2}\)`, "2", "5"], 3)],
  },
  {
    numero: 16,
    slug: "somma-di-potenze-di-10",
    titolo: "Somma di potenze di 10",
    ambito: "Numeri",
    temi: ["potenze", "raccoglimento"],
    difficolta: 2,
    testo: r`L'espressione \(10^{37} + 10^{38}\) è anche uguale a`,
    suggerimento: r`\(10^{38} = 10 \cdot 10^{37}\), quindi raccogliendo \(10^{37}\): \(10^{37} + 10 \cdot 10^{37} = (1 + 10) \cdot 10^{37} = 11 \cdot 10^{37}\). Le potenze non si sommano sommando basi o esponenti.`,
    parti: [scelta("", [r`\(20^{75}\)`, r`\(10^{7}\)`, r`\(11 \cdot 10^{37}\)`, r`\(10^{37 \cdot 38}\)`], 2)],
  },
  {
    numero: 17,
    slug: "asse-del-parallelogramma",
    titolo: "Asse di simmetria del parallelogramma",
    ambito: "Spazio e figure",
    temi: ["simmetria", "parallelogramma"],
    difficolta: 2,
    testo:
      "Quale fra le rette a, b e c, nel piano della figura, è un asse di simmetria del parallelogramma PQRS? " +
      img("d17", "Il parallelogramma PQRS con la retta a passante per P e R, la retta c passante per Q e S, e la retta b che le incrocia nel centro"),
    suggerimento:
      "Le rette a e c sono le diagonali PR e QS: una diagonale è asse di simmetria solo se il parallelogramma è un rombo, e PQRS ha i lati PQ e PS ben diversi. " +
      "La retta b passa per il centro, ma non è perpendicolare ai lati: lo sarebbe solo in un rettangolo. Un parallelogramma qualunque non ha assi di simmetria.",
    parti: [scelta("", ["La retta a", "La retta b", "La retta c", "Nessuna delle tre"], 3)],
  },
  {
    numero: 18,
    slug: "area-del-quadrilatero",
    titolo: "L'area del quadrilatero",
    ambito: "Spazio e figure",
    temi: ["area", "piano cartesiano", "quadrilateri"],
    difficolta: 2,
    testo:
      "L'unità di misura riportata sugli assi cartesiani rappresenta 1 cm. " +
      img("d18", "Il quadrilatero ABCD nel piano cartesiano, con A(6; 1), B(5; 7), C(1; 4), D(5; 1)") +
      " Calcola l'area del quadrilatero ABCD.",
    suggerimento:
      r`I vertici sono A(6; 1), B(5; 7), C(1; 4), D(5; 1). Il rettangolo che li contiene, da \(x = 1\) a \(x = 6\) e da \(y = 1\) a \(y = 7\), ha area \(5 \cdot 6 = 30\). ` +
      r`Si tolgono i triangoli attorno: fra C, B e l'angolo (1; 7) \(\frac{4 \cdot 3}{2} = 6\); fra C, D e l'angolo (1; 1) \(\frac{4 \cdot 3}{2} = 6\); fra B, A e l'angolo (6; 7) \(\frac{1 \cdot 6}{2} = 3\). ` +
      r`Area \(= 30 - 6 - 6 - 3 = 15\ \text{cm}^2\).`,
    parti: [numerica(r`Area, in \(\text{cm}^2\):`, "15")],
  },
  {
    numero: 19,
    slug: "peso-dei-neonati",
    titolo: "Il peso dei neonati",
    ambito: "Dati e previsioni",
    temi: ["media", "media ponderata", "classi di frequenza"],
    difficolta: 2,
    testo:
      "La seguente tabella riporta il peso alla nascita, suddiviso in 4 classi, di 30 neonati. " +
      r`\[\begin{array}{|c|c|} \hline \text{Classi di peso (in kg)} & \text{Numero neonati} \\ \hline ` +
      r`\text{Da 1 kg e fino a 2 kg} & 7 \\ \hline \text{Più di 2 kg e fino a 3 kg} & 8 \\ \hline ` +
      r`\text{Più di 3 kg e fino a 4 kg} & 12 \\ \hline \text{Più di 4 kg e fino a 5 kg} & 3 \\ \hline \end{array}\]` +
      " Quale delle seguenti espressioni devi usare per trovare il peso medio dei 30 neonati?",
    suggerimento:
      "Ogni classe si rappresenta con il suo valore centrale (1,5; 2,5; 3,5; 4,5 kg), moltiplicato per il numero di neonati della classe; " +
      "la somma è il peso totale (stimato) dei neonati, e va divisa per il numero dei neonati, 30, non per il numero delle classi.",
    parti: [
      scelta(
        "",
        [
          r`\(\frac{1{,}5 + 2{,}5 + 3{,}5 + 4{,}5}{30}\)`,
          r`\(\frac{7 + 8 + 12 + 3}{4}\)`,
          r`\(\frac{1{,}5 \cdot 7 + 2{,}5 \cdot 8 + 3{,}5 \cdot 12 + 4{,}5 \cdot 3}{30}\)`,
          r`\(\frac{1{,}5 \cdot 7 + 2{,}5 \cdot 8 + 3{,}5 \cdot 12 + 4{,}5 \cdot 3}{4}\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 20,
    slug: "cambio-euro-dollaro",
    titolo: "Il cambio euro-dollaro",
    ambito: "Relazioni e funzioni",
    temi: ["lettura di grafici", "proporzionalità", "cambio di valuta"],
    difficolta: 2,
    adattamento: "Nella parte b la giustificazione si sceglie fra quelle proposte invece di scriverla.",
    testo:
      "Il grafico rappresenta l'andamento del cambio euro-dollaro (quanti dollari vale 1 euro) nel periodo 3 settembre 2009 - 3 marzo 2010. " +
      img("d20", "Grafico «La frenata dell'euro»: 1,42 il 3 settembre, 1,50 il 21 ottobre, 1,51 il 25 novembre, 1,42 il 21 dicembre 2009, 1,45 l'11 gennaio, 1,38 il 28 gennaio, 1,34 il 18 febbraio, 1,37 il 3 marzo 2010"),
    suggerimento:
      "a) e b) Conviene cambiare euro in dollari quando con 1 euro si ottengono più dollari: fra il 21 ottobre e il 25 novembre 2009 il cambio è al massimo (1,50 e 1,51). " +
      r`c) Il 18 febbraio 1 euro vale 1,34 dollari: \(1\,000 \cdot 1{,}34 = 1\,340\) dollari. ` +
      r`d) Servono \(1\,000 : 1{,}34 \approx 746\) euro.`,
    parti: [
      scelta(
        "a) In base al grafico in quale periodo mi sarebbe convenuto cambiare i miei euro in dollari per andare negli Stati Uniti?",
        [
          "Dal 3 settembre al 21 ottobre 2009",
          "Dal 21 ottobre al 25 novembre del 2009",
          "Dall'11 gennaio al 28 gennaio 2010",
          "Dal 18 febbraio al 3 marzo 2010",
        ],
        1,
      ),
      scelta(
        "b) Quale fra le seguenti giustifica la risposta?",
        [
          "In quel periodo con 1 euro si ottenevano più dollari che in tutti gli altri periodi",
          "In quel periodo con 1 dollaro si ottenevano più euro che in tutti gli altri periodi",
          "In quel periodo il valore dell'euro rispetto al dollaro è sceso più rapidamente",
          "In quel periodo il cambio è rimasto quasi costante",
        ],
        0,
      ),
      numerica("c) Se Maria il 18 febbraio 2010 cambia 1 000 euro in dollari, quanti dollari riceve in cambio?", "1340"),
      numerica("d) Sempre lo stesso giorno (18 febbraio), quanti euro deve cambiare Maria per avere 1 000 dollari? Arrotonda all'unità.", "1000/1.34", "0.5"),
    ],
  },
  {
    numero: 21,
    slug: "radice-di-x-quadro",
    titolo: "La radice di x²",
    ambito: "Numeri",
    temi: ["radicali", "valore assoluto"],
    difficolta: 2,
    testo: r`Quale fra le seguenti uguaglianze è corretta, qualunque sia il numero reale che sostituisce la \(x\)?`,
    suggerimento:
      r`La radice quadrata è sempre un numero non negativo. Per \(x = -3\): \(\sqrt{(-3)^2} = \sqrt{9} = 3\), non \(-3\). ` +
      r`Quindi \(\sqrt{x^2} = |x|\) per ogni \(x\) reale; il simbolo \(\pm\) non ha senso, perché la radice dà un solo valore.`,
    parti: [scelta("", [r`\(\sqrt{x^2} = x\)`, r`\(\sqrt{x^2} = \pm x\)`, r`\(\sqrt{x^2} = |x|\)`, r`\(\sqrt{x^2} = \pm |x|\)`], 2)],
  },
  {
    numero: 22,
    slug: "divisibilita-polinomio",
    titolo: "Un polinomio divisibile",
    ambito: "Numeri",
    temi: ["polinomi", "scomposizione", "differenza di quadrati"],
    difficolta: 2,
    testo: r`Il polinomio \(x^4 - 16\) è divisibile per`,
    suggerimento:
      r`È una differenza di quadrati: \(x^4 - 16 = (x^2 - 4)(x^2 + 4) = (x - 2)(x + 2)(x^2 + 4)\). Quindi è divisibile per \(x + 2\). ` +
      r`Si controlla anche con il teorema del resto: per \(x = -2\) vale \(16 - 16 = 0\).`,
    parti: [scelta("", [r`\(x^2 - 8\)`, r`\(x - 4\)`, r`\(x + 2\)`, r`\((x - 2)^2\)`], 2)],
  },
  {
    numero: 23,
    slug: "manifestazione-in-piazza",
    titolo: "La manifestazione in piazza",
    ambito: "Numeri",
    temi: ["stime", "area", "problemi"],
    difficolta: 2,
    adattamento: "Nella parte b i calcoli non si scrivono: si chiede il numero di partecipanti che ne risulta.",
    testo:
      "Le dimensioni di una piazza rettangolare di una grande città sono circa 620 m × 120 m. " +
      "Le stime comparse sui giornali sul numero di partecipanti a una manifestazione che ha riempito la piazza variano da 100 000 a oltre 1 000 000. " +
      "Diverse fotografie scattate durante la manifestazione evidenziano una densità di circa 4 persone al metro quadro.",
    suggerimento:
      r`L'area della piazza è \(620 \cdot 120 = 74\,400\ \text{m}^2\); con 4 persone al metro quadro ci stanno \(74\,400 \cdot 4 = 297\,600\) persone, cioè circa 300 000.`,
    parti: [
      scelta(
        "a) Che cosa si può concludere circa l'effettivo numero dei partecipanti?",
        [
          "Le stime dei giornali sono tutte errate perché dalle informazioni disponibili i partecipanti non potevano essere più di 20 000.",
          "Una stima ragionevole è di circa 300 000 partecipanti.",
          "Ha ragione chi ha parlato di più di un milione di partecipanti.",
          "La piazza non può contenere molte persone più di uno stadio, quindi c'erano meno di 150 000 partecipanti.",
        ],
        1,
      ),
      numerica("b) Quanti partecipanti risultano dai tuoi calcoli?", "297600", "3000"),
    ],
  },
  {
    numero: 24,
    slug: "la-molla",
    titolo: "La molla",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "formule", "modellizzazione"],
    difficolta: 2,
    testo:
      r`La formula \(l = l_0 + k \cdot P\) esprime la lunghezza \(l\) di una molla al variare del peso \(P\) applicato. \(l_0\) rappresenta la lunghezza in centimetri «a riposo» della molla; ` +
      r`\(k\) indica di quanto si allunga in centimetri la molla quando si applica una unità di peso. ` +
      "Quale delle formule elencate si adatta meglio alla seguente descrizione: «È una molla molto lunga e molto resistente alla trazione»?",
    suggerimento:
      r`Molto lunga: \(l_0\) grande (70 o 75 cm, non 15). Molto resistente alla trazione: si allunga pochissimo per ogni unità di peso, cioè \(k\) piccolo. ` +
      r`Fra le molle lunghe, quella con \(k = 0{,}01\) è \(l = 70 + 0{,}01 \cdot P\).`,
    parti: [
      scelta(
        "",
        [r`\(l = 15 + 0{,}5 \cdot P\)`, r`\(l = 75 + 7 \cdot P\)`, r`\(l = 70 + 0{,}01 \cdot P\)`, r`\(l = 60 + 6 \cdot P\)`],
        2,
      ),
    ],
  },
  {
    numero: 25,
    slug: "iva-del-computer",
    titolo: "L'IVA del computer",
    ambito: "Numeri",
    temi: ["percentuali"],
    difficolta: 2,
    testo:
      "Per l'acquisto di un computer sono stati spesi 300 euro. Il prezzo è composto dal costo base più l'IVA, pari al 20% del costo base. Quanto è stato pagato di IVA?",
    suggerimento:
      r`Il prezzo pagato è il 120% del costo base: costo base \(= 300 : 1{,}2 = 250\) euro, e l'IVA è \(300 - 250 = 50\) euro (il 20% di 250). ` +
      "Attenzione: il 20% di 300 (60 euro) è sbagliato, perché l'IVA si calcola sul costo base, non sul prezzo finale.",
    parti: [numerica("IVA, in euro:", "50")],
  },
  {
    numero: 26,
    slug: "foglio-elettronico",
    titolo: "Il foglio elettronico",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni", "radicali", "tabelle"],
    difficolta: 2,
    adattamento: "Le due colonne del foglio elettronico sono riscritte come tabella.",
    testo:
      r`Nelle prime due colonne di un foglio elettronico sono state calcolate alcune coppie di valori \((x, y)\) di una funzione. ` +
      r`\[\begin{array}{|c|c|} \hline x & y \\ \hline 1 & 0 \\ \hline 2 & 1 \\ \hline 5 & 2 \\ \hline 10 & 3 \\ \hline 17 & 4 \\ \hline 26 & 5 \\ \hline 37 & 6 \\ \hline \end{array}\]` +
      r`Quale tra le seguenti è la funzione di cui sono stati calcolati i valori \((x, y)\)?`,
    suggerimento:
      r`Ogni \(x\) è uno più di un quadrato: \(x - 1 = 0, 1, 4, 9, 16, 25, 36\), e \(y\) è la radice di quel quadrato. Quindi \(y = \sqrt{x - 1}\). ` +
      r`Basta una prova per scartare le altre: per \(x = 1\), \(\sqrt{x} - 1 = 0\) va bene, ma per \(x = 2\) dà \(\sqrt{2} - 1 \approx 0{,}41\), non 1.`,
    parti: [scelta("", [r`\(y = \sqrt{x} - 1\)`, r`\(y = \sqrt{x + 1}\)`, r`\(y = \sqrt{x - 1}\)`, r`\(y = 1 + \sqrt{x}\)`], 2)],
  },
  {
    numero: 27,
    slug: "la-commessa",
    titolo: "La commessa",
    ambito: "Relazioni e funzioni",
    temi: ["formule", "percentuali", "modellizzazione"],
    difficolta: 1,
    testo:
      r`Carlotta, nel periodo di Natale, lavora come commessa in un negozio di calzature e guadagna 8 euro all'ora più una commissione del 5% sul ricavo totale delle scarpe che riesce a vendere. ` +
      r`Quale formula esprime il suo guadagno \(g\), se lavora \(h\) ore e vende scarpe per un valore totale di \(s\) euro?`,
    suggerimento: r`Per le ore guadagna \(8h\); il 5% di \(s\) è \(\frac{5}{100}s = 0{,}05s\). Quindi \(g = 8h + 0{,}05s\).`,
    parti: [scelta("", [r`\(g = 8h + 0{,}05s\)`, r`\(g = 8h + 0{,}5s\)`, r`\(g = 5h + 8s\)`, r`\(g = 8h + 5s\)`], 0)],
  },
  {
    numero: 28,
    slug: "torneo-di-calcio",
    titolo: "Il torneo di calcio",
    ambito: "Numeri",
    temi: ["multipli", "problemi"],
    difficolta: 2,
    testo:
      "In un torneo di calcio fra scuole una squadra guadagna 3 punti se vince, 1 punto se pareggia e nessun punto se perde. " +
      "Una squadra ha vinto tante partite quante ne ha pareggiate. Quale dei seguenti punteggi NON può aver totalizzato la squadra?",
    suggerimento:
      r`Se la squadra ha vinto \(v\) partite e ne ha pareggiate altrettante, ha \(3v + v = 4v\) punti: il punteggio è un multiplo di 4. ` +
      r`24, 28 e 32 lo sono (\(v = 6, 7, 8\)), 30 no.`,
    parti: [scelta("", ["24", "28", "30", "32"], 2)],
  },
  {
    numero: 29,
    slug: "frazioni-decimali",
    titolo: "Frazioni decimali",
    ambito: "Numeri",
    temi: ["numeri decimali", "potenze di 10"],
    difficolta: 2,
    testo: r`L'espressione \(\frac{9}{10} + \frac{8}{10^2} + \frac{7}{10^4} + \frac{2}{10^5}\) si può rappresentare mediante il numero decimale`,
    suggerimento:
      r`Ogni frazione è una cifra in una posizione: 9 decimi, 8 centesimi, 0 millesimi (manca \(\frac{\ldots}{10^3}\)), 7 decimillesimi, 2 centomillesimi: ` +
      r`\(0{,}9 + 0{,}08 + 0{,}0007 + 0{,}00002 = 0{,}98072\).`,
    parti: [scelta("", ["98,72", "9,8072", "0,9872", "0,98072"], 3)],
  },
  {
    numero: 30,
    slug: "trasformazione-quadrilatero",
    titolo: "Quale trasformazione?",
    ambito: "Spazio e figure",
    temi: ["trasformazioni geometriche", "simmetria", "piano cartesiano"],
    difficolta: 1,
    testo:
      "Il quadrilatero A'B'C'D' è ottenuto applicando al quadrilatero ABCD una trasformazione. " +
      img("d30", "Il quadrilatero ABCD sopra l'asse x e il quadrilatero A'B'C'D' sotto, capovolto: ogni vertice ha la stessa ascissa e l'ordinata opposta") +
      " Di quale trasformazione si tratta?",
    suggerimento:
      "Ogni vertice ha la sua immagine sulla stessa verticale, alla stessa distanza dall'asse x ma dall'altra parte (C è il più in alto, C' il più in basso): la figura è ribaltata rispetto all'asse x. " +
      "Una traslazione non la capovolgerebbe; la simmetria rispetto all'asse y la porterebbe a sinistra; una rotazione attorno all'origine (di mezzo giro) scambierebbe anche destra e sinistra.",
    parti: [scelta("", ["Traslazione", "Simmetria rispetto all'asse y", "Simmetria rispetto all'asse x", "Rotazione attorno all'origine"], 2)],
  },
];

export const PACCHETTO_INVALSI_2011: EsercizioPacchetto[] = creaPacchetto({ anno: 2011, annoScolastico: "2010/11" }, DOMANDE);

if (lanciatoDirettamente(import.meta.url)) {
  scriviPacchetto(PACCHETTO_INVALSI_2011);
}
