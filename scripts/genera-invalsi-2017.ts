/**
 * La prova INVALSI di matematica 2016/17 (classe seconda della secondaria di
 * secondo grado, fascicolo 1): 32 domande, una per esercizio, nei file
 * `content/esercizi/invalsi-2017-dNN-*.json`.
 *
 * Le regole comuni a tutte le prove sono in `scripts/invalsi/comune.ts`.
 * I file JSON NON si correggono a mano: si corregge qui e si rigenera con
 *
 *     npx tsx scripts/genera-invalsi-2017.ts
 *
 * `src/lib/esercizi/__tests__/pacchetto-invalsi-2017.test.ts` controlla che i
 * file su disco coincidano con quello che questo script produce, che reggano
 * la verifica a venti semi e che le risposte giuste prendano tutti i punti.
 *
 * Scelte di trascrizione:
 * - i grafici a barre con i valori scritti sopra le barre (D10, D26) sono
 *   diventati tabelle; la retta della D21 è ridisegnata con i grafici di
 *   funzione; le altre figure sono ritagliate dal fascicolo;
 * - le domande da argomentare (D4 b, D16 c) o da elencare (D20 a) sono
 *   diventate a scelta; i numeri da posizionare sulla retta (D6) si indicano
 *   con il numero della tacca; la formula con un coefficiente decimale (D16 b)
 *   si sceglie fra quattro; i completamenti a scelta (D15, D16 a) sono
 *   domande a scelta, una per spazio. La descrizione lo dice.
 */
import {
  creaPacchetto,
  espressione,
  img as immagine,
  lanciatoDirettamente,
  numerica,
  r,
  scelta,
  sceltaMultipla,
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
  d02a: "5ff9eb77-e05e-4baa-afac-629395d8079d.png",
  d02b: "58a9a27a-afe9-4ea4-876d-f5886e7fa3f5.png",
  d04: "d06920af-605b-44c4-9229-8dde94648de7.png",
  d05: "074b97c8-640b-47fc-8906-dc71300c9ace.png",
  d06: "acc32924-9b55-4585-a298-fee446013fa6.png",
  d07: "0d01db14-be16-4b8b-9fcf-128e679ded44.png",
  d09: "cb6223c6-5b26-4038-a22b-daece54ec226.png",
  d12: "fe98d5fc-2e6e-46e3-82ad-36473275e99a.png",
  d15: "fa56b0bc-a471-4458-aa10-70eb9689a910.png",
  d16: "b057b05a-7737-429d-a1b0-ac9872ba4a22.png",
  d17: "8263a799-e8a9-4234-898b-f4d303322f3c.png",
  d18: "fa1dcbfa-5459-4e55-b9a7-99afff5c80fe.png",
  d19: "76fadded-94dd-4807-b254-b0da1e56624b.png",
  d23: "cfedc487-3ecb-4aaf-8879-f92752be7226.png",
  d25: "50595593-95b9-442b-8097-f23a75f20c23.png",
} as const;

const img = (chiave: keyof typeof IMMAGINE, descrizione: string) => immagine(IMMAGINE[chiave], descrizione);

const TERMINI_D15 = ["supplementari", "alterni interni", "opposti al vertice", "complementari", "interni di un triangolo"];
const GRADI_D15 = ["180°", "90°", "45°", "360°"];

