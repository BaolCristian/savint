/**
 * La prova INVALSI di matematica 2014/15 (classe seconda della secondaria di
 * secondo grado, fascicolo 1): 31 domande, una per esercizio, nei file
 * `content/esercizi/invalsi-2015-dNN-*.json`.
 *
 * Le regole comuni a tutte le prove sono in `scripts/invalsi/comune.ts`.
 *
 * Come per `genera-percentuali.ts`: ogni esercizio è scritto qui come modello
 * dell'editor (`EsercizioEditor`) e convertito con `versoFile`, così l'editor
 * dei docenti sa riaprirlo. I file JSON NON si correggono a mano: si corregge
 * qui e si rigenera con
 *
 *     npx tsx scripts/genera-invalsi-2015.ts
 *
 * `src/lib/esercizi/__tests__/pacchetto-invalsi-2015.test.ts` controlla che i
 * file su disco coincidano con quello che questo script produce, che reggano
 * la verifica a venti semi e che le risposte giuste prendano tutti i punti.
 *
 * Scelte di trascrizione:
 * - l'argomento è l'AMBITO INVALSI della domanda (Numeri, Spazio e figure,
 *   Relazioni e funzioni, Dati e previsioni): una batteria può pescare per
 *   ambito; il tema specifico sta nei tag;
 * - le figure che la piattaforma non sa disegnare sono ritagliate dal
 *   fascicolo (`content/esercizi/immagini/`, copiate dal seed); i quattro
 *   grafici della D5 sono ridisegnati con i grafici di funzione;
 * - le tabelle sono scritte come tabelle in formula (`array`), in colonna per
 *   restare leggibili sul telefono;
 * - le domande a risposta aperta da argomentare (D20) o da elencare (D31)
 *   sono diventate a scelta, perché la piattaforma corregge da sola; la
 *   descrizione lo dice;
 * - le probabilità si scrivono come frazione (parte «espressione», che
 *   accetta qualunque forma equivalente, anche il decimale).
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
  d01: "717f3ec3-93e6-499c-99ac-8add63eaf54e.png",
  d10: "f92ed9e2-4daa-41c3-9596-6895e0736671.png",
  d14: "c1ec29b4-0f7d-4049-b6c7-8d66089ce3fd.png",
  d19: "0bc0837a-7f10-4abc-abaa-57495e4f0981.png",
  d27: "9838eeaf-f835-4c11-9554-f1db3cb96c13.png",
  d31: "1e96233e-3bf9-4fe1-bfd7-5dd14b1ba091.png",
} as const;

const img = (chiave: keyof typeof IMMAGINE, descrizione: string) => immagine(IMMAGINE[chiave], descrizione);

const DOMANDE: Domanda[] = [
  {
    numero: 1,
    slug: "popolazione-straniera",
    titolo: "Popolazione straniera",
    ambito: "Dati e previsioni",
    temi: ["grafici", "lettura di grafici"],
    difficolta: 2,
    testo:
      "Il seguente grafico rappresenta la popolazione straniera residente in Italia, suddivisa per sesso, negli anni dal 2002 al 2009 (fonte ISTAT). " +
      img("d01", "Grafico a linee della popolazione straniera residente in Italia, maschi e femmine, dal 2002 al 2009"),
    suggerimento:
      "a) Dal 2002 al 2005 la linea dei maschi sta sempre sopra quella delle femmine: vera. " +
      "b) Nel 2009 le due linee sono più distanti che in qualunque altro anno (circa 100 000): vera. " +
      "c) Le femmine superano i maschi già nel 2007: nel 2008 non è la prima volta, falsa. " +
      r`d) I maschi passano da circa 790 000 (2002) a circa 1 700 000 (2007), più di \(2 \cdot 790\,000 = 1\,580\,000\): vera.`,
    parti: [
      veroFalso(
        [
          "Fra il 2002 e il 2005 i maschi erano più numerosi delle femmine",
          "Nel 2009 la differenza tra numero di femmine e numero di maschi era massima",
          "Nel 2008 il numero delle femmine ha superato per la prima volta il numero dei maschi",
          "Dal 2002 al 2007 i maschi sono più che raddoppiati",
        ],
        [true, true, false, true],
      ),
    ],
  },
  {
    numero: 2,
    slug: "disequazione",
    titolo: "Una disequazione",
    ambito: "Numeri",
    temi: ["disequazioni"],
    difficolta: 1,
    testo: r`Nell'insieme dei numeri reali la disequazione \(x^2 + 1 \ge 0\) è verificata`,
    suggerimento: r`\(x^2\) non è mai negativo, quindi \(x^2 + 1 \ge 1 > 0\) qualunque sia il numero reale \(x\): la disequazione è verificata per ogni \(x\).`,
    parti: [scelta("", [r`solo per \(x \ge 0\)`, r`solo per \(x \ge -1\)`, r`per ogni \(x\)`, r`per nessun \(x\)`], 2)],
  },
  {
    numero: 3,
    slug: "diagonali-quadrilateri",
    titolo: "Diagonali dei quadrilateri",
    ambito: "Spazio e figure",
    temi: ["quadrilateri", "condizioni necessarie e sufficienti"],
    difficolta: 3,
    testo: "Leggi con attenzione le affermazioni sui quadrilateri e sulle loro diagonali.",
    suggerimento:
      "a) Essere un rettangolo non è necessario: anche il trapezio isoscele ha le diagonali uguali. Falsa. " +
      "b) Ogni rettangolo ha le diagonali uguali, quindi essere un rettangolo basta: la condizione è sufficiente. Vera. " +
      "c) Un rombo con le diagonali uguali è un quadrato, e un quadrato (che è anche un rombo) ha le diagonali uguali: la condizione è necessaria e sufficiente. Vera.",
    parti: [
      veroFalso(
        [
          "Condizione necessaria affinché un quadrilatero abbia le diagonali uguali è che sia un rettangolo",
          "Condizione sufficiente affinché un quadrilatero abbia le diagonali uguali è che sia un rettangolo",
          "Condizione necessaria e sufficiente affinché un rombo sia un quadrato è che abbia le diagonali uguali",
        ],
        [false, true, true],
      ),
    ],
  },
  {
    numero: 4,
    slug: "serbatoio",
    titolo: "Il serbatoio",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "modellizzazione"],
    difficolta: 2,
    testo:
      r`Una sorgente di montagna alimenta continuativamente un serbatoio con \(5\text{ m}^3\) di acqua ogni settimana. ` +
      r`Oggi il serbatoio contiene \(100\text{ m}^3\) di acqua e un villaggio inizia a prelevare \(7\text{ m}^3\) di acqua alla settimana. ` +
      r`Indichiamo con \(n\) i \(\text{m}^3\) di acqua contenuti nel serbatoio e con \(t\) il numero di settimane a partire da oggi: per \(t = 0\) è \(n = 100\).`,
    suggerimento:
      r`Ogni settimana entrano \(5\text{ m}^3\) ed escono \(7\text{ m}^3\): il serbatoio perde \(2\text{ m}^3\) a settimana. ` +
      r`a) Dopo 1, 2, 3, 4 settimane contiene 98, 96, 94, 92 \(\text{m}^3\). ` +
      r`b) \(n = 100 - 2t\). ` +
      r`c) È vuoto quando \(100 - 2t = 0\), cioè dopo \(t = 50\) settimane.`,
    parti: [
      numerica(r`a) Completa la tabella. Per \(t = 1\): \(n =\)`, "98"),
      numerica(r`Per \(t = 2\): \(n =\)`, "96"),
      numerica(r`Per \(t = 3\): \(n =\)`, "94"),
      numerica(r`Per \(t = 4\): \(n =\)`, "92"),
      espressione(r`b) Scrivi un'espressione che rappresenti \(n\) in funzione di \(t\). \(n =\)`, "100 - 2*t"),
      scelta("c) Dopo quante settimane il serbatoio sarà vuoto?", ["20 settimane", "50 settimane", "98 settimane", "102 settimane"], 1),
    ],
  },
  {
    numero: 5,
    slug: "grafico-retta",
    titolo: "Il grafico giusto",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "retta", "grafici"],
    difficolta: 1,
    adattamento: "I quattro grafici sono ridisegnati dalla piattaforma.",
    testo:
      r`Uno dei seguenti grafici rappresenta la funzione definita da \(y = 1 - 4x\) nell'insieme dei numeri reali. Quale? ` +
      "Grafico A: [grafico: 1 - 4*x | x: -3..5 | y: -4..5] " +
      "Grafico B: [grafico: 4*x - 1 | x: -3..5 | y: -4..5] " +
      "Grafico C: [grafico: 1 - x/4 | x: -3..9 | y: -2..5] " +
      "Grafico D: [grafico: x/4 + 1 | x: -5..5 | y: -3..5]",
    suggerimento:
      r`Per \(x = 0\) si ha \(y = 1\): il grafico passa per \((0; 1)\), e questo esclude B. ` +
      r`Il coefficiente di \(x\) è \(-4\): la retta scende, e ripida (per \(x = 1\) vale già \(y = -3\)). D sale, C scende di una sola unità ogni 4: è il grafico A.`,
    parti: [scelta("", ["Grafico A", "Grafico B", "Grafico C", "Grafico D"], 0)],
  },
  {
    numero: 6,
    slug: "mazzo-di-carte",
    titolo: "Il mazzo di carte",
    ambito: "Dati e previsioni",
    temi: ["probabilità"],
    difficolta: 3,
    testo:
      "Da un mazzo di 52 carte da gioco (composto da 13 carte per ognuno dei semi: cuori, quadri, fiori, picche) sono stati tolti i 4 assi.",
    suggerimento:
      r`a) Restano 48 carte, di cui 12 di cuori: \(\frac{12}{48} = \frac{1}{4}\). ` +
      r`b) Se si tolgono \(k\) carte di fiori restano \(52 - k\) carte, di cui \(13 - k\) di fiori: \(\frac{13 - k}{52 - k} = \frac{6}{45}\). ` +
      r`Moltiplicando in croce \(45(13 - k) = 6(52 - k)\), cioè \(585 - 45k = 312 - 6k\), da cui \(k = 7\). Infatti \(52 - 7 = 45\) e \(13 - 7 = 6\).`,
    parti: [
      espressione("a) Si estrae una carta a caso. Qual è la probabilità che sia di cuori? Scrivi il risultato come frazione (per esempio 3/5).", "1/4"),
      numerica(
        r`b) Da un altro mazzo di 52 carte, completo, sono state tolte alcune carte di fiori. Dopo questa operazione la probabilità di estrarre, a caso, una carta di fiori è \(\frac{6}{45}\). Quante carte di fiori sono state tolte?`,
        "7",
      ),
    ],
  },
  {
    numero: 7,
    slug: "obelisco",
    titolo: "L'obelisco",
    ambito: "Spazio e figure",
    temi: ["similitudine", "proporzioni"],
    difficolta: 1,
    testo:
      "Arturo vuole misurare l'altezza di un obelisco che si trova al centro della piazza principale della sua città. " +
      "A una certa ora di un giorno di sole, l'obelisco proietta un'ombra di circa 6,4 metri, e un palo alto 2,5 metri, che si trova nella stessa piazza, proietta un'ombra di circa 0,8 metri. " +
      "Supponi che la piazza sia orizzontale e che l'obelisco e il palo siano verticali.",
    suggerimento:
      r`Alla stessa ora i raggi del sole sono paralleli: obelisco e palo formano con le loro ombre due triangoli rettangoli simili. ` +
      r`Quindi \(\frac{h}{6{,}4} = \frac{2{,}5}{0{,}8}\), da cui \(h = \frac{6{,}4 \cdot 2{,}5}{0{,}8} = 20\) m.`,
    parti: [numerica("Qual è l'altezza dell'obelisco, in metri?", "20", "0.1")],
  },
  {
    numero: 8,
    slug: "tariffa-telefonica",
    titolo: "La tariffa del cellulare",
    ambito: "Relazioni e funzioni",
    temi: ["modellizzazione", "problemi"],
    difficolta: 2,
    testo:
      "Il piano tariffario di un cellulare prevede un costo di 0,15 euro per lo «scatto alla risposta» più 0,12 euro per minuto o frazione di minuto di conversazione. " +
      "Per esempio, se parlo 1 minuto e 1 secondo pago (0,15 + 0,24) euro, come se parlassi esattamente 2 minuti.",
    suggerimento:
      r`a) 7 minuti e 10 secondi si pagano come 8 minuti: \(0{,}15 + 8 \cdot 0{,}12 = 0{,}15 + 0{,}96 = 1{,}11\) euro. ` +
      r`b) Tolto lo scatto restano \(4 - 0{,}15 = 3{,}85\) euro, e \(3{,}85 : 0{,}12 \approx 32{,}08\): si possono pagare 32 minuti. Il 33° porterebbe la spesa a \(0{,}15 + 33 \cdot 0{,}12 = 4{,}11\) euro.`,
    parti: [
      numerica("a) Quanti euro si spendono per una telefonata che dura 7 minuti e 10 secondi?", "1.11"),
      numerica("b) Se nel cellulare mi è rimasto un credito di 4 euro e voglio fare una telefonata, quanti minuti al massimo posso farla durare?", "32"),
    ],
  },
  {
    numero: 9,
    slug: "distanza-da-scuola",
    titolo: "Distanza da scuola",
    ambito: "Dati e previsioni",
    temi: ["tabelle", "percentuali", "frequenze"],
    difficolta: 1,
    testo:
      r`Nella seguente tabella, \(d\) rappresenta la distanza in metri fra l'abitazione e la scuola di ciascuno degli alunni di una classe. ` +
      r`\[\begin{array}{|c|c|} \hline \text{Distanza dalla scuola (m)} & \text{Numero di alunni} \\ \hline 100 \le d < 500 & 2 \\ \hline 500 \le d < 1000 & 8 \\ \hline 1000 \le d < 1500 & 5 \\ \hline 1500 \le d < 2000 & 7 \\ \hline 2000 \le d < 2500 & 3 \\ \hline \end{array}\]`,
    suggerimento:
      "Gli alunni sono in tutto 2 + 8 + 5 + 7 + 3 = 25. " +
      "a) Meno di 1 km vuol dire meno di 1000 m: 2 + 8 = 10 alunni. " +
      r`b) Meno di 1,5 km: 2 + 8 + 5 = 15 alunni, e \(\frac{15}{25} = \frac{60}{100}\), cioè il 60%.`,
    parti: [
      numerica("a) Quanti sono gli alunni che abitano a meno di 1 km dalla scuola?", "10"),
      scelta("b) Qual è la percentuale di alunni che abitano a meno di 1,5 km dalla scuola?", ["15%", "20%", "40%", "60%"], 3),
    ],
  },
  {
    numero: 10,
    slug: "due-rette",
    titolo: "Le funzioni f e g",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "equazioni", "disequazioni", "grafici"],
    difficolta: 2,
    testo:
      r`Su un piano cartesiano sono rappresentati i grafici delle funzioni \(f\) e \(g\) definite nell'insieme dei numeri reali e rappresentate dalle formule \(f(x) = 2x - 5\) e \(g(x) = -3x + 1\). ` +
      img("d10", "Le rette grafico di f(x) = 2x − 5 e di g(x) = −3x + 1 nel piano cartesiano"),
    suggerimento:
      r`a) \(f(x) = g(x)\): \(2x - 5 = -3x + 1\), cioè \(5x = 6\), \(x = 1{,}2\). Vera. ` +
      r`b) \(f(x) > 0\) quando \(2x > 5\), cioè per \(x > 2{,}5\), non per \(x > 0\) (per esempio \(f(1) = -3\)). Falsa. ` +
      r`c) \(f(x) = 0\) per \(x = 2{,}5\). Vera. ` +
      r`d) \(g(x) > f(x)\): \(-3x + 1 > 2x - 5\), cioè \(x < 1{,}2\): a sinistra del punto d'incontro la retta di \(g\) sta sopra. Vera.`,
    parti: [
      veroFalso(
        [
          r`\(f(x) = g(x)\) se e solo se \(x = 1{,}2\)`,
          r`\(f(x) > 0\) se e solo se \(x > 0\)`,
          r`\(f(x) = 0\) se e solo se \(x = 2{,}5\)`,
          r`\(g(x) > f(x)\) se e solo se \(x < 1{,}2\)`,
        ],
        [true, false, true, true],
        r`Aiutandoti anche con i grafici di \(f\) e di \(g\), indica se ciascuna affermazione è vera o falsa.`,
      ),
    ],
  },
  {
    numero: 11,
    slug: "pi-greco",
    titolo: "Il numero π",
    ambito: "Numeri",
    temi: ["numeri irrazionali", "circonferenza"],
    difficolta: 1,
    testo: r`Considera il numero \(\pi\).`,
    suggerimento:
      r`a) \(\pi\) è il rapporto fra la lunghezza di una circonferenza e il suo diametro: \(C = \pi d = 2\pi r\). ` +
      r`b) Irrazionale vuol dire che non si può scrivere come frazione: il suo sviluppo decimale è illimitato e non periodico (\(3{,}14159\ldots\)).`,
    parti: [
      scelta(
        r`a) \(\pi\) può essere definito come`,
        [
          "il rapporto tra l'area di un cerchio e il suo raggio",
          "il rapporto tra la lunghezza di una circonferenza e il suo diametro",
          "il rapporto tra l'area di un cerchio e il suo diametro",
          "il rapporto tra la lunghezza di una circonferenza e il suo raggio",
        ],
        1,
      ),
      scelta(
        r`b) \(\pi\) è un numero irrazionale. Questo significa che`,
        [
          "è un numero decimale periodico semplice",
          "è un numero decimale limitato",
          "è un numero decimale periodico misto",
          "è un numero decimale illimitato non periodico",
        ],
        3,
      ),
    ],
  },
  {
    numero: 12,
    slug: "temperature",
    titolo: "Le temperature in montagna",
    ambito: "Dati e previsioni",
    temi: ["media", "numeri relativi", "tabelle"],
    difficolta: 1,
    testo:
      "Una stazione meteorologica nelle Alpi ha misurato le temperature, in gradi centigradi (°C), durante un giorno di dicembre. I dati raccolti sono riportati nella seguente tabella. " +
      r`\[\begin{array}{|c|c|} \hline \text{Ora} & \text{Temperatura (°C)} \\ \hline 1 & -8 \\ \hline 4 & -10 \\ \hline 7 & -10 \\ \hline 10 & -3 \\ \hline 13 & +1 \\ \hline 16 & -1 \\ \hline 19 & -3 \\ \hline 22 & -6 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) La massima è \(+1\) °C, la minima \(-10\) °C: \(1 - (-10) = 11\) °C. ` +
      r`b) La somma delle otto misure è \(-8 - 10 - 10 - 3 + 1 - 1 - 3 - 6 = -40\), e \(-40 : 8 = -5\) °C.`,
    parti: [
      numerica("a) Qual è l'escursione termica, cioè la differenza tra la temperatura massima e la temperatura minima, nel giorno considerato, in °C?", "11"),
      numerica(r`b) Qual è la temperatura media \(T_M\) relativa alle misure riportate in tabella, in °C?`, "-5"),
    ],
  },
  {
    numero: 13,
    slug: "palo-nello-stagno",
    titolo: "Il palo nello stagno",
    ambito: "Numeri",
    temi: ["equazioni", "frazioni", "problemi"],
    difficolta: 2,
    testo:
      "Un palo verticale è piantato in uno stagno. Un quinto del palo è interrato nel fondale, un sesto è immerso in acqua e la parte del palo che esce dall'acqua è lunga 8,9 metri.",
    suggerimento:
      r`a) Le tre parti insieme fanno tutto il palo: \(\frac{1}{5}x + \frac{1}{6}x + 8{,}9 = x\). ` +
      r`b) \(\frac{1}{5} + \frac{1}{6} = \frac{11}{30}\), quindi la parte fuori dall'acqua è \(\frac{19}{30}\) del palo: \(\frac{19}{30}x = 8{,}9\), ` +
      r`\(x = \frac{8{,}9 \cdot 30}{19} = \frac{267}{19} \approx 14{,}05\) m.`,
    parti: [
      scelta(
        r`a) Quale delle seguenti equazioni consente di determinare la lunghezza totale \(x\) del palo?`,
        [
          r`\(\frac{1}{5} + \frac{1}{6} + 8{,}9 = x\)`,
          r`\(\frac{1}{5}x + \frac{1}{6}x = x + 8{,}9\)`,
          r`\(\frac{1}{5}x + \frac{1}{6}x + x = 8{,}9\)`,
          r`\(\frac{1}{5}x + \frac{1}{6}x + 8{,}9 = x\)`,
        ],
        3,
      ),
      numerica(r`b) Qual è la lunghezza totale \(x\) del palo, in metri? Arrotonda ai centesimi.`, "267/19", "0.01"),
    ],
  },
  {
    numero: 14,
    slug: "televisori",
    titolo: "Televisori in casa",
    ambito: "Dati e previsioni",
    temi: ["percentuali", "diagramma a torta", "tabelle"],
    difficolta: 2,
    adattamento: "Nella parte b i settori sono indicati dal colore e dalla posizione.",
    testo:
      "Un sondaggio condotto su un gruppo di 51 studenti sul numero di televisori presenti in casa ha dato i seguenti risultati. " +
      r`\[\begin{array}{|c|c|} \hline \text{Numero di televisori in casa} & \text{Numero di studenti} \\ \hline 1 & 10 \\ \hline 2 & 15 \\ \hline 3 & 18 \\ \hline 4 & 8 \\ \hline \text{Totale} & 51 \\ \hline \end{array}\]` +
      " Dalla tabella è stato ricavato il seguente grafico a settori circolari. " +
      img("d14", "Diagramma a torta con quattro settori: grigio scuro in alto a destra, nero in basso a destra, grigio chiaro a sinistra, grigio medio in alto a sinistra"),
    suggerimento:
      r`a) Meno di 3 televisori: \(10 + 15 = 25\) studenti su 51, cioè \(\frac{25}{51} \approx 0{,}49\), il 49% circa. ` +
      r`b) Ogni settore è proporzionale al numero di studenti: il più grande (grigio chiaro, 18 studenti) è quello di 3 televisori, il più piccolo (grigio medio, 8) di 4, ` +
      "poi il nero (15) di 2 e il grigio scuro (10) di 1.",
    parti: [
      numerica("a) Quale percentuale di studenti ha in casa meno di 3 televisori? Arrotonda all'unità.", "2500/51", "0.5"),
      numerica("b) Associa a ciascun settore il numero di televisori presenti in casa. Settore grigio scuro, in alto a destra: n. televisori =", "1"),
      numerica("Settore nero, in basso a destra: n. televisori =", "2"),
      numerica("Settore grigio chiaro, a sinistra: n. televisori =", "3"),
      numerica("Settore grigio medio, in alto a sinistra: n. televisori =", "4"),
    ],
  },
  {
    numero: 15,
    slug: "rette-parallele",
    titolo: "Rette parallele",
    ambito: "Spazio e figure",
    temi: ["retta", "piano cartesiano", "coefficiente angolare"],
    difficolta: 1,
    testo:
      r`Nel piano cartesiano \(Oxy\) la retta di equazione \(y = 3x - 5\) e la retta di equazione \(y = \frac{k}{2}x - 1\) sono tra loro parallele; il valore di \(k\) è`,
    suggerimento: r`Due rette sono parallele quando hanno lo stesso coefficiente angolare: \(\frac{k}{2} = 3\), quindi \(k = 6\).`,
    parti: [scelta("", [r`\(-3\)`, r`\(-6\)`, r`\(3\)`, r`\(6\)`], 3)],
  },
  {
    numero: 16,
    slug: "due-cubi",
    titolo: "Due cubi",
    ambito: "Spazio e figure",
    temi: ["volume", "similitudine"],
    difficolta: 1,
    testo: "Il rapporto tra gli spigoli di due cubi è 5. Qual è il rapporto tra i loro volumi?",
    suggerimento: r`Il volume di un cubo è lo spigolo al cubo: se uno spigolo è 5 volte l'altro, il volume è \(5^3 = 125\) volte l'altro.`,
    parti: [scelta("", ["5", "15", "25", "125"], 3)],
  },
  {
    numero: 17,
    slug: "lavanderia",
    titolo: "La lavanderia a gettoni",
    ambito: "Numeri",
    temi: ["problemi", "divisione"],
    difficolta: 1,
    testo:
      "Una lavanderia a gettoni lavora con orario continuato dalle 9 alle 18. Ogni lavatrice effettua cicli di lavaggio della durata di 33 minuti, ai quali si devono aggiungere 10 minuti per l'operazione di carico e 5 per lo svuotamento.",
    suggerimento:
      r`Dalle 9 alle 18 ci sono 9 ore, cioè 540 minuti. Un lavaggio completo dura \(33 + 10 + 5 = 48\) minuti. \(540 : 48 = 11{,}25\): i lavaggi completi sono 11.`,
    parti: [numerica("Quanti lavaggi completi, comprensivi di carico e svuotamento, può effettuare al massimo una lavatrice nell'arco della giornata?", "11")],
  },
  {
    numero: 18,
    slug: "effetti-collaterali",
    titolo: "Effetti collaterali",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "eventi indipendenti", "percentuali"],
    difficolta: 2,
    testo:
      "Nel foglietto illustrativo contenuto nella confezione di un farmaco, alla voce «Effetti collaterali» si legge che: il 2% dei pazienti trattati con il farmaco ha accusato vertigini; il 7% dei pazienti trattati con il farmaco ha avuto bruciori di stomaco. " +
      "I due tipi di effetti collaterali sono indipendenti l'uno dall'altro.",
    suggerimento:
      r`a) L'evento contrario di «avere bruciori» ha probabilità \(100\% - 7\% = 93\%\). ` +
      r`b) Per eventi indipendenti la probabilità che accadano entrambi è il prodotto: \(0{,}02 \cdot 0{,}07 = 0{,}0014\), cioè lo \(0{,}14\%\).`,
    parti: [
      numerica("a) Qual è la probabilità che un paziente che ha assunto il farmaco NON abbia bruciori di stomaco? Esprimi il risultato in forma percentuale (scrivi solo il numero).", "93"),
      scelta("b) Qual è la probabilità che un paziente che ha assunto il farmaco manifesti ENTRAMBI gli effetti collaterali?", ["9%", "0,14%", "14%", "0,9%"], 1),
    ],
  },
  {
    numero: 19,
    slug: "area-quadrilatero",
    titolo: "Area di un quadrilatero",
    ambito: "Spazio e figure",
    temi: ["area", "piano cartesiano"],
    difficolta: 2,
    testo: "Qual è l'area del quadrilatero ABCD rappresentato in figura? " + img("d19", "Il quadrilatero ABCD nel piano cartesiano con A(−1; 3), B(3; 0), C(5; 5), D(3; 3); ogni quadretto ha il lato di 1 cm"),
    suggerimento:
      r`Si legge \(A(-1; 3)\), \(B(3; 0)\), \(C(5; 5)\), \(D(3; 3)\). Il segmento \(DB\) divide il quadrilatero in due triangoli. ` +
      r`\(ABD\): base \(AD = 4\), altezza 3 (la distanza di \(B\) dalla retta \(y = 3\)), area \(\frac{4 \cdot 3}{2} = 6\). ` +
      r`\(DBC\): base \(DB = 3\), altezza 2 (la distanza di \(C\) dalla retta \(x = 3\)), area \(\frac{3 \cdot 2}{2} = 3\). In tutto \(9\text{ cm}^2\).`,
    parti: [numerica(r`Area, in \(\text{cm}^2\):`, "9")],
  },
  {
    numero: 20,
    slug: "lorenza",
    titolo: "Lorenza ha ragione?",
    ambito: "Numeri",
    temi: ["disequazioni", "argomentare"],
    difficolta: 2,
    adattamento: "Nel fascicolo la motivazione andava scritta: qui si sceglie fra motivazioni proposte.",
    testo: r`Lorenza afferma: «La disequazione \(\frac{1}{2}x < x\) è soddisfatta per ogni numero reale \(x\)». Lorenza ha ragione?`,
    suggerimento:
      r`\(\frac{1}{2}x < x\) equivale a \(0 < \frac{1}{2}x\), cioè a \(x > 0\). Per \(x = 0\) si ottiene \(0 < 0\), falso; ` +
      r`per un numero negativo, come \(x = -2\), si ottiene \(-1 < -2\), falso. Lorenza non ha ragione: la metà di un numero negativo è maggiore del numero.`,
    parti: [
      scelta(
        "",
        [
          "Sì: la metà di un numero è sempre minore del numero stesso",
          r`No: è vera solo per \(x > 0\); per esempio per \(x = -2\) diventa \(-1 < -2\), che è falso`,
          r`No: è vera solo per \(x < 0\)`,
          "No: non è vera per nessun numero reale",
        ],
        1,
      ),
    ],
  },
  {
    numero: 21,
    slug: "somma-di-potenze",
    titolo: "Somma di potenze",
    ambito: "Numeri",
    temi: ["potenze", "raccoglimento"],
    difficolta: 2,
    testo: r`L'espressione \(a^{43} + a^{44}\) è uguale a`,
    suggerimento: r`Si raccoglie \(a^{43}\): \(a^{43} + a^{44} = a^{43} + a^{43} \cdot a = a^{43}(1 + a)\). La somma di due potenze NON è una potenza con gli esponenti sommati: quello vale per il prodotto.`,
    parti: [scelta("", [r`\(a^{44 \cdot 43}\)`, r`\(a^{43} \cdot (a + 1)\)`, r`\(a^{87}\)`, r`\(2a^{87}\)`], 1)],
  },
  {
    numero: 22,
    slug: "palline-blu",
    titolo: "Le palline blu",
    ambito: "Dati e previsioni",
    temi: ["probabilità"],
    difficolta: 2,
    testo:
      "Un'urna contiene 40 palline identiche tranne che per il colore: 23 sono rosse e 17 blu. Si estraggono contemporaneamente due palline dall'urna. Entrambe sono blu. " +
      "Senza reintrodurre le due palline estratte, si estrae dall'urna una terza pallina.",
    suggerimento: r`Dopo le due estrazioni restano 38 palline, di cui \(17 - 2 = 15\) blu: la probabilità è \(\frac{15}{38}\).`,
    parti: [espressione("Qual è la probabilità che anche la terza pallina sia blu? Scrivi il risultato come frazione.", "15/38")],
  },
  {
    numero: 23,
    slug: "media-di-due-gruppi",
    titolo: "La media di due gruppi",
    ambito: "Dati e previsioni",
    temi: ["media", "media ponderata"],
    difficolta: 2,
    testo:
      "Lo stesso test di matematica è stato proposto a due diversi gruppi di studenti. Il primo gruppo, composto da 20 studenti, ha ottenuto un punteggio medio di 85 e il secondo, composto da 80 studenti, ha ottenuto un punteggio medio di 65.",
    suggerimento:
      r`Non è la media fra 85 e 65: i gruppi hanno numeri diversi. Il punteggio totale è \(20 \cdot 85 + 80 \cdot 65 = 1700 + 5200 = 6900\), e \(6900 : 100 = 69\).`,
    parti: [numerica("Qual è il punteggio medio ottenuto dai 100 studenti dei due gruppi?", "69")],
  },
  {
    numero: 24,
    slug: "lattina",
    titolo: "La lattina",
    ambito: "Spazio e figure",
    temi: ["volume", "cilindro", "misure"],
    difficolta: 2,
    testo: "Una bibita è venduta in lattine di forma cilindrica con il diametro di base di 6 cm e l'altezza di 9 cm. Qual è la capacità della lattina?",
    suggerimento:
      r`Il raggio è 3 cm: \(V = \pi r^2 h = \pi \cdot 9 \cdot 9 = 81\pi \approx 254\text{ cm}^3\). ` +
      r`Un litro è \(1000\text{ cm}^3\), quindi \(\frac{1}{4}\) di litro è \(250\text{ cm}^3\): la lattina contiene poco più di un quarto di litro.`,
    parti: [
      scelta(
        "",
        [r`esattamente \(\frac{1}{4}\) di litro`, r`poco più di \(\frac{1}{4}\) di litro`, r`poco più di \(\frac{1}{2}\) di litro`, r`esattamente \(\frac{1}{2}\) di litro`],
        1,
      ),
    ],
  },
  {
    numero: 25,
    slug: "lanci-di-un-dado",
    titolo: "Lanci di un dado",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "frequenza attesa"],
    difficolta: 1,
    testo: "Si lancia 300 volte un dado non truccato a 6 facce. Quante volte ci si aspetta di ottenere un numero maggiore di 4?",
    suggerimento: r`I numeri maggiori di 4 sono 5 e 6: probabilità \(\frac{2}{6} = \frac{1}{3}\). Su 300 lanci ci si aspetta \(300 \cdot \frac{1}{3} = 100\) volte circa.`,
    parti: [scelta("", ["circa 100 volte", "circa 50 volte", "circa 30 volte", "circa 150 volte"], 0)],
  },
  {
    numero: 26,
    slug: "trapezio-che-ruota",
    titolo: "Il trapezio che ruota",
    ambito: "Spazio e figure",
    temi: ["solidi di rotazione"],
    difficolta: 2,
    testo: "Ruotando di un giro completo un trapezio rettangolo attorno al lato perpendicolare alle basi si ottiene:",
    suggerimento:
      "Le due basi, perpendicolari all'asse di rotazione, descrivono due cerchi di raggio diverso; il lato obliquo descrive una superficie che li unisce. Il solido è un tronco di cono.",
    parti: [scelta("", ["un cono", "un cilindro con una cavità conica", "un cilindro con un cono sovrapposto", "un tronco di cono"], 3)],
  },
  {
    numero: 27,
    slug: "grafico-spazio-tempo",
    titolo: "Il grafico spazio-tempo",
    ambito: "Relazioni e funzioni",
    temi: ["grafici", "velocità", "lettura di grafici"],
    difficolta: 2,
    testo:
      r`Il seguente grafico rappresenta la posizione \(s\) (in km) in funzione del tempo \(t\) (in h) di un oggetto che si muove su una traiettoria rettilinea. ` +
      img("d27", "Grafico della posizione s in km in funzione del tempo t in ore: sale da 0 a 2,5 km fino a t = 1,5 h, resta a 2,5 km fino a t = 2,5 h, poi torna a 0 a t = 3,5 h"),
    suggerimento:
      "a) Il moto parte a t = 0 e finisce a t = 3,5 h: vera. " +
      "b) L'oggetto va a 2,5 km e poi torna indietro fino a 0: in totale percorre 5 km. Falsa. " +
      "c) Da t = 1,5 h a t = 2,5 h la posizione resta 2,5 km: è fermo per 1 h. Vera. " +
      r`d) Nella prima ora e mezza percorre 2,5 km: \(2{,}5 : 1{,}5 \approx 1{,}7\) km/h, non 2,5 km/h. Falsa.`,
    parti: [
      veroFalso(
        [
          "L'oggetto ha impiegato 3,5 h per compiere l'intero percorso",
          "L'oggetto ha percorso in totale 2,5 km",
          "L'oggetto è rimasto nella stessa posizione per 1 h",
          "Nella prima ora e mezza, l'oggetto si è mosso alla velocità media di circa 2,5 km/h",
        ],
        [true, false, true, false],
      ),
    ],
  },
  {
    numero: 28,
    slug: "yogurt",
    titolo: "Il vasetto di yogurt",
    ambito: "Numeri",
    temi: ["percentuali", "proporzioni"],
    difficolta: 1,
    testo: "Su un vasetto di yogurt alla vaniglia da 125 g sono indicati gli ingredienti. In particolare, si legge: «preparazione dolciaria alla vaniglia: 11%».",
    suggerimento:
      r`a) L'11% di 125 g: \(125 \cdot 0{,}11 = 13{,}75 \approx 13{,}8\) g. ` +
      r`b) I valori sono per 100 g: per 125 g si moltiplica per \(1{,}25\): \(16{,}3 \cdot 1{,}25 \approx 20{,}4\) g.`,
    parti: [
      scelta("a) Quanti grammi di preparazione dolciaria alla vaniglia sono presenti, all'incirca, nel vasetto?", ["13,8", "1,3", "11,0", "11,4"], 0),
      scelta(
        r`b) Sulla confezione è riportata anche la tabella dei valori medi nutrizionali per 100 g di yogurt alla vaniglia: \[\begin{array}{|l|r|} \hline \text{Proteine} & 2{,}8\text{ g} \\ \hline \text{Carboidrati} & 16{,}3\text{ g} \\ \hline \text{Grassi} & 3{,}2\text{ g} \\ \hline \end{array}\] Quanti grammi di carboidrati, all'incirca, sono presenti in un vasetto da 125 g?`,
        ["20,4", "13,0", "16,3", "7,7"],
        0,
      ),
    ],
  },
  {
    numero: 29,
    slug: "simmetrie-dei-triangoli",
    titolo: "Simmetrie dei triangoli",
    ambito: "Spazio e figure",
    temi: ["simmetrie", "triangoli"],
    difficolta: 2,
    testo: "Solo una delle seguenti affermazioni è vera. Quale?",
    suggerimento:
      "Nessun triangolo ha un centro di simmetria (ruotato di mezzo giro, un vertice finirebbe su un lato). I triangoli isosceli hanno un asse di simmetria (gli equilateri tre), gli scaleni nessuno: quindi solo «alcuni» triangoli ne hanno uno.",
    parti: [
      scelta(
        "",
        [
          "Ogni triangolo ha un centro di simmetria",
          "Tutti i triangoli equilateri hanno un centro di simmetria",
          "Ogni triangolo ha almeno un asse di simmetria",
          "Alcuni triangoli hanno un asse di simmetria",
        ],
        3,
      ),
    ],
  },
  {
    numero: 30,
    slug: "campione-rappresentativo",
    titolo: "Il campione più rappresentativo",
    ambito: "Dati e previsioni",
    temi: ["indagine statistica", "campionamento"],
    difficolta: 1,
    testo:
      "Andrea, Beatrice, Carlotta e Dario vogliono effettuare un'indagine statistica sui gusti musicali degli studenti delle scuole superiori della loro città. " +
      "Andrea propone di intervistare tutti i 245 alunni delle classi quinte di due scuole superiori della città. " +
      "Beatrice propone di intervistare un numeroso gruppo, scelto a caso, di ragazzi all'uscita da una discoteca della città. " +
      "Carlotta propone di intervistare 200 studenti, scelti a caso tra tutti gli studenti delle scuole superiori della città. " +
      "Dario propone di pubblicare le domande dell'intervista sul giornalino della sua scuola e di raccogliere le risposte pervenute. " +
      "In assenza di altre informazioni, il campione più rappresentativo per l'indagine è quello proposto da",
    suggerimento:
      "Un campione è rappresentativo quando è scelto a caso fra TUTTA la popolazione studiata. Andrea esclude le altre classi e scuole, Beatrice intervista anche chi non va alle superiori e solo chi frequenta una discoteca, Dario raccoglie solo chi risponde spontaneamente in una scuola. Carlotta sceglie a caso fra tutti gli studenti delle superiori della città.",
    parti: [scelta("", ["Andrea", "Beatrice", "Carlotta", "Dario"], 2)],
  },
  {
    numero: 31,
    slug: "quadrato-e-triangolo",
    titolo: "Quadrato e triangolo equilatero",
    ambito: "Spazio e figure",
    temi: ["quadrato", "triangolo equilatero"],
    difficolta: 1,
    adattamento: "Nel fascicolo i segmenti andavano scritti: qui si spuntano fra quelli proposti.",
    testo: "Osserva la seguente figura piana: ABCD è un quadrato e ABE è un triangolo equilatero. " + img("d31", "Il quadrato ABCD con dentro il triangolo equilatero ABE e i segmenti DE e CE"),
    suggerimento:
      "I lati del quadrato sono tutti uguali ad AB: AD, BC, CD. I lati del triangolo equilatero sono tutti uguali ad AB: AE e BE. DE e CE sono più corti, la diagonale AC è più lunga.",
    parti: [
      sceltaMultipla(
        "Quali segmenti hanno la stessa lunghezza del segmento AB? Spunta tutti quelli giusti.",
        ["AD", "BC", "CD", "AE", "BE", "DE", "CE", "AC"],
        [true, true, true, true, true, false, false, false],
      ),
    ],
  },
];

export const PACCHETTO_INVALSI_2015: EsercizioPacchetto[] = creaPacchetto({ anno: 2015, annoScolastico: "2014/15" }, DOMANDE);

if (lanciatoDirettamente(import.meta.url)) {
  scriviPacchetto(PACCHETTO_INVALSI_2015);
}
