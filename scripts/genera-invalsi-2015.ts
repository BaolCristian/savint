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
 *   accetta qualunque forma equivalente, anche il decimale);
 * - le domande di solo testo e calcolo hanno i NUMERI VARIABILI (regole in
 *   `scripts/invalsi/comune.ts`): D4, D6 (parte b), D7, D8, D9, D12, D13, D15,
 *   D16, D17, D18, D21, D22, D23, D25. Le altre restano con i numeri del
 *   fascicolo: legate a un'immagine o a un grafico (D1, D5, D10, D14, D19,
 *   D27, D31), concettuali (D2, D3, D11, D20, D26, D29, D30), o con
 *   distrattori di cui non si ricostruisce l'errore (D24, D28).
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
  variabile as v,
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
    variabili: [
      v("d", "random(2..4)", "i m³ che il serbatoio perde ogni settimana (fascicolo: 2)"),
      v("entra", "d + random(1..3)", "i m³ che entrano ogni settimana, sempre più di d (fascicolo: 5)"),
      v("esce", "entra + d", "i m³ prelevati ogni settimana (fascicolo: 7)"),
      v("N", "lcm(entra, d)*random(5..10)", "i m³ di oggi, multiplo di d e di entra: N/d e N/entra interi (fascicolo: 100)"),
    ],
    testo:
      r`Una sorgente di montagna alimenta continuativamente un serbatoio con \(\var{entra}\text{ m}^3\) di acqua ogni settimana. ` +
      r`Oggi il serbatoio contiene \(\var{N}\text{ m}^3\) di acqua e un villaggio inizia a prelevare \(\var{esce}\text{ m}^3\) di acqua alla settimana. ` +
      r`Indichiamo con \(n\) i \(\text{m}^3\) di acqua contenuti nel serbatoio e con \(t\) il numero di settimane a partire da oggi: per \(t = 0\) è \(n = \var{N}\).`,
    suggerimento:
      r`Ogni settimana entrano \(\var{entra}\text{ m}^3\) ed escono \(\var{esce}\text{ m}^3\): il serbatoio perde \(\var{d}\text{ m}^3\) a settimana. ` +
      r`a) Dopo 1, 2, 3, 4 settimane contiene \(\var{N-d}\), \(\var{N-2*d}\), \(\var{N-3*d}\), \(\var{N-4*d}\) \(\text{m}^3\). ` +
      r`b) \(n = \var{N} - \var{d}t\). ` +
      r`c) È vuoto quando \(\var{N} - \var{d}t = 0\), cioè dopo \(t = \var{N} : \var{d} = \var{N/d}\) settimane.`,
    parti: [
      numerica(r`a) Completa la tabella. Per \(t = 1\): \(n =\)`, "N - d"),
      numerica(r`Per \(t = 2\): \(n =\)`, "N - 2*d"),
      numerica(r`Per \(t = 3\): \(n =\)`, "N - 3*d"),
      numerica(r`Per \(t = 4\): \(n =\)`, "N - 4*d"),
      espressione(r`b) Scrivi un'espressione che rappresenti \(n\) in funzione di \(t\). \(n =\)`, "{N} - {d}*t"),
      // Gli errori del fascicolo (20, 98, 102 con 100, 5, 2): divide per
      // l'acqua che entra invece che per quella persa, toglie o aggiunge
      // una sola settimana di perdita.
      scelta(
        "c) Dopo quante settimane il serbatoio sarà vuoto?",
        [r`\(\var{N/entra}\) settimane`, r`\(\var{N/d}\) settimane`, r`\(\var{N-d}\) settimane`, r`\(\var{N+d}\) settimane`],
        1,
      ),
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
    // Variabile solo la parte b: la a dipende dal mazzo, che è sempre quello.
    variabili: [v("k", "random(2..11)", "le carte di fiori tolte (fascicolo: 7)")],
    suggerimento:
      r`a) Restano 48 carte, di cui 12 di cuori: \(\frac{12}{48} = \frac{1}{4}\). ` +
      r`b) Se si tolgono \(x\) carte di fiori restano \(52 - x\) carte, di cui \(13 - x\) di fiori: \(\frac{13 - x}{52 - x} = \frac{\var{13-k}}{\var{52-k}}\). ` +
      r`Moltiplicando in croce \(\var{52-k}(13 - x) = \var{13-k}(52 - x)\), cioè \(\var{13*(52-k)} - \var{52-k}x = \var{52*(13-k)} - \var{13-k}x\), da cui \(39x = \var{39*k}\) e \(x = \var{k}\). ` +
      r`Infatti \(52 - \var{k} = \var{52-k}\) e \(13 - \var{k} = \var{13-k}\).`,
    parti: [
      espressione("a) Si estrae una carta a caso. Qual è la probabilità che sia di cuori? Scrivi il risultato come frazione (per esempio 3/5).", "1/4"),
      numerica(
        r`b) Da un altro mazzo di 52 carte, completo, sono state tolte alcune carte di fiori. Dopo questa operazione la probabilità di estrarre, a caso, una carta di fiori è \(\frac{\var{13-k}}{\var{52-k}}\). Quante carte di fiori sono state tolte?`,
        "k",
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
    variabili: [
      v("k", "random(5..12)", "quante volte l'ombra dell'obelisco è più lunga di quella del palo (fascicolo: 8)"),
      v("s", "random(5..9)/10", "l'ombra del palo in metri, un decimale (fascicolo: 0,8)"),
      v("p", "random(3..6)/2", "l'altezza del palo in metri, da 1,5 a 3 (fascicolo: 2,5)"),
      v("ombra", "k*s", "l'ombra dell'obelisco in metri, un decimale (fascicolo: 6,4)"),
      v("h", "k*p", "l'altezza dell'obelisco, intera o con ,5 (fascicolo: 20)"),
    ],
    testo:
      "Arturo vuole misurare l'altezza di un obelisco che si trova al centro della piazza principale della sua città. " +
      r`A una certa ora di un giorno di sole, l'obelisco proietta un'ombra di circa \(\var{ombra}\) metri, e un palo alto \(\var{p}\) metri, che si trova nella stessa piazza, proietta un'ombra di circa \(\var{s}\) metri. ` +
      "Supponi che la piazza sia orizzontale e che l'obelisco e il palo siano verticali.",
    suggerimento:
      r`Alla stessa ora i raggi del sole sono paralleli: obelisco e palo formano con le loro ombre due triangoli rettangoli simili. ` +
      r`Quindi \(\frac{h}{\var{ombra}} = \frac{\var{p}}{\var{s}}\), da cui \(h = \frac{\var{ombra} \cdot \var{p}}{\var{s}} = \var{h}\) m.`,
    parti: [numerica("Qual è l'altezza dell'obelisco, in metri?", "h", "0.1")],
  },
  {
    numero: 8,
    slug: "tariffa-telefonica",
    titolo: "La tariffa del cellulare",
    ambito: "Relazioni e funzioni",
    temi: ["modellizzazione", "problemi"],
    difficolta: 2,
    variabili: [
      v("c", "random(10..20)", "lo scatto alla risposta, in centesimi (fascicolo: 15)"),
      v("m", "random(8..15)", "il costo di un minuto, in centesimi (fascicolo: 12)"),
      v("durata", "random(4..12)", "i minuti interi della telefonata (fascicolo: 7)"),
      v("secondi", "random(5..55)", "i secondi oltre i minuti interi (fascicolo: 10)"),
      v("E", "random(3..6)", "il credito in euro (fascicolo: 4)"),
      v("costo", "(c + (durata+1)*m)/100", "il costo della telefonata in euro"),
      v("minuti", "floor((100*E - c)/m)", "i minuti pagabili con il credito"),
    ],
    testo:
      r`Il piano tariffario di un cellulare prevede un costo di \(\var{dpformat(c/100, 2)}\) euro per lo «scatto alla risposta» più \(\var{dpformat(m/100, 2)}\) euro per minuto o frazione di minuto di conversazione. ` +
      r`Per esempio, se parlo 1 minuto e 1 secondo pago \((\var{dpformat(c/100, 2)} + \var{dpformat(2*m/100, 2)})\) euro, come se parlassi esattamente 2 minuti.`,
    suggerimento:
      r`a) \(\var{durata}\) minuti e \(\var{secondi}\) secondi si pagano come \(\var{durata+1}\) minuti: ` +
      r`\(\var{dpformat(c/100, 2)} + \var{durata+1} \cdot \var{dpformat(m/100, 2)} = \var{dpformat(c/100, 2)} + \var{dpformat((durata+1)*m/100, 2)} = \var{dpformat(costo, 2)}\) euro. ` +
      r`b) Tolto lo scatto restano \(\var{E} - \var{dpformat(c/100, 2)} = \var{dpformat(E - c/100, 2)}\) euro, e \(\var{dpformat(E - c/100, 2)} : \var{dpformat(m/100, 2)} \approx \var{dpformat((100*E - c)/m, 2)}\): ` +
      r`si possono pagare \(\var{minuti}\) minuti. Il \(\var{minuti+1}\)° porterebbe la spesa a \(\var{dpformat(c/100, 2)} + \var{minuti+1} \cdot \var{dpformat(m/100, 2)} = \var{dpformat((c + (minuti+1)*m)/100, 2)}\) euro.`,
    parti: [
      numerica(r`a) Quanti euro si spendono per una telefonata che dura \(\var{durata}\) minuti e \(\var{secondi}\) secondi?`, "costo"),
      numerica(
        r`b) Se nel cellulare mi è rimasto un credito di \(\var{E}\) euro e voglio fare una telefonata, quanti minuti al massimo posso farla durare?`,
        "minuti",
      ),
    ],
  },
  {
    numero: 9,
    slug: "distanza-da-scuola",
    titolo: "Distanza da scuola",
    ambito: "Dati e previsioni",
    temi: ["tabelle", "percentuali", "frequenze"],
    difficolta: 1,
    // Gli alunni restano 25 (ogni alunno vale il 4%). Con n1 + n2 fra 6 e 11
    // e n3 fra 4 e 5 i quattro distrattori non coincidono mai: n3 < n1 + n2
    // e n1 + n2 + n3 ≠ 4·n3.
    variabili: [
      v("n1", "random(1..3)", "alunni fra 100 e 500 m (fascicolo: 2)"),
      v("n2", "random(5..8)", "alunni fra 500 e 1000 m (fascicolo: 8)"),
      v("n3", "random(4..5)", "alunni fra 1000 e 1500 m (fascicolo: 5)"),
      v("n4", "random(4..8)", "alunni fra 1500 e 2000 m (fascicolo: 7)"),
      v("n5", "25 - n1 - n2 - n3 - n4", "alunni fra 2000 e 2500 m, perché siano 25 in tutto: da 1 a 11 (fascicolo: 3)"),
    ],
    testo:
      r`Nella seguente tabella, \(d\) rappresenta la distanza in metri fra l'abitazione e la scuola di ciascuno degli alunni di una classe. ` +
      r`\[\begin{array}{|c|c|} \hline \text{Distanza dalla scuola (m)} & \text{Numero di alunni} \\ \hline 100 \le d < 500 & \var{n1} \\ \hline 500 \le d < 1000 & \var{n2} \\ \hline 1000 \le d < 1500 & \var{n3} \\ \hline 1500 \le d < 2000 & \var{n4} \\ \hline 2000 \le d < 2500 & \var{n5} \\ \hline \end{array}\]`,
    suggerimento:
      r`Gli alunni sono in tutto \(\var{n1} + \var{n2} + \var{n3} + \var{n4} + \var{n5} = 25\). ` +
      r`a) Meno di 1 km vuol dire meno di 1000 m: \(\var{n1} + \var{n2} = \var{n1+n2}\) alunni. ` +
      r`b) Meno di 1,5 km: \(\var{n1} + \var{n2} + \var{n3} = \var{n1+n2+n3}\) alunni, e \(\frac{\var{n1+n2+n3}}{25} = \frac{\var{4*(n1+n2+n3)}}{100}\), cioè il \(\var{4*(n1+n2+n3)}\%\).`,
    parti: [
      numerica("a) Quanti sono gli alunni che abitano a meno di 1 km dalla scuola?", "n1 + n2"),
      // Gli errori del fascicolo (15%, 20%, 40%): il numero di alunni preso
      // per percentuale, la sola fascia 1000-1500, la sola distanza < 1 km.
      scelta(
        "b) Qual è la percentuale di alunni che abitano a meno di 1,5 km dalla scuola?",
        [r`\(\var{n1+n2+n3}\%\)`, r`\(\var{4*n3}\%\)`, r`\(\var{4*(n1+n2)}\%\)`, r`\(\var{4*(n1+n2+n3)}\%\)`],
        3,
      ),
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
    // L'andamento del fascicolo (fredda la notte, sopra lo zero verso le 13),
    // con scarti casuali. L'ultima misura corregge la somma perché sia un
    // multiplo di 8: la media resta intera. Con tutte le scelte di mezzo si
    // ritrova il fascicolo (-8, -10, -10, -3, +1, -1, -3, -6).
    variabili: [
      v("t1", "random(-9..-6)", "ore 1 (fascicolo: -8)"),
      v("t2", "t1 - random(1..3)", "ore 4 (fascicolo: -10)"),
      v("t3", "t2 + random(-1..1)", "ore 7 (fascicolo: -10)"),
      v("t4", "random(-4..-2)", "ore 10 (fascicolo: -3)"),
      v("t5", "random(-1..3)", "ore 13 (fascicolo: +1)"),
      v("t6", "t5 - random(1..3)", "ore 16 (fascicolo: -1)"),
      v("t7", "t6 - random(1..3)", "ore 19 (fascicolo: -3)"),
      v("base", "t7 - 3", "ore 22 prima della correzione"),
      v("resto", "mod(t1 + t2 + t3 + t4 + t5 + t6 + t7 + base, 8)", "quanto la somma supera un multiplo di 8"),
      v("t8", "if(resto > 4, base - resto + 8, base - resto)", "ore 22, spostata al più di 4 gradi perché la media sia intera (fascicolo: -6)"),
      v("somma", "t1 + t2 + t3 + t4 + t5 + t6 + t7 + t8", "la somma delle otto misure"),
      v("tmax", "max([t1, t2, t3, t4, t5, t6, t7, t8])", "la temperatura massima"),
      v("tmin", "min([t1, t2, t3, t4, t5, t6, t7, t8])", "la temperatura minima"),
    ],
    testo:
      "Una stazione meteorologica nelle Alpi ha misurato le temperature, in gradi centigradi (°C), durante un giorno di dicembre. I dati raccolti sono riportati nella seguente tabella. " +
      r`\[\begin{array}{|c|c|} \hline \text{Ora} & \text{Temperatura (°C)} \\ \hline 1 & \var{t1} \\ \hline 4 & \var{t2} \\ \hline 7 & \var{t3} \\ \hline 10 & \var{t4} \\ \hline 13 & \var{t5} \\ \hline 16 & \var{t6} \\ \hline 19 & \var{t7} \\ \hline 22 & \var{t8} \\ \hline \end{array}\]`,
    suggerimento:
      r`a) La massima è \(\var{tmax}\) °C, la minima \(\var{tmin}\) °C: \(\var{tmax} - (\var{tmin}) = \var{tmax - tmin}\) °C. ` +
      r`b) La somma delle otto misure è \(\var{somma}\), e \(\var{somma} : 8 = \var{somma/8}\) °C.`,
    parti: [
      numerica(
        "a) Qual è l'escursione termica, cioè la differenza tra la temperatura massima e la temperatura minima, nel giorno considerato, in °C?",
        "tmax - tmin",
      ),
      numerica(r`b) Qual è la temperatura media \(T_M\) relativa alle misure riportate in tabella, in °C?`, "somma/8"),
    ],
  },
  {
    numero: 13,
    slug: "palo-nello-stagno",
    titolo: "Il palo nello stagno",
    ambito: "Numeri",
    temi: ["equazioni", "frazioni", "problemi"],
    difficolta: 2,
    variabili: [
      v("a", "random(3..5)", "il palo interrato è 1/a (fascicolo: 5)"),
      v("b", "a + random(1..2)", "il palo in acqua è 1/b (fascicolo: 6)"),
      v("L", "random(50..120)/10", "la parte fuori dall'acqua, in metri, un decimale (fascicolo: 8,9)"),
      v("palo", "L/(1 - 1/a - 1/b)", "la lunghezza del palo"),
    ],
    testo:
      r`Un palo verticale è piantato in uno stagno. \(\frac{1}{\var{a}}\) del palo è interrato nel fondale, \(\frac{1}{\var{b}}\) è immerso in acqua e la parte del palo che esce dall'acqua è lunga \(\var{L}\) metri.`,
    suggerimento:
      r`a) Le tre parti insieme fanno tutto il palo: \(\frac{1}{\var{a}}x + \frac{1}{\var{b}}x + \var{L} = x\). ` +
      r`b) \(\frac{1}{\var{a}} + \frac{1}{\var{b}} = \frac{\var{a+b}}{\var{a*b}}\), quindi la parte fuori dall'acqua è \(\frac{\var{a*b-a-b}}{\var{a*b}}\) del palo: \(\frac{\var{a*b-a-b}}{\var{a*b}}x = \var{L}\), ` +
      r`\(x = \frac{\var{L} \cdot \var{a*b}}{\var{a*b-a-b}} \approx \var{dpformat(palo, 2)}\) m.`,
    parti: [
      scelta(
        r`a) Quale delle seguenti equazioni consente di determinare la lunghezza totale \(x\) del palo?`,
        [
          r`\(\frac{1}{\var{a}} + \frac{1}{\var{b}} + \var{L} = x\)`,
          r`\(\frac{1}{\var{a}}x + \frac{1}{\var{b}}x = x + \var{L}\)`,
          r`\(\frac{1}{\var{a}}x + \frac{1}{\var{b}}x + x = \var{L}\)`,
          r`\(\frac{1}{\var{a}}x + \frac{1}{\var{b}}x + \var{L} = x\)`,
        ],
        3,
      ),
      numerica(r`b) Qual è la lunghezza totale \(x\) del palo, in metri? Arrotonda ai centesimi.`, "palo", "0.01"),
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
    variabili: [
      v("m", "random(2..9)", "il coefficiente angolare della prima retta (fascicolo: 3)"),
      v("q1", "random(4..9)", "la prima retta è y = mx - q1 (fascicolo: 5)"),
      v("q2", "random(1..3)", "la seconda retta è y = k/2 x - q2 (fascicolo: 1)"),
    ],
    testo:
      r`Nel piano cartesiano \(Oxy\) la retta di equazione \(y = \var{m}x - \var{q1}\) e la retta di equazione \(y = \frac{k}{2}x - \var{q2}\) sono tra loro parallele; il valore di \(k\) è`,
    suggerimento: r`Due rette sono parallele quando hanno lo stesso coefficiente angolare: \(\frac{k}{2} = \var{m}\), quindi \(k = \var{2*m}\).`,
    // Gli errori del fascicolo (-3, -6, 3): il coefficiente opposto (come per
    // le perpendicolari, senza invertirlo), il suo doppio, il coefficiente
    // senza moltiplicare per 2.
    parti: [scelta("", [r`\(\var{-m}\)`, r`\(\var{-2*m}\)`, r`\(\var{m}\)`, r`\(\var{2*m}\)`], 3)],
  },
  {
    numero: 16,
    slug: "due-cubi",
    titolo: "Due cubi",
    ambito: "Spazio e figure",
    temi: ["volume", "similitudine"],
    difficolta: 1,
    // Niente 3: il distrattore 3·r coinciderebbe con r².
    variabili: [v("r", "random(2, 4, 5, 6, 7, 8, 9)", "il rapporto fra gli spigoli (fascicolo: 5)")],
    testo: r`Il rapporto tra gli spigoli di due cubi è \(\var{r}\). Qual è il rapporto tra i loro volumi?`,
    suggerimento: r`Il volume di un cubo è lo spigolo al cubo: se uno spigolo è \(\var{r}\) volte l'altro, il volume è \(\var{r}^3 = \var{r^3}\) volte l'altro.`,
    // Gli errori del fascicolo (5, 15, 25): il rapporto stesso, il rapporto
    // per 3, il rapporto al quadrato (come per le aree).
    parti: [scelta("", [r`\(\var{r}\)`, r`\(\var{3*r}\)`, r`\(\var{r^2}\)`, r`\(\var{r^3}\)`], 3)],
  },
  {
    numero: 17,
    slug: "lavanderia",
    titolo: "La lavanderia a gettoni",
    ambito: "Numeri",
    temi: ["problemi", "divisione"],
    difficolta: 1,
    // Con almeno 8 minuti fra carico e svuotamento e almeno 8 ore di apertura,
    // chi li dimentica ottiene sempre un numero più grande.
    variabili: [
      v("h1", "random(8..9)", "l'ora di apertura (fascicolo: 9)"),
      v("h2", "random(17..19)", "l'ora di chiusura (fascicolo: 18)"),
      v("ciclo", "random(25..40)", "i minuti del ciclo di lavaggio (fascicolo: 33)"),
      v("carico", "random(5..10)", "i minuti del carico (fascicolo: 10)"),
      v("svuota", "random(3..6)", "i minuti dello svuotamento (fascicolo: 5)"),
      v("aperto", "60*(h2 - h1)", "i minuti di apertura"),
      v("lavaggio", "ciclo + carico + svuota", "i minuti di un lavaggio completo"),
    ],
    testo:
      r`Una lavanderia a gettoni lavora con orario continuato dalle \(\var{h1}\) alle \(\var{h2}\). Ogni lavatrice effettua cicli di lavaggio della durata di \(\var{ciclo}\) minuti, ai quali si devono aggiungere \(\var{carico}\) minuti per l'operazione di carico e \(\var{svuota}\) per lo svuotamento.`,
    suggerimento:
      r`Dalle \(\var{h1}\) alle \(\var{h2}\) ci sono \(\var{h2-h1}\) ore, cioè \(\var{aperto}\) minuti. Un lavaggio completo dura \(\var{ciclo} + \var{carico} + \var{svuota} = \var{lavaggio}\) minuti. ` +
      r`\(\var{aperto} : \var{lavaggio}\) fa \(\var{floor(aperto/lavaggio)}\) con resto \(\var{mod(aperto, lavaggio)}\): i lavaggi completi sono \(\var{floor(aperto/lavaggio)}\).`,
    parti: [
      numerica(
        "Quanti lavaggi completi, comprensivi di carico e svuotamento, può effettuare al massimo una lavatrice nell'arco della giornata?",
        "floor(aperto/lavaggio)",
      ),
    ],
  },
  {
    numero: 18,
    slug: "effetti-collaterali",
    titolo: "Effetti collaterali",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "eventi indipendenti", "percentuali"],
    difficolta: 2,
    variabili: [
      v("p", "random(2..5)", "la percentuale di vertigini (fascicolo: 2)"),
      v("q", "random(6, 7, 9)", "la percentuale di bruciori; niente 8, che vorrebbe «l'8%» (fascicolo: 7)"),
    ],
    testo:
      r`Nel foglietto illustrativo contenuto nella confezione di un farmaco, alla voce «Effetti collaterali» si legge che: il \(\var{p}\%\) dei pazienti trattati con il farmaco ha accusato vertigini; il \(\var{q}\%\) dei pazienti trattati con il farmaco ha avuto bruciori di stomaco. ` +
      "I due tipi di effetti collaterali sono indipendenti l'uno dall'altro.",
    suggerimento:
      r`a) L'evento contrario di «avere bruciori» ha probabilità \(100\% - \var{q}\% = \var{100-q}\%\). ` +
      r`b) Per eventi indipendenti la probabilità che accadano entrambi è il prodotto: \(\var{p/100} \cdot \var{q/100} = \var{p*q/10000}\), cioè lo \(\var{p*q/100}\%\).`,
    parti: [
      numerica(
        "a) Qual è la probabilità che un paziente che ha assunto il farmaco NON abbia bruciori di stomaco? Esprimi il risultato in forma percentuale (scrivi solo il numero).",
        "100 - q",
      ),
      // Gli errori del fascicolo (9%, 14%, 0,9%): la somma delle percentuali,
      // il prodotto dei due numeri preso per percentuale, la somma dei
      // decimali (0,02 + 0,07 = 0,09) letta come 0,9%.
      scelta(
        "b) Qual è la probabilità che un paziente che ha assunto il farmaco manifesti ENTRAMBI gli effetti collaterali?",
        [r`\(\var{p+q}\%\)`, r`\(\var{p*q/100}\%\)`, r`\(\var{p*q}\%\)`, r`\(\var{(p+q)/10}\%\)`],
        1,
      ),
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
    variabili: [v("n", "random(20..60)", "l'esponente minore (fascicolo: 43)")],
    testo: r`L'espressione \(a^{\var{n}} + a^{\var{n+1}}\) è uguale a`,
    suggerimento:
      r`Si raccoglie \(a^{\var{n}}\): \(a^{\var{n}} + a^{\var{n+1}} = a^{\var{n}} + a^{\var{n}} \cdot a = a^{\var{n}}(1 + a)\). ` +
      "La somma di due potenze NON è una potenza con gli esponenti sommati: quello vale per il prodotto.",
    // Gli errori del fascicolo: esponenti moltiplicati, esponenti sommati,
    // esponenti sommati e coefficienti sommati.
    parti: [
      scelta(
        "",
        [r`\(a^{\var{n+1} \cdot \var{n}}\)`, r`\(a^{\var{n}} \cdot (a + 1)\)`, r`\(a^{\var{2*n+1}}\)`, r`\(2a^{\var{2*n+1}}\)`],
        1,
      ),
    ],
  },
  {
    numero: 22,
    slug: "palline-blu",
    titolo: "Le palline blu",
    ambito: "Dati e previsioni",
    temi: ["probabilità"],
    difficolta: 2,
    variabili: [
      v("rosse", "random(18..28)", "le palline rosse (fascicolo: 23)"),
      v("blu", "random(12..20)", "le palline blu (fascicolo: 17)"),
    ],
    testo:
      r`Un'urna contiene \(\var{rosse+blu}\) palline identiche tranne che per il colore: \(\var{rosse}\) sono rosse e \(\var{blu}\) blu. Si estraggono contemporaneamente due palline dall'urna. Entrambe sono blu. ` +
      "Senza reintrodurre le due palline estratte, si estrae dall'urna una terza pallina.",
    suggerimento: r`Dopo le due estrazioni restano \(\var{rosse+blu-2}\) palline, di cui \(\var{blu} - 2 = \var{blu-2}\) blu: la probabilità è \(\frac{\var{blu-2}}{\var{rosse+blu-2}}\).`,
    parti: [espressione("Qual è la probabilità che anche la terza pallina sia blu? Scrivi il risultato come frazione.", "{blu-2}/{rosse+blu-2}")],
  },
  {
    numero: 23,
    slug: "media-di-due-gruppi",
    titolo: "La media di due gruppi",
    ambito: "Dati e previsioni",
    temi: ["media", "media ponderata"],
    difficolta: 2,
    // Gli studenti restano 100 e i gruppi mai uguali (la media semplice
    // sarebbe giusta); n1 e lo scarto multipli di 10: la media è intera.
    variabili: [
      v("n1", "10*random(1..4)", "gli studenti del primo gruppo (fascicolo: 20)"),
      v("n2", "100 - n1", "gli studenti del secondo gruppo (fascicolo: 80)"),
      v("m2", "random(50..70)", "la media del secondo gruppo (fascicolo: 65)"),
      v("m1", "m2 + 10*random(1..3)", "la media del primo gruppo, più alta (fascicolo: 85)"),
    ],
    testo:
      r`Lo stesso test di matematica è stato proposto a due diversi gruppi di studenti. Il primo gruppo, composto da \(\var{n1}\) studenti, ha ottenuto un punteggio medio di \(\var{m1}\) e il secondo, composto da \(\var{n2}\) studenti, ha ottenuto un punteggio medio di \(\var{m2}\).`,
    suggerimento:
      r`Non è la media fra \(\var{m1}\) e \(\var{m2}\): i gruppi hanno numeri diversi. ` +
      r`Il punteggio totale è \(\var{n1} \cdot \var{m1} + \var{n2} \cdot \var{m2} = \var{n1*m1} + \var{n2*m2} = \var{n1*m1 + n2*m2}\), e \(\var{n1*m1 + n2*m2} : 100 = \var{(n1*m1 + n2*m2)/100}\).`,
    parti: [numerica("Qual è il punteggio medio ottenuto dai 100 studenti dei due gruppi?", "(n1*m1 + n2*m2)/100")],
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
    variabili: [v("lanci", "60*random(3..10)", "i lanci, multiplo di 60: tutti i distrattori sono interi (fascicolo: 300)")],
    testo: r`Si lancia \(\var{lanci}\) volte un dado non truccato a 6 facce. Quante volte ci si aspetta di ottenere un numero maggiore di 4?`,
    suggerimento: r`I numeri maggiori di 4 sono 5 e 6: probabilità \(\frac{2}{6} = \frac{1}{3}\). Su \(\var{lanci}\) lanci ci si aspetta \(\var{lanci} \cdot \frac{1}{3} = \var{lanci/3}\) volte circa.`,
    // Gli errori del fascicolo (50, 30, 150 su 300): una faccia sola (1/6),
    // un decimo, la metà (maggiore o uguale a 4).
    parti: [
      scelta(
        "",
        [r`circa \(\var{lanci/3}\) volte`, r`circa \(\var{lanci/6}\) volte`, r`circa \(\var{lanci/10}\) volte`, r`circa \(\var{lanci/2}\) volte`],
        0,
      ),
    ],
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