const DOMANDE: Domanda[] = [
  {
    numero: 1,
    slug: "conferenza",
    titolo: "Donne e uomini alla conferenza",
    ambito: "Numeri",
    temi: ["problemi", "equazioni"],
    difficolta: 1,
    testo: "A una conferenza sono presenti 90 persone. Le donne sono 14 più degli uomini. Quanti sono gli uomini?",
    suggerimento:
      r`Se gli uomini sono \(x\), le donne sono \(x + 14\): \(x + x + 14 = 90\), cioè \(2x = 76\) e \(x = 38\). Infatti le donne sono 52 e \(38 + 52 = 90\). (76 è il doppio degli uomini, non gli uomini.)`,
    parti: [scelta("", ["59", "38", "31", "76"], 1)],
  },
  {
    numero: 2,
    slug: "alberi-trattati",
    titolo: "Gli alberi trattati",
    ambito: "Dati e previsioni",
    temi: ["istogrammi", "percentuali", "lettura di grafici"],
    difficolta: 2,
    testo:
      "In un parco, da alcuni anni, viene somministrato un prodotto a una certa specie di alberi per eliminare un parassita che ne causa la morte. " +
      "I grafici rappresentano il numero di alberi sottoposti a trattamento negli anni indicati e il numero di alberi completamente guariti nello stesso anno del trattamento. " +
      img("d02a", "Istogramma del numero di alberi trattati: 700 nel 2005, 1000 nel 2006, 700 nel 2007, 800 nel 2008, 600 nel 2009") +
      " " +
      img("d02b", "Istogramma del numero di alberi guariti: circa 325 nel 2005, 400 nel 2006, 360 nel 2007, 360 nel 2008, 300 nel 2009"),
    suggerimento:
      r`a) Trattamenti: \(700 + 1000 + 700 + 800 + 600 = 3800\). Vera. ` +
      r`b) Nel 2009 sono guariti \(300\) alberi su \(600\), il 50%; nel 2006 \(400\) su \(1000\), il 40%: la percentuale del 2009 è maggiore. Falsa. ` +
      r`c) Nel 2005 sono guariti circa 325 alberi su 700; il 40% di 700 è 280, e 325 è di più (circa il 46%). Falsa.`,
    parti: [
      veroFalso(
        [
          "Nei cinque anni sono stati effettuati circa 3 800 trattamenti",
          "Nel 2009 la percentuale di alberi guariti rispetto a quelli trattati è inferiore a quella del 2006",
          "Nel 2005 è guarito meno del 40% degli alberi trattati",
        ],
        [true, false, false],
        "Sulla base dei dati riportati nei grafici indica se ciascuna delle seguenti affermazioni è vera o falsa.",
      ),
    ],
  },
  {
    numero: 3,
    slug: "lastra-di-alluminio",
    titolo: "La lastra di alluminio",
    ambito: "Dati e previsioni",
    temi: ["indici statistici", "media"],
    difficolta: 1,
    testo:
      "Con una bilancia si è misurata 10 volte la massa di una lastra di alluminio ottenendo le seguenti misure in chilogrammi: " +
      r`\[10{,}55 \quad 10{,}76 \quad 10{,}60 \quad 10{,}87 \quad 10{,}64 \quad 10{,}67 \quad 10{,}84 \quad 10{,}46 \quad 10{,}55 \quad 10{,}70\]` +
      " Quale fra i seguenti indici statistici è quello più adatto a rappresentare la massa della lastra di alluminio?",
    suggerimento:
      "Le misure ripetute di una stessa grandezza si sintetizzano con la media aritmetica, che compensa gli errori per eccesso e per difetto. " +
      "La moda (10,55) dipende da una sola coincidenza; varianza e scarto quadratico medio misurano quanto le misure sono disperse, non la massa.",
    parti: [scelta("", ["La moda", "La media aritmetica", "La varianza", "Lo scarto quadratico medio (o deviazione standard)"], 1)],
  },
  {
    numero: 4,
    slug: "due-treni",
    titolo: "Due treni",
    ambito: "Relazioni e funzioni",
    temi: ["grafici", "moto rettilineo uniforme", "lettura di grafici"],
    difficolta: 2,
    adattamento: "Nella parte b la motivazione andava scritta: qui si sceglie fra motivazioni proposte.",
    testo:
      r`In figura sono rappresentati i grafici della posizione \(s\) (in km) in funzione del tempo \(t\) (in minuti) di due treni in moto rettilineo uniforme su due binari paralleli. ` +
      img("d04", "Due rette nel piano t (minuti), s (km): una sale da (0; 0) a (60; 120), l'altra scende da (0; 120) a (40; 0); si incontrano vicino a (24; 48)"),
    suggerimento:
      r`Un treno va da \(s = 0\) a \(s = 120\) km in 60 minuti (2 km al minuto), l'altro da \(s = 120\) a \(s = 0\) in 40 minuti (3 km al minuto). ` +
      r`a1) Uno si allontana dall'origine e l'altro si avvicina: versi opposti, vera. ` +
      r`a2) Le rette si incontrano a \(t = 24\) minuti, cioè circa 25: vera. ` +
      r`a3) A \(t = 30\) il primo treno ha percorso 60 km, il secondo è nella posizione 30 km ma ha percorso \(120 - 30 = 90\) km: falsa. ` +
      "b) Le due rette hanno pendenze diverse: i treni hanno velocità diverse (2 km/min e 3 km/min), quindi nello stesso tempo percorrono distanze diverse.",
    parti: [
      veroFalso(
        [
          "I due treni si muovono in versi opposti",
          r`Dopo circa 25 minuti dall'istante \(t = 0\) i due treni passano per la stessa posizione nel sistema di riferimento scelto`,
          r`Dopo 30 minuti dall'istante \(t = 0\), uno dei due treni ha percorso circa 30 km`,
        ],
        [true, true, false],
        "a) Basandoti sulle informazioni fornite nei grafici, indica se ciascuna affermazione è vera o falsa.",
      ),
      scelta(
        "b) Anna afferma che, in uno stesso intervallo di tempo, i due treni percorrono la stessa distanza. Anna ha torto. Perché?",
        [
          "Perché i due treni si muovono in versi opposti",
          "Perché i due treni hanno velocità diverse: le due rette hanno pendenze diverse (in valore assoluto)",
          "Perché i due treni partono da posizioni diverse",
          "Perché i due treni si incontrano dopo circa 25 minuti",
        ],
        1,
      ),
    ],
  },
  {
    numero: 5,
    slug: "cartoncino",
    titolo: "La foto sul cartoncino",
    ambito: "Spazio e figure",
    temi: ["area", "rettangolo"],
    difficolta: 1,
    testo:
      "Franco incolla una fotografia rettangolare di dimensioni 22 cm × 15 cm su un cartoncino. Attorno alla fotografia resta una cornice larga 3 cm, come vedi in figura. " +
      img("d05", "Una fotografia rettangolare incollata su un cartoncino, con una cornice di 3 cm su tutti e quattro i lati") +
      " Qual è l'area del cartoncino?",
    suggerimento:
      r`La cornice di 3 cm c'è su entrambi i lati: il cartoncino misura \((22 + 6) \times (15 + 6) = 28 \times 21\) cm, e \(28 \cdot 21 = 588\text{ cm}^2\).`,
    parti: [scelta("", [r`\(588\text{ cm}^2\)`, r`\(525\text{ cm}^2\)`, r`\(504\text{ cm}^2\)`, r`\(450\text{ cm}^2\)`], 0)],
  },
  {
    numero: 6,
    slug: "numeri-sulla-retta",
    titolo: "Numeri sulla retta",
    ambito: "Numeri",
    temi: ["retta numerica", "frazioni", "numeri decimali"],
    difficolta: 1,
    adattamento: "Nel fascicolo i numeri andavano segnati sulla retta: qui si indica il numero della tacca.",
    testo:
      r`Posiziona sulla retta i seguenti numeri: \[4 \qquad 2{,}5 \qquad \frac{3}{2} \qquad \frac{5}{10}\]` +
      img("d06", "Una retta orientata con nove tacche equidistanti; sotto la prima c'è 0, sotto la terza 1, sotto la settima 3") +
      " Numera le tacche da sinistra a destra partendo da 0: la tacca dello 0 è la numero 0, quella successiva la numero 1, e così via.",
    suggerimento:
      r`Fra 0 e 1 ci sono due intervalli: ogni tacca vale \(0{,}5\), e la tacca numero \(k\) rappresenta \(k \cdot 0{,}5\). ` +
      r`Quindi \(4\) va sulla tacca 8 (l'ultima), \(2{,}5\) sulla 5, \(\frac{3}{2} = 1{,}5\) sulla 3, \(\frac{5}{10} = 0{,}5\) sulla 1.`,
    parti: [
      numerica("Su quale tacca va il numero 4?", "8"),
      numerica("Su quale tacca va il numero 2,5?", "5"),
      numerica(r`Su quale tacca va il numero \(\frac{3}{2}\)?`, "3"),
      numerica(r`Su quale tacca va il numero \(\frac{5}{10}\)?`, "1"),
    ],
  },
  {
    numero: 7,
    slug: "citta-del-portogallo",
    titolo: "Città del Portogallo",
    ambito: "Spazio e figure",
    temi: ["disuguaglianza triangolare", "distanze"],
    difficolta: 2,
    testo:
      "Sulla cartina geografica sono indicate alcune città del Portogallo. Tra di esse ci sono: Lisbona (in portoghese Lisboa), Coimbra (a circa 180 km in linea d'aria da Lisbona) e Beja (a circa 140 km in linea d'aria da Lisbona). " +
      img("d07", "Cartina del Portogallo con le città di Lisboa, Coimbra (a nord di Lisbona) e Beja (a sud-est di Lisbona)") +
      " La distanza in linea d'aria tra Beja e Coimbra è",
    suggerimento:
      r`Lisbona, Coimbra e Beja sono i vertici di un triangolo: ogni lato è minore della somma degli altri due e maggiore della loro differenza. ` +
      r`Quindi la distanza Beja–Coimbra sta fra \(180 - 140 = 40\) km e \(180 + 140 = 320\) km (sarebbe 40 o 320 solo se le tre città fossero allineate).`,
    parti: [
      scelta(
        "",
        ["circa 320 km", "circa 40 km", "sicuramente maggiore di 40 km e minore di 320 km", "sicuramente maggiore di 320 km e minore di 500 km"],
        2,
      ),
    ],
  },
  {
    numero: 8,
    slug: "sacchetti-di-caramelle",
    titolo: "Sacchetti di caramelle",
    ambito: "Numeri",
    temi: ["problemi", "divisione"],
    difficolta: 1,
    testo:
      "Un sacchetto di caramelle contiene 15 caramelle alla menta e 25 caramelle al limone. Con 100 caramelle alla menta e 180 caramelle al limone, qual è il numero massimo di sacchetti con la stessa composizione del precedente che si possono riempire?",
    suggerimento:
      r`Con la menta: \(100 : 15 \approx 6{,}7\), bastano per 6 sacchetti. Con il limone: \(180 : 25 = 7{,}2\), bastano per 7. ` +
      r`Comanda la menta: 6 sacchetti (\(6 \cdot 15 = 90\) alla menta e \(6 \cdot 25 = 150\) al limone).`,
    parti: [numerica("Numero di sacchetti:", "6")],
  },
  {
    numero: 9,
    slug: "due-quadrati",
    titolo: "Due quadrati",
    ambito: "Spazio e figure",
    temi: ["perimetro", "quadrato", "rettangolo"],
    difficolta: 1,
    testo:
      "Il rettangolo AFED è formato da due quadrati congruenti ABCD e BFEC con un lato in comune. " +
      img("d09", "Il rettangolo AFED diviso dal segmento BC nei due quadrati ABCD e BFEC") +
      " Il perimetro di ciascuno dei quadrati misura 36 cm. Quanto misura il perimetro del rettangolo AFED?",
    suggerimento:
      r`Il lato di ogni quadrato è \(36 : 4 = 9\) cm. Il rettangolo è lungo \(18\) cm e alto \(9\) cm: perimetro \(2 \cdot (18 + 9) = 54\) cm. ` +
      r`(Non è \(2 \cdot 36 = 72\): il lato comune BC non fa parte del contorno.)`,
    parti: [numerica("Perimetro di AFED, in cm:", "54")],
  },
  {
    numero: 10,
    slug: "e-book-reader",
    titolo: "Gli e-book reader",
    ambito: "Dati e previsioni",
    temi: ["media", "istogrammi"],
    difficolta: 2,
    adattamento: "Il grafico a barre è riportato come tabella, con i valori scritti sulle barre.",
    testo:
      "Il grafico riporta il numero di e-book reader (lettori di libri elettronici) venduti nei mesi di luglio, agosto e settembre da un negozio di informatica. Negli altri nove mesi dell'anno lo stesso negozio ha venduto in media 18 e-book reader al mese. " +
      r`\[\begin{array}{|c|c|} \hline \text{Mese} & \text{E-book reader venduti} \\ \hline \text{luglio} & 28 \\ \hline \text{agosto} & 34 \\ \hline \text{settembre} & 30 \\ \hline \end{array}\]` +
      " Qual è il numero medio mensile di e-book reader venduti in quell'anno dal negozio?",
    suggerimento:
      r`In tutto l'anno: \(28 + 34 + 30 = 92\) nei tre mesi estivi e \(9 \cdot 18 = 162\) negli altri nove, cioè \(254\). La media mensile è \(254 : 12 \approx 21\). ` +
      r`(Non si fa la media fra 18 e la media estiva: i mesi sono 9 e 3, non pesano uguale.)`,
    parti: [scelta("", ["Circa 31", "Circa 28", "Circa 21", "Circa 24"], 2)],
  },
  {
    numero: 11,
    slug: "produzione-azienda",
    titolo: "La produzione dell'azienda",
    ambito: "Numeri",
    temi: ["percentuali", "tabelle"],
    difficolta: 2,
    testo:
      "La seguente tabella indica di quanto è aumentata ogni anno in percentuale la produzione di un'azienda rispetto all'anno precedente negli anni dal 2010 al 2015. " +
      r`\[\begin{array}{|c|c|} \hline \text{Anno} & \text{Aumento percentuale annuo} \\ \hline 2010 & +2\% \\ \hline 2011 & +5\% \\ \hline 2012 & +12\% \\ \hline 2013 & +8\% \\ \hline 2014 & +4\% \\ \hline 2015 & +8\% \\ \hline \end{array}\]`,
    suggerimento:
      "Ogni anno la produzione aumenta rispetto all'anno prima: la tabella dice di quanto, non quanto si produce. " +
      "a) Nel 2013 la produzione è aumentata dell'8% (è aumentata meno che nel 2012, ma è aumentata): falsa. " +
      "b) Raddoppiare vorrebbe dire +100%; nel 2015 è +8%: falsa. " +
      "c) La produzione cresce ogni anno, quindi il massimo è nell'ultimo anno, il 2015: vera.",
    parti: [
      veroFalso(
        [
          "Dal 2012 al 2013 la produzione è diminuita",
          "Dal 2014 al 2015 la produzione è raddoppiata",
          "Nel periodo 2010 - 2015 il massimo di produzione si è avuto nel 2015",
        ],
        [false, false, true],
        "Basandoti sui dati della tabella indica se ciascuna affermazione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 12,
    slug: "tredici-quadrati",
    titolo: "Tredici quadrati",
    ambito: "Spazio e figure",
    temi: ["area", "similitudine"],
    difficolta: 2,
    testo:
      "La seguente figura è composta da 13 quadrati tutti di lato 1 cm. " +
      img("d12", "Una figura a croce formata da 13 quadratini uguali: righe di 1, 3, 5, 3, 1 quadratini") +
      r` Se il lato di ciascun quadrato si dimezza, quanto diventa la superficie della figura, in \(\text{cm}^2\)?`,
    suggerimento:
      r`Un quadrato di lato \(\frac{1}{2}\) cm ha area \(\frac{1}{2} \cdot \frac{1}{2} = \frac{1}{4}\text{ cm}^2\): dimezzando il lato l'area diventa un quarto, non la metà. ` +
      r`La figura: \(13 \cdot \frac{1}{4} = 3{,}25\text{ cm}^2\).`,
    parti: [numerica(r`Superficie, in \(\text{cm}^2\):`, "3.25")],
  },
  {
    numero: 13,
    slug: "retta-per-un-punto",
    titolo: "La retta per un punto",
    ambito: "Spazio e figure",
    temi: ["retta", "piano cartesiano"],
    difficolta: 1,
    testo: r`Considera l'equazione \(y = 2x + k\). Per quale valore di \(k\) essa rappresenta una retta che passa per il punto di coordinate \((1; 5)\)?`,
    suggerimento: r`Il punto sta sulla retta se le sue coordinate soddisfano l'equazione: \(5 = 2 \cdot 1 + k\), quindi \(k = 3\).`,
    parti: [numerica(r`\(k =\)`, "3")],
  },
  {
    numero: 14,
    slug: "contratto-editoriale",
    titolo: "Il contratto dell'autore",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "modellizzazione", "percentuali"],
    difficolta: 2,
    testo:
      "Una casa editrice propone all'autore di un libro di scegliere uno tra due diversi tipi di contratto relativi al suo compenso. " +
      "Contratto forfettario: compenso di 50 000 €, indipendentemente dal numero di copie vendute. " +
      "Contratto a partecipazione: compenso di 5 000 € a cui si aggiunge il 10% del prezzo di copertina per ogni copia venduta. " +
      "Il prezzo di copertina del libro è di 30 €.",
    suggerimento:
      r`Il 10% di 30 € è 3 €: con il contratto a partecipazione l'autore prende 5000 € più 3 € per copia. ` +
      r`a) 0 copie: 5000 €; 1000 copie: \(5000 + 3000 = 8000\) €; 2000 copie: \(5000 + 6000 = 11\,000\) €. ` +
      r`b) \(C = 5000 + 3n\). ` +
      r`c) \(5000 + 3n = 50\,000\), cioè \(3n = 45\,000\) e \(n = 15\,000\) copie.`,
    parti: [
      numerica("a) L'autore sceglie il contratto a partecipazione. Completa la tabella. Compenso per l'autore (in euro) con 0 copie vendute:", "5000"),
      numerica("Con 1000 copie vendute:", "8000"),
      numerica("Con 2000 copie vendute:", "11000"),
      espressione(
        r`b) Scrivi la formula che esprime il compenso \(C\) (in euro) dell'autore in funzione del numero \(n\) di copie vendute nel caso del contratto a partecipazione. \(C =\)`,
        "5000 + 3*n",
      ),
      numerica(
        "c) Qual è il numero di copie che devono essere vendute perché il compenso ottenuto con il contratto a partecipazione sia uguale a quello ottenuto con il contratto forfettario?",
        "15000",
      ),
    ],
  },
  {
    numero: 15,
    slug: "angolo-boc",
    titolo: "L'angolo BOC",
    ambito: "Spazio e figure",
    temi: ["dimostrazioni", "triangoli", "angoli", "circonferenza inscritta"],
    difficolta: 3,
    adattamento: "Ogni spazio della dimostrazione è una domanda a scelta fra i termini proposti dal fascicolo.",
    testo:
      r`\(ABC\) è un triangolo rettangolo di ipotenusa \(BC\) e \(O\) è il centro della circonferenza inscritta nel triangolo. ` +
      img("d15", "Il triangolo ABC rettangolo in A con la circonferenza inscritta di centro O; sono tracciati i segmenti OC e OB e segnato l'angolo BOC") +
      r` Si vuole dimostrare che l'ampiezza dell'angolo \(B\hat{O}C\) è 135°. Completa il testo della dimostrazione scegliendo i termini; ogni termine può essere utilizzato una sola volta. ` +
      r`\[\begin{array}{l} \text{Il centro } O \text{ della circonferenza inscritta è il punto di incontro delle bisettrici} \\ \text{degli angoli interni del triangolo } ABC. \\ \text{Gli angoli } A\hat{C}B \text{ e } A\hat{B}C \text{ sono } \ldots(1)\ldots \text{, cioè la loro somma misura } \ldots(2)\ldots \\ \text{perché sono angoli acuti di un triangolo rettangolo. Per quanto affermato in precedenza} \\ \text{la somma degli angoli } O\hat{C}B \text{ e } O\hat{B}C \text{ misura } \ldots(3)\ldots \\ \text{Quindi, poiché la somma degli angoli } \ldots(4)\ldots \text{ misura } \ldots(5)\ldots \\ \text{possiamo concludere che } B\hat{O}C = 135^\circ\text{, che è la tesi.} \end{array}\]`,
    suggerimento:
      r`Gli angoli acuti di un triangolo rettangolo sono complementari: \(A\hat{C}B + A\hat{B}C = 90^\circ\). ` +
      r`\(OC\) e \(OB\) sono bisettrici, quindi \(O\hat{C}B + O\hat{B}C\) è la metà: \(45^\circ\). ` +
      r`Nel triangolo \(BOC\) la somma degli angoli interni di un triangolo è \(180^\circ\): \(B\hat{O}C = 180^\circ - 45^\circ = 135^\circ\).`,
    parti: [
      scelta("Spazio (1):", TERMINI_D15, 3),
      scelta("Spazio (2):", GRADI_D15, 1),
      scelta("Spazio (3):", GRADI_D15, 2),
      scelta("Spazio (4):", TERMINI_D15, 4),
      scelta("Spazio (5):", GRADI_D15, 0),
    ],
  },
  {
    numero: 16,
    slug: "tariffe-telefoniche",
    titolo: "Tre tariffe telefoniche",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "grafici", "modellizzazione"],
    difficolta: 2,
    adattamento: "La tabella della parte a è diventata una domanda a scelta per tariffa; nella parte b la formula si sceglie fra quattro (ha un coefficiente decimale); nella parte c la motivazione si sceglie fra quelle proposte.",
    testo:
      "Nel 2008 un gestore telefonico aveva proposto a Marcella tre possibili tariffe mensili per le telefonate nazionali da telefono fisso. " +
      "Tariffa 1: telefonate a 26 centesimi di euro l'una. Tariffa 2: 30 euro con chiamate illimitate senza ulteriore spesa. Tariffa 3: 10 euro di spesa fissa più 15 centesimi di euro per ogni telefonata. " +
      r`In figura sono disegnati i grafici che rappresentano le tre tariffe: in ascissa è riportato il numero \(n\) di telefonate e in ordinata il costo \(C\) in euro. ` +
      img("d16", "Tre grafici nel piano n, C: F è la retta orizzontale C = 30; G parte da C = 10 e sale lentamente; H parte dall'origine e sale più ripida, incontrando G a circa n = 90 e F a circa n = 115"),
    suggerimento:
      r`a) La tariffa 2 costa sempre 30 €: retta orizzontale F. La tariffa 1 parte da 0 € (nessuna telefonata, nessuna spesa): retta H dall'origine. La tariffa 3 parte da 10 €: retta G. ` +
      r`b) 10 euro fissi più 0,15 euro a telefonata: \(C = 10 + 0{,}15n\). ` +
      r`c) La tariffa 1 è la più conveniente solo per poche telefonate: \(0{,}26n > 10 + 0{,}15n\) per \(n > 90\) circa, e \(0{,}26n > 30\) per \(n > 115\) circa. Dove H sta sopra G (e poi sopra F), la tariffa 1 costa di più.`,
    parti: [
      scelta("a) Quale grafico rappresenta la tariffa 1?", ["Grafico F", "Grafico G", "Grafico H"], 2),
      scelta("Quale grafico rappresenta la tariffa 2?", ["Grafico F", "Grafico G", "Grafico H"], 0),
      scelta("Quale grafico rappresenta la tariffa 3?", ["Grafico F", "Grafico G", "Grafico H"], 1),
      scelta(
        r`b) Le formule \(C = 0{,}26n\) (tariffa 1) e \(C = 30\) (tariffa 2) esprimono il costo \(C\) (in euro) in funzione del numero \(n\) di telefonate. Qual è la formula per la tariffa 3?`,
        [r`\(C = 0{,}15 + 10n\)`, r`\(C = 10 + 0{,}15n\)`, r`\(C = 10 + 15n\)`, r`\(C = 10{,}15n\)`],
        1,
      ),
      scelta(
        "c) Marcella dice che, qualunque sia il numero di telefonate, la tariffa 1 costa sempre meno delle altre due. Marcella ha torto. Perché?",
        [
          "Perché la tariffa 1 non ha una spesa fissa",
          "Perché oltre circa 90 telefonate il grafico H sta sopra il grafico G: con molte telefonate la tariffa 1 costa più della tariffa 3 (e oltre circa 115 anche più della tariffa 2)",
          "Perché la tariffa 2 costa sempre meno delle altre due",
          "Perché con poche telefonate la tariffa 1 costa più della tariffa 3",
        ],
        1,
      ),
    ],
  },
  {
    numero: 17,
    slug: "gara-motociclistica",
    titolo: "La gara motociclistica",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "diagramma ad albero"],
    difficolta: 2,
    testo:
      "In una gara motociclistica la moto M ha probabilità di vincere la gara 0,3 se il terreno è bagnato e 0,6 se il terreno è asciutto. La probabilità che il giorno della gara il terreno sia asciutto è 0,2. " +
      img("d17", "Diagramma ad albero: terreno bagnato con probabilità 0,8, poi vince 0,3 e perde 0,7; terreno asciutto con probabilità 0,2, poi vince 0,6 e perde 0,4") +
      r` Il diagramma può aiutare a determinare, per esempio, la probabilità che il terreno sia asciutto e che la moto M perda la gara. Essa è \(0{,}2 \cdot 0{,}4 = 0{,}08\).`,
    suggerimento:
      r`La moto vince lungo due rami: terreno bagnato e vince, \(0{,}8 \cdot 0{,}3 = 0{,}24\); terreno asciutto e vince, \(0{,}2 \cdot 0{,}6 = 0{,}12\). ` +
      r`I due casi si escludono, quindi si sommano: \(0{,}24 + 0{,}12 = 0{,}36\).`,
    parti: [numerica("Qual è la probabilità che la moto M vinca la gara? Scrivi il risultato come numero decimale.", "0.36")],
  },
  {
    numero: 18,
    slug: "n-per-k",
    titolo: "n per k",
    ambito: "Numeri",
    temi: ["numeri relativi", "retta numerica", "stime"],
    difficolta: 2,
    testo:
      "Sulla seguente retta orientata sono riportati alcuni numeri. " +
      img("d18", "Una retta orientata con i numeri −4, −3, −2, −1, 0, 1; il punto p è poco a destra di −3, il punto n è poco a sinistra di 1") +
      r` Se moltiplichi \(n\) per un numero indicato con \(k\) ottieni come risultato \(p\), cioè \(n \cdot k = p\). Quale tra i seguenti può essere il valore di \(k\)?`,
    suggerimento:
      r`\(n\) è positivo e un po' minore di 1 (circa \(0{,}75\)), \(p\) è negativo e vale circa \(-3\). Per passare da un positivo a un negativo \(k\) deve essere negativo; ` +
      r`e siccome \(|p|\) è circa 4 volte \(n\), \(k = -4\): \(0{,}75 \cdot (-4) = -3\). Con \(k = -\frac{1}{4}\) si otterrebbe circa \(-0{,}19\).`,
    parti: [scelta("", [r`\(-4\)`, r`\(4\)`, r`\(-\frac{1}{4}\)`, r`\(\frac{1}{4}\)`], 0)],
  },
  {
    numero: 19,
    slug: "cubo-forato",
    titolo: "Il cubo forato",
    ambito: "Spazio e figure",
    temi: ["volume", "cubo", "visualizzazione"],
    difficolta: 2,
    testo:
      "La figura rappresenta un cubo di legno di spigolo 3 cm in cui sono stati creati dei fori a sezione quadrata di lato 1 cm. I fori sono centrati su ogni faccia, hanno i lati paralleli agli spigoli del cubo e attraversano l'intero solido fino alla faccia opposta. " +
      img("d19", "Un cubo con un foro quadrato al centro di ogni faccia visibile") +
      r` Quanti cubi di \(1\text{ cm}^3\) di volume sono necessari per riempire nuovamente il cubo?`,
    suggerimento:
      r`Il cubo è fatto di \(3 \cdot 3 \cdot 3 = 27\) cubetti. Ogni foro attraversa 3 cubetti in fila, e i fori sono 3 (uno per ogni coppia di facce opposte): \(3 \cdot 3 = 9\), ` +
      r`ma il cubetto centrale è comune a tutti e tre i fori ed è stato contato tre volte. I cubetti mancanti sono \(9 - 2 = 7\).`,
    parti: [scelta("", ["3", "6", "7", "4"], 2)],
  },
  {
    numero: 20,
    slug: "due-urne",
    titolo: "Due urne",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "spazio degli eventi"],
    difficolta: 2,
    adattamento: "Nella parte a gli esiti mancanti andavano scritti: qui si spuntano fra quelli proposti.",
    testo:
      "Due urne A e B contengono ciascuna tre bigliettini numerati con i numeri 1, 2 e 3. Si estrae un bigliettino dall'urna A e poi un bigliettino dall'urna B.",
    suggerimento:
      r`a) Gli esiti sono le coppie (numero di A; numero di B), con entrambi i numeri fra 1 e 3: \(3 \cdot 3 = 9\) coppie. Oltre a (1, 1), (1, 2), (1, 3), (2, 1) mancano (2, 2), (2, 3), (3, 1), (3, 2), (3, 3). ` +
      r`b) Le somme: 2 in 1 modo, 3 in 2 modi, 4 in 3 modi ((1, 3), (2, 2), (3, 1)), 5 in 2 modi, 6 in 1 modo. La più probabile è 4.`,
    parti: [
      sceltaMultipla(
        "a) Completa l'elenco di tutti i possibili esiti che si possono ottenere: (1, 1), (1, 2), (1, 3), (2, 1), … Spunta tutti gli esiti che mancano.",
        ["(2, 2)", "(2, 3)", "(3, 1)", "(3, 2)", "(3, 3)", "(1, 4)", "(4, 2)", "(0, 3)"],
        [true, true, true, true, true, false, false, false],
      ),
      numerica(
        "b) Si estrae un bigliettino dall'urna A e poi uno dall'urna B e si esegue la somma dei due numeri estratti. Fra tutte le possibili somme che si possono ottenere, qual è la più probabile?",
        "4",
      ),
    ],
  },
  {
    numero: 21,
    slug: "pendenza-retta",
    titolo: "La pendenza della retta AB",
    ambito: "Spazio e figure",
    temi: ["retta", "coefficiente angolare", "piano cartesiano"],
    difficolta: 1,
    adattamento: "La retta è ridisegnata dalla piattaforma.",
    testo: r`Considera la retta passante per i punti \(A(-1; 3)\) e \(B(2; 1)\). ` + "[grafico: 7/3 - 2*x/3 | x: -5..6 | y: -4..5] " + "La pendenza (o coefficiente angolare) della retta AB è",
    suggerimento:
      r`\(m = \frac{y_B - y_A}{x_B - x_A} = \frac{1 - 3}{2 - (-1)} = \frac{-2}{3} = -\frac{2}{3}\). La retta scende da sinistra a destra, quindi la pendenza è negativa.`,
    parti: [scelta("", [r`\(\frac{3}{2}\)`, r`\(\frac{2}{3}\)`, r`\(-\frac{2}{3}\)`, r`\(-\frac{3}{2}\)`], 2)],
  },
  {
    numero: 22,
    slug: "connessione-internet",
    titolo: "Minuti su Internet",
    ambito: "Dati e previsioni",
    temi: ["media", "classi di frequenza", "tabelle"],
    difficolta: 2,
    testo:
      "Agli alunni di una classe viene chiesto per quanto tempo al giorno, in media, utilizzano la connessione a Internet con i loro dispositivi (PC, Tablet, Smartphone, …). I risultati del sondaggio sono riportati nella seguente tabella. " +
      r`\[\begin{array}{|c|c|} \hline \text{Minuti di connessione a Internet} & \text{Frequenze assolute} \\ \hline \text{Da 0 minuti fino a 60 minuti} & 2 \\ \hline \text{Più di 60 minuti fino a 120 minuti} & 4 \\ \hline \text{Più di 120 minuti fino a 180 minuti} & 12 \\ \hline \text{Più di 180 minuti fino a 300 minuti} & 8 \\ \hline \end{array}\]` +
      " Quale tra le seguenti espressioni permette di calcolare il tempo medio giornaliero di connessione a Internet degli alunni della classe?",
    suggerimento:
      "Con i dati in classi si usa il valore centrale di ogni classe (30, 90, 150, 240 minuti), lo si moltiplica per la frequenza e si divide per il numero totale di alunni (2 + 4 + 12 + 8 = 26): è una media ponderata. " +
      "La B usa gli estremi superiori delle classi, la A non tiene conto delle frequenze, la D è la media delle frequenze.",
    parti: [
      scelta(
        "",
        [
          r`\(\frac{30 + 90 + 150 + 240}{4}\)`,
          r`\(\frac{60 \cdot 2 + 120 \cdot 4 + 180 \cdot 12 + 300 \cdot 8}{2 + 4 + 12 + 8}\)`,
          r`\(\frac{30 \cdot 2 + 90 \cdot 4 + 150 \cdot 12 + 240 \cdot 8}{2 + 4 + 12 + 8}\)`,
          r`\(\frac{2 + 4 + 12 + 8}{4}\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 23,
    slug: "trapezio-attorno-alla-base-minore",
    titolo: "Il trapezio attorno alla base minore",
    ambito: "Spazio e figure",
    temi: ["solidi di rotazione"],
    difficolta: 3,
    testo:
      "Osserva la figura. " +
      img("d23", "Il trapezio rettangolo ABCD con la base minore BC in alto, la base maggiore AD in basso e il lato AB perpendicolare alle basi; il segmento tratteggiato CE è perpendicolare ad AD") +
      r` Se si fa ruotare il trapezio rettangolo \(ABCD\) di un giro completo attorno alla sua base minore si ottiene un solido formato da:`,
    suggerimento:
      r`L'asse di rotazione è la retta \(BC\). Il rettangolo \(ABCE\) ruotando genera un cilindro di raggio \(AB\). Il triangolo \(CED\) ha il vertice \(C\) sull'asse: ruotando, il lato \(ED\) (parallelo all'asse) prosegue il cilindro, ` +
      r`mentre l'ipotenusa \(CD\) descrive un cono con il vertice in \(C\) e la base nel cerchio descritto da \(D\). Quel cono è vuoto: si ottiene un cilindro (di altezza \(AD\)) con una cavità conica.`,
    parti: [scelta("", ["un cilindro con una cavità conica", "un tronco di cono", "un cilindro e un cono sovrapposti", "un cilindro e due coni sovrapposti"], 0)],
  },
  {
    numero: 24,
    slug: "quadrato-di-binomio",
    titolo: "Un quadrato di binomio",
    ambito: "Numeri",
    temi: ["prodotti notevoli", "calcolo letterale"],
    difficolta: 2,
    testo: r`L'espressione \(\left(a - \frac{1}{a}\right)^2\) si può scrivere come:`,
    suggerimento:
      r`Quadrato di binomio: \(\left(a - \frac{1}{a}\right)^2 = a^2 - 2 \cdot a \cdot \frac{1}{a} + \frac{1}{a^2} = a^2 + \frac{1}{a^2} - 2\), perché \(a \cdot \frac{1}{a} = 1\). ` +
      r`La B dimentica il doppio prodotto, la C confonde il quadrato di un binomio con la differenza di due quadrati, la D sbaglia il doppio prodotto.`,
    parti: [
      scelta(
        "",
        [r`\(a^2 + \frac{1}{a^2} - 2\)`, r`\(\frac{a^4 + 1}{a^2}\)`, r`\(a^2 - \left(\frac{1}{a}\right)^2\)`, r`\(\frac{a^2 - 2a + 1}{a^2}\)`],
        0,
      ),
    ],
  },
  {
    numero: 25,
    slug: "dieci-cubi",
    titolo: "Dieci cubi incollati",
    ambito: "Spazio e figure",
    temi: ["superficie", "cubo", "visualizzazione"],
    difficolta: 3,
    testo:
      r`Dieci cubi di spigolo \(L\) sono stati incollati insieme, come mostrato in figura. ` +
      img("d25", "Dieci cubi uguali impilati in un unico strato a forma di piramide: 4 nella fila in basso, poi 3, 2 e 1 in cima") +
      " L'area della superficie totale del solido così ottenuto è:",
    suggerimento:
      r`Si contano le facce visibili da ogni direzione. Davanti e dietro: 10 facce ciascuno, 20. Da sopra si vede una faccia per ogni colonna, 4 (e altrettante da sotto): 8. ` +
      r`Da sinistra e da destra si vede una faccia per ogni fila, 4 ciascuno: 8. In tutto \(20 + 8 + 8 = 36\) facce, cioè \(36L^2\).`,
    parti: [scelta("", [r`\(32L^2\)`, r`\(35L^2\)`, r`\(36L^2\)`, r`\(30L^2\)`], 2)],
  },
  {
    numero: 26,
    slug: "studenti-stranieri",
    titolo: "Studenti stranieri in Italia",
    ambito: "Dati e previsioni",
    temi: ["istogrammi", "percentuali", "tabelle"],
    difficolta: 2,
    adattamento: "Il grafico a barre è riportato come tabella, con i valori scritti sulle barre.",
    testo:
      "Il seguente grafico mostra il numero di studenti stranieri presenti in Italia dal 2001 al 2011, espresso in migliaia. " +
      r`\[\begin{array}{|c|c|} \hline \text{Anno} & \text{Studenti stranieri (migliaia)} \\ \hline 2001 & 196{,}4 \\ \hline 2002 & 239{,}8 \\ \hline 2003 & 307{,}1 \\ \hline 2004 & 370{,}8 \\ \hline 2005 & 431{,}2 \\ \hline 2006 & 501{,}4 \\ \hline 2007 & 574{,}1 \\ \hline 2008 & 629{,}4 \\ \hline 2009 & 673{,}6 \\ \hline 2010 & 711{,}0 \\ \hline 2011 & 755{,}9 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) \(370{,}8 - 239{,}8 = 131\) migliaia. ` +
      r`b) L'aumento è \(629{,}4 - 501{,}4 = 128\) migliaia, da confrontare con il valore del 2006: \(\frac{128}{501{,}4} \approx 0{,}255\), circa il 26%.`,
    parti: [
      numerica("a) Di quanto sono aumentati gli studenti stranieri tra il 2002 e il 2004? Rispondi in migliaia.", "131", "0.05"),
      scelta("b) Di quanto sono aumentati in percentuale gli studenti stranieri nel 2008 rispetto al 2006?", ["Circa del 26%", "Circa del 20%", "Circa dell'80%", "Circa del 64%"], 0),
    ],
  },
  {
    numero: 27,
    slug: "divisibilita",
    titolo: "Multipli e divisibilità",
    ambito: "Numeri",
    temi: ["divisibilità", "multipli", "numeri interi"],
    difficolta: 2,
    testo: "Considera le seguenti affermazioni relative a numeri interi.",
    suggerimento:
      r`a) \(a = 3h\) e \(b = 4k\), quindi \(a \cdot b = 12hk = 6 \cdot 2hk\): multiplo di 6, vera. ` +
      r`b) \(2 \cdot 3 = 6\) è divisibile per 6, ma né 2 né 3 lo sono: falsa. ` +
      r`c) \(1 + 3 = 4\) è divisibile per 2, ma 1 e 3 sono dispari: falsa.`,
    parti: [
      veroFalso(
        [
          r`Se \(a\) è un multiplo di 3 e \(b\) è un multiplo di 4, allora \(a \cdot b\) è un multiplo di 6`,
          "Se il prodotto di due numeri è divisibile per 6, allora almeno uno dei due fattori è divisibile per 6",
          r`Se \(a + b\) è divisibile per 2, allora sia \(a\) sia \(b\) sono divisibili per 2`,
        ],
        [true, false, false],
      ),
    ],
  },
  {
    numero: 28,
    slug: "detersivo-scontato",
    titolo: "Il detersivo scontato",
    ambito: "Numeri",
    temi: ["percentuali", "sconti"],
    difficolta: 2,
    testo:
      "Ai soci di un supermercato un detersivo è venduto, con lo sconto del 20%, al prezzo di 1,40 €. Quanto costa quel detersivo ai clienti che non sono soci del supermercato e che pertanto non hanno diritto allo sconto?",
    suggerimento:
      r`Con lo sconto del 20% si paga l'80% del prezzo pieno: \(0{,}8 \cdot P = 1{,}40\), quindi \(P = 1{,}40 : 0{,}8 = 1{,}75\) €. ` +
      r`(Aggiungere il 20% a 1,40 € dà 1,68 €, ma il 20% va calcolato sul prezzo pieno, non su quello scontato.)`,
    parti: [scelta("", ["1,68 €", "1,75 €", "2,80 €", "1,12 €"], 1)],
  },
  {
    numero: 29,
    slug: "chiavette-usb",
    titolo: "Le chiavette USB",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "tabelle a doppia entrata"],
    difficolta: 2,
    testo:
      r`Una fabbrica utilizza due diverse macchine \(M_1\) e \(M_2\) che lavorano indipendentemente l'una dall'altra. Ciascuna delle due macchine produce chiavette USB da 16 GB e da 32 GB nelle percentuali descritte dalla seguente tabella. ` +
      r`\[\begin{array}{|c|c|c|c|} \hline & \text{16 GB} & \text{32 GB} & \text{Totale} \\ \hline M_1 & 18\% & 42\% & 60\% \\ \hline M_2 & 22\% & 18\% & 40\% \\ \hline \text{Totale} & 40\% & 60\% & 100\% \\ \hline \end{array}\]`,
    suggerimento:
      r`Le percentuali della tabella sono riferite a tutta la produzione. a) Chiavette da 16 GB prodotte da \(M_1\): la casella all'incrocio, 18%. ` +
      r`b) Chiavette da 16 GB in tutto: il totale della colonna, \(18\% + 22\% = 40\%\).`,
    parti: [
      numerica(
        r`a) Qual è la probabilità di estrarre dalla produzione della fabbrica una chiavetta da 16 GB prodotta da \(M_1\)? Esprimi il risultato in forma percentuale (scrivi solo il numero).`,
        "18",
      ),
      numerica(
        "b) Qual è la probabilità che una chiavetta USB estratta dalla produzione della fabbrica sia da 16 GB? Esprimi il risultato in forma percentuale (scrivi solo il numero).",
        "40",
      ),
    ],
  },
  {
    numero: 30,
    slug: "zeri-e-pendenza",
    titolo: "Zeri e pendenza",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "zeri di una funzione", "coefficiente angolare"],
    difficolta: 2,
    testo:
      r`In una funzione del tipo \(f(x) = ax + b\), il numero reale \(a\) si dice pendenza. Inoltre si dice zero di una funzione \(f\) ogni valore di \(x\) per cui \(f(x) = 0\).`,
    suggerimento:
      r`a) \(x - 5 = 0\) per \(x = 5\): vera. ` +
      r`b) \(3x = 0\) per \(x = 0\), non per \(x = -3\) (che dà \(f(-3) = -9\)): falsa. ` +
      r`c) Se \(b \ne 0\), \(f(x) = b\) non vale mai 0: nessuno zero, vera. ` +
      r`d) \(f(x) = b\) è \(f(x) = 0 \cdot x + b\): la pendenza è 0 (retta orizzontale), vera.`,
    parti: [
      veroFalso(
        [
          r`Lo zero della funzione \(f(x) = x - 5\) è 5`,
          r`Lo zero della funzione \(f(x) = 3x\) è \(-3\)`,
          r`Le funzioni del tipo \(f(x) = b\), con \(b \ne 0\), non hanno zeri`,
          r`Nelle funzioni del tipo \(f(x) = b\), la pendenza è 0`,
        ],
        [true, false, true, true],
      ),
    ],
  },
  {
    numero: 31,
    slug: "numeri-dispari",
    titolo: "Numeri dispari",
    ambito: "Numeri",
    temi: ["calcolo letterale", "pari e dispari"],
    difficolta: 2,
    testo:
      r`L'espressione \(2n - 1\) rappresenta, al variare di \(n\) nell'insieme dei numeri naturali maggiori di 0, un qualunque numero dispari. Nelle affermazioni seguenti \(n\) varia nell'insieme dei numeri naturali.`,
    suggerimento:
      r`a) \(2n\) è pari, quindi \(2n + 1\) è sempre dispari: vera. ` +
      r`b) Per \(n = 2\) si ottiene \(3n = 6\), pari: falsa (\(3n\) è dispari solo se \(n\) è dispari). ` +
      r`c) \(2n - 1\) è dispari, e il prodotto di due dispari è dispari: \((2n - 1)^2\) è dispari, non pari. Falsa (per esempio con \(n = 2\) si ottiene 9).`,
    parti: [
      veroFalso(
        [
          r`Per ogni \(n\), \(2n + 1\) rappresenta un numero dispari`,
          r`Per ogni \(n\), \(3n\) rappresenta un numero dispari`,
          r`Per ogni \(n\), \((2n - 1)^2\) rappresenta un numero pari`,
        ],
        [true, false, false],
      ),
    ],
  },
  {
    numero: 32,
    slug: "frazione-di-frazioni",
    titolo: "Una frazione di frazioni",
    ambito: "Numeri",
    temi: ["frazioni", "espressioni"],
    difficolta: 1,
    testo: r`Calcola l'espressione \[\frac{1 - \frac{1}{7}}{1 + \frac{1}{7}}\]`,
    suggerimento:
      r`Numeratore: \(1 - \frac{1}{7} = \frac{6}{7}\). Denominatore: \(1 + \frac{1}{7} = \frac{8}{7}\). ` +
      r`Dividere per \(\frac{8}{7}\) vuol dire moltiplicare per \(\frac{7}{8}\): \(\frac{6}{7} \cdot \frac{7}{8} = \frac{6}{8} = \frac{3}{4}\).`,
    parti: [espressione("Scrivi il risultato sotto forma di un'unica frazione.", "3/4")],
  },
];

export const PACCHETTO_INVALSI_2017: EsercizioPacchetto[] = creaPacchetto({ anno: 2017, annoScolastico: "2016/17" }, DOMANDE);

if (lanciatoDirettamente(import.meta.url)) {
  scriviPacchetto(PACCHETTO_INVALSI_2017);
}
