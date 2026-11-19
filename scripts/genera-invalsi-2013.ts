/**
 * La prova INVALSI di matematica 2012/13 (classe seconda della secondaria di
 * secondo grado, fascicolo 1): 32 domande, una per esercizio, nei file
 * `content/esercizi/invalsi-2013-dNN-*.json`.
 *
 * Le regole comuni a tutte le prove sono in `scripts/invalsi/comune.ts`.
 * I file JSON NON si correggono a mano: si corregge qui e si rigenera con
 *
 *     npx tsx scripts/genera-invalsi-2013.ts
 *
 * `src/lib/esercizi/__tests__/pacchetto-invalsi-2013.test.ts` controlla che i
 * file su disco coincidano con quello che questo script produce, che reggano
 * la verifica a venti semi e che le risposte giuste prendano tutti i punti.
 *
 * Scelte di trascrizione:
 * - le figure sono ritagliate dal fascicolo (`content/esercizi/immagini/`);
 *   i quattro grafici della D8 sono ridisegnati con i grafici di funzione;
 * - le domande in cui si disegna (D15 a), si scrive un intervallo (D8 d), si
 *   motiva (D24 b, D30) o si scrivono i calcoli (D20 b) sono diventate a
 *   scelta o numeriche; la descrizione lo dice;
 * - le domande di solo testo e calcolo hanno i NUMERI VARIABILI (regole in
 *   `scripts/invalsi/comune.ts`): D2, D7, D11, D17, D18. Le altre restano con i
 *   numeri del fascicolo: legate a un'immagine o a un grafico (D1, D3, D4, D8,
 *   D10, D12, D13, D15, D21, D23, D24, D27, D29, D31, D32), concettuali (D5,
 *   D16, D19, D25, D26), con dati reali (D6 masse di protone ed elettrone,
 *   D9 formato A4, D20 dati Eurostat, D22 previsione ISTAT), con distrattori di
 *   cui non si ricostruisce l'errore (D14, D28) o con conclusioni argomentate
 *   che dipendono da quale offerta conviene (D30).
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
  variabile as v,
  veroFalso,
  type Domanda,
  type EsercizioPacchetto,
} from "./invalsi/comune";

export { testoFile };
export type { EsercizioPacchetto };

/** Le immagini ritagliate dal fascicolo (in `content/esercizi/immagini/`). */
const IMMAGINE = {
  d01foto: "0a28a47d-460a-4bc8-8bb7-13bdd201dc0a.png",
  d01scritta: "1aa950c6-7155-479b-b392-f56f77ab1326.png",
  d01risposte: "526f7bb9-6d8c-46c0-9c35-e80cd26c872a.png",
  d03: "9a69572e-688a-40cb-b2fa-7f167f6d6f66.png",
  d04: "6875751f-f8ba-4485-b34e-e89cba2ec846.png",
  d05: "4c20679c-5ee4-4269-81a1-dc6d4b014a45.png",
  d10solido: "d692a82a-e6a6-451f-b0ab-9eab97975dcf.png",
  d10figure: "941621af-714a-4b0f-a3e3-4512fe217c8a.png",
  d12: "b27c713b-353d-477e-b89a-94dda6fbe053.png",
  d13: "c4921b17-997e-468a-b2a6-2662446237df.png",
  d15: "a43a368d-2945-4f7d-900d-4f9d76424f87.png",
  d17: "91ae4f41-219f-438b-b027-cc33d3b6aaca.png",
  d21: "64b27132-52a1-40d6-99fd-6f67804adcb7.png",
  d23: "20cf5123-1612-4727-9227-432dcc4a465d.png",
  d24: "9c6992c5-43cc-4f11-ae5f-0122d4390d45.png",
  d27: "9d32c6b9-9ec1-409f-9cf2-c5f4fb29970f.png",
  d29: "1c388b7f-8431-414c-99a9-2973dab83c20.png",
  d31: "3e79bff6-48ed-4ba3-9996-4b2e2ce0f180.png",
  d32: "413901cd-afea-4c50-9e19-13decf4ecded.png",
} as const;

const img = (chiave: keyof typeof IMMAGINE, descrizione: string) => immagine(IMMAGINE[chiave], descrizione);

const DOMANDE: Domanda[] = [
  {
    numero: 1,
    slug: "ambulanza-allo-specchio",
    titolo: "L'ambulanza allo specchio",
    ambito: "Spazio e figure",
    temi: ["simmetria assiale", "trasformazioni"],
    difficolta: 1,
    adattamento: "Le quattro scritte delle risposte sono in un'unica immagine, con le lettere A, B, C, D.",
    testo:
      "Osserva la seguente fotografia: " +
      img("d01foto", "Il cofano di un'ambulanza con la scritta AMBULANZA scritta al contrario, come allo specchio") +
      " Gli automobilisti che precedono l'autoambulanza vedono riflessa nello specchietto retrovisore la scritta: " +
      img("d01scritta", "La scritta AMBULANZA leggibile normalmente") +
      ' Se la parola "AMBULANZA" fosse scritta normalmente sulle autoambulanze, in quale dei seguenti modi gli automobilisti la vedrebbero riflessa nello specchietto retrovisore? ' +
      img(
        "d01risposte",
        "Quattro scritte: A ribaltata da destra a sinistra, B normale, C capovolta dall'alto in basso e letta da sinistra, D capovolta dall'alto in basso e ribaltata",
      ),
    suggerimento:
      "Lo specchietto scambia la destra con la sinistra, ma non l'alto con il basso: per questo sulle ambulanze la scritta è ribaltata, così allo specchio si legge dritta. " +
      "Una scritta normale, riflessa, appare ribaltata da destra a sinistra (si legge «AZNALUBMA» con le lettere a specchio) e non capovolta: è la scritta A.",
    parti: [scelta("Quale scritta vedrebbero?", ["A", "B", "C", "D"], 0)],
  },
  {
    numero: 2,
    slug: "stampanti",
    titolo: "Le stampanti",
    ambito: "Numeri",
    temi: ["problemi", "equazioni"],
    difficolta: 1,
    // L resta il triplo di D: il totale è un multiplo di 4 e tutte le
    // risposte sono multipli delle pagine di D (4, 5, 6, 8 volte), mai uguali.
    variabili: [
      v("pagineD", "random(4..12)", "le pagine al minuto della deskjet D (fascicolo: 6)"),
      v("totale", "4*pagineD", "le pagine al minuto di L e D insieme, multiplo di 4 (fascicolo: 24)"),
    ],
    testo:
      r`La stampante laser L in un minuto stampa il triplo delle pagine della stampante deskjet D. Quando L e D lavorano contemporaneamente stampano in tutto \(\var{totale}\) pagine al minuto. ` +
      "Se D viene sostituita con una stampante laser identica a L, quante pagine potranno essere stampate complessivamente in un minuto?",
    suggerimento:
      r`Se D stampa \(p\) pagine al minuto, L ne stampa \(3p\): insieme \(4p = \var{totale}\), quindi \(p = \var{pagineD}\) e L stampa \(\var{3*pagineD}\) pagine al minuto. Due stampanti laser: \(2 \cdot \var{3*pagineD} = \var{6*pagineD}\) pagine al minuto.`,
    // Gli errori del fascicolo (24, 30, 48 con 24): il totale che non cambia,
    // il totale più le pagine di D (si aggiunge D invece di 2D), il doppio del
    // totale.
    parti: [scelta("", [r`\(\var{totale}\)`, r`\(\var{5*pagineD}\)`, r`\(\var{6*pagineD}\)`, r`\(\var{8*pagineD}\)`], 2)],
  },
  {
    numero: 3,
    slug: "popolazione-batterica",
    titolo: "La popolazione batterica",
    ambito: "Relazioni e funzioni",
    temi: ["crescita esponenziale", "percentuali", "grafici"],
    difficolta: 2,
    testo:
      "Una popolazione batterica aumenta nel tempo con un tasso di crescita costante (cioè la variazione percentuale del numero di batteri tra un qualunque giorno e il giorno precedente è costante). " +
      r`La seguente tabella riporta il numero \(N\) di milioni di batteri della popolazione al trascorrere dei giorni: ` +
      r`\[\begin{array}{|c|c|} \hline \text{Giorni trascorsi} & N \text{ (milioni di batteri)} \\ \hline 0 & 1000 \\ \hline 1 & 1100 \\ \hline 2 & 1210 \\ \hline 3 & 1331 \\ \hline 4 & \ldots \\ \hline 5 & \ldots \\ \hline \end{array}\]` +
      img("d03", "Quattro grafici di N in funzione di t, tutti con N = 1000 per t = 0: il grafico 1 cresce sempre più rapidamente, il 2 cresce sempre più lentamente, il 3 sale a gradini, il 4 è una retta poco inclinata"),
    suggerimento:
      r`Ogni giorno il numero aumenta del 10% (\(1100 = 1000 \cdot 1{,}1\), \(1210 = 1100 \cdot 1{,}1\), …): gli aumenti diventano sempre più grandi (100, 110, 121, …). ` +
      r`a) La curva deve salire sempre più ripida: è il grafico 1. ` +
      r`b) \(1331 \cdot 1{,}1 = 1464{,}1\) il quarto giorno e \(1464{,}1 \cdot 1{,}1 = 1610{,}51\) il quinto, cioè \(1000 \cdot 1{,}1^5\). Non si aggiunge 100 ogni giorno: quello sarebbe una crescita lineare.`,
    parti: [
      scelta(
        r`a) Quale fra i grafici può rappresentare l'andamento del numero \(N\) di batteri al variare del tempo \(t\), in almeno 20 giorni?`,
        ["Il grafico 1", "Il grafico 2", "Il grafico 3", "Il grafico 4"],
        0,
      ),
      numerica("b) Quanti milioni di batteri ci saranno il quinto giorno?", "1610.51", "0.5"),
    ],
  },
  {
    numero: 4,
    slug: "altezze-di-due-popolazioni",
    titolo: "Le altezze di due popolazioni",
    ambito: "Dati e previsioni",
    temi: ["distribuzioni", "lettura di grafici", "media"],
    difficolta: 2,
    testo:
      "Nel seguente grafico sono riportate le distribuzioni delle altezze di 1 000 individui di una popolazione A e di 1 200 individui di una popolazione B. " +
      img("d04", "Due curve a campana: popolazione A (1000 individui) da 130 a circa 172 cm con picco di 300 a 150 cm; popolazione B (1200 individui) da circa 142 a 200 cm con picco di 200 a 170 cm"),
    suggerimento:
      "a) La curva di A è centrata intorno a 150 cm, quella di B intorno a 170 cm: in media sono più alti quelli di B. Falsa. " +
      "b) Le due curve si sovrappongono fra 142 e 172 cm: ci sono individui di B più bassi di individui di A. Falsa. " +
      "c) Quasi tutta la curva di A sta a sinistra di 155 cm (il picco è a 150 cm e dopo 155 cm la curva scende in fretta): più della metà ha un'altezza minore di 155 cm. Vera. " +
      "d) I più alti di B arrivano a 200 cm, quelli di A a circa 172 cm. Falsa.",
    parti: [
      veroFalso(
        [
          "Gli individui della popolazione A sono mediamente più alti degli individui della popolazione B",
          "Ogni individuo della popolazione A è più alto di ogni individuo della popolazione B",
          "Più della metà degli individui della popolazione A ha un'altezza minore di 155 cm",
          "Gli individui più alti della popolazione B sono più bassi degli individui più alti della popolazione A",
        ],
        [false, false, true, false],
        "Sulla base delle informazioni fornite dal grafico, indica se ciascuna affermazione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 5,
    slug: "mediana-del-triangolo",
    titolo: "La mediana del triangolo",
    ambito: "Spazio e figure",
    temi: ["triangoli", "area", "mediana"],
    difficolta: 2,
    testo: "H è il punto medio del lato AB del triangolo ABC. " + img("d05", "Il triangolo ABC con il segmento CH che unisce C al punto medio H di AB") + " I triangoli AHC e HBC hanno la stessa area perché",
    suggerimento:
      "L'area di un triangolo è base per altezza diviso 2. Prese come basi AH e HB, che sono uguali, i due triangoli hanno la stessa altezza: la distanza di C dalla retta AB. " +
      "CH non è un'altezza (non è perpendicolare ad AB), i due triangoli non sono congruenti né isosceli in generale.",
    parti: [
      scelta(
        "",
        [
          "la distanza di C da AB è la stessa nei due triangoli e AH = HB",
          "la mediana CH divide il triangolo in due triangoli congruenti",
          "hanno come altezza comune CH e le relative basi sono della stessa lunghezza",
          "i triangoli CHA e CHB sono tutti e due triangoli isosceli",
        ],
        0,
      ),
    ],
  },
  {
    numero: 6,
    slug: "atomo-di-idrogeno",
    titolo: "L'atomo di idrogeno",
    ambito: "Numeri",
    temi: ["notazione scientifica", "potenze", "stime"],
    difficolta: 2,
    testo:
      r`Un atomo di idrogeno contiene un protone la cui massa \(m_p\) è all'incirca \(2 \cdot 10^{-27}\) kg, e un elettrone la cui massa \(m_e\) è all'incirca \(9 \cdot 10^{-31}\) kg. ` +
      r`Quale tra i seguenti valori approssima meglio la massa totale dell'atomo di idrogeno (cioè \(m_p + m_e\))?`,
    suggerimento:
      r`\(9 \cdot 10^{-31} = 0{,}0009 \cdot 10^{-27}\): la massa dell'elettrone è circa duemila volte più piccola di quella del protone. ` +
      r`\(m_p + m_e = 2{,}0009 \cdot 10^{-27} \approx 2 \cdot 10^{-27}\) kg. Non si sommano le mantisse se gli esponenti sono diversi, e gli esponenti si sommano solo nel prodotto.`,
    parti: [
      scelta(
        "",
        [r`\(2 \cdot 10^{-27}\) kg`, r`\(11 \cdot 10^{-31}\) kg`, r`\(11 \cdot 10^{-58}\) kg`, r`\(18 \cdot 10^{-58}\) kg`],
        0,
      ),
    ],
  },
  {
    numero: 7,
    slug: "quadrato-ingrandito",
    titolo: "Il quadrato ingrandito",
    ambito: "Numeri",
    temi: ["percentuali", "area", "quadrato"],
    difficolta: 2,
    // Multipli di 10 fino a 50: l'aumento dell'area resta intero e le quattro
    // risposte della parte b non coincidono mai (p, 2p, 2p + p²/100, 100 + p).
    variabili: [v("perc", "10*random(1..5)", "l'aumento percentuale del lato (fascicolo: 20)")],
    testo: r`Considera un quadrato di lato \(a\).`,
    suggerimento:
      r`a) Aumentare del \(\var{perc}\%\) vuol dire aggiungere \(\var{dpformat(perc/100, 2)}\,a\): \(b = a + \var{dpformat(perc/100, 2)}\,a = \var{dpformat(1 + perc/100, 2)}\,a\). ` +
      r`b) L'area del nuovo quadrato è \(b^2 = (\var{dpformat(1 + perc/100, 2)}\,a)^2 = \var{(100 + perc)^2/10000}\,a^2\): l'area aumenta del \(\var{2*perc + perc^2/100}\%\), non del \(\var{perc}\%\) né del \(\var{2*perc}\%\).`,
    parti: [
      // Gli errori del fascicolo (20a, a + 20, a + 0,20): la percentuale come
      // fattore, la percentuale come addendo, il decimale come addendo.
      scelta(
        r`a) Se si aumenta il lato \(a\) del \(\var{perc}\%\), si ottiene un nuovo quadrato di lato \(b\). Quale delle seguenti espressioni rappresenta la misura di \(b\)?`,
        [r`\(\var{perc}\,a\)`, r`\(\var{dpformat(1 + perc/100, 2)}\,a\)`, r`\(a + \var{perc}\)`, r`\(a + \var{dpformat(perc/100, 2)}\)`],
        1,
      ),
      // Gli errori del fascicolo (20%, 40%, 120%): lo stesso aumento del lato,
      // il doppio (due dimensioni), il fattore 1,20 letto come percentuale.
      scelta(
        r`b) Di quanto aumenta in percentuale l'area del quadrato di lato \(b\) rispetto all'area del quadrato di lato \(a\)?`,
        [r`Del \(\var{perc}\%\)`, r`Del \(\var{2*perc}\%\)`, r`Del \(\var{2*perc + perc^2/100}\%\)`, r`Del \(\var{100 + perc}\%\)`],
        2,
      ),
    ],
  },
  {
    numero: 8,
    slug: "funzione-lineare",
    titolo: "La funzione y = 3x + 1",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "retta", "grafici", "disequazioni"],
    difficolta: 2,
    adattamento:
      "I quattro grafici sono ridisegnati dalla piattaforma; nella parte d, dove nel fascicolo si scriveva la risposta, si sceglie fra quattro intervalli.",
    testo:
      r`Considera la funzione definita da: \(y = 3x + 1\). ` +
      "Grafico 1: [grafico: x - 3 | x: -3..3 | y: -3..3] " +
      "Grafico 2: [grafico: 3*x + 1 | x: -3..3 | y: -3..3] " +
      "Grafico 3: [grafico: 1 - 3*x | x: -3..3 | y: -3..3] " +
      "Grafico 4: [grafico: 3 - 3*x | x: -3..3 | y: -3..3]",
    suggerimento:
      r`a) Per \(x = 0\) si ha \(y = 1\) e il coefficiente di \(x\) è 3, positivo: la retta passa per \((0; 1)\) e sale. È il grafico 2. ` +
      r`b) \(y = 3 \cdot 0 + 1 = 1\). ` +
      r`c) \(3x + 1 = 0\), cioè \(3x = -1\), \(x = -\frac{1}{3}\). ` +
      r`d) \(3x + 1 > 0\), cioè \(3x > -1\), \(x > -\frac{1}{3}\): a destra del punto in cui la retta taglia l'asse \(x\).`,
    parti: [
      scelta("a) Quale dei grafici può rappresentare questa funzione?", ["Il grafico 1", "Il grafico 2", "Il grafico 3", "Il grafico 4"], 1),
      numerica(r`b) Quale valore di \(y\) si ottiene per \(x = 0\)?`, "1"),
      espressione(r`c) Per quale valore di \(x\) si ottiene \(y = 0\)? Se serve, scrivi una frazione (per esempio 2/5).`, "-1/3"),
      scelta(
        r`d) Per quali valori di \(x\) la \(y\) assume valori positivi?`,
        [r`\(x > -\frac{1}{3}\)`, r`\(x < -\frac{1}{3}\)`, r`\(x > \frac{1}{3}\)`, r`\(x > 0\)`],
        0,
      ),
    ],
  },
  {
    numero: 9,
    slug: "foglio-a4",
    titolo: "Il foglio A4",
    ambito: "Numeri",
    temi: ["stime", "misure", "area"],
    difficolta: 2,
    testo:
      r`Su una risma di carta di fogli di formato A4 è scritto: \(80\text{ g/m}^2\) (cioè 80 grammi al metro quadrato); A4 \(210 \times 297\) mm (cioè le dimensioni di un foglio A4 sono 0,210 metri per 0,297 metri). ` +
      "Un foglio A4 è all'incirca",
    suggerimento:
      r`L'area di un foglio è \(0{,}210 \cdot 0{,}297 \approx 0{,}062\text{ m}^2\). Un metro quadrato pesa 80 g, quindi un foglio pesa \(80 \cdot 0{,}062 \approx 5\) g.`,
    parti: [scelta("", ["0,5 grammi", "1,5 grammi", "5 grammi", "10 grammi"], 2)],
  },
  {
    numero: 10,
    slug: "solido-che-ruota",
    titolo: "Il solido che ruota",
    ambito: "Spazio e figure",
    temi: ["solidi", "visualizzazione spaziale", "rotazioni"],
    difficolta: 3,
    testo:
      "Se il solido S viene fatto ruotare, " +
      img("d10solido", "Il solido S, formato da sei cubetti: una fila di quattro, un cubetto sopra il primo a destra e un cubetto dietro il secondo da sinistra") +
      " quale tra le seguenti configurazioni NON può assumere? " +
      img("d10figure", "Quattro solidi formati da sei cubetti, disegnati in posizioni diverse: figura 1, figura 2, figura 3, figura 4"),
    suggerimento:
      "S è una fila di quattro cubetti con un cubetto attaccato a un'estremità (sopra) e uno attaccato al cubetto che sta a due posti di distanza (di lato). Tutte e quattro le figure hanno questa struttura, ma due solidi così possono essere uno l'immagine allo specchio dell'altro, e una rotazione non trasforma un solido nella sua immagine allo specchio. " +
      "Guarda la fila dal cubetto «libero» verso quello con il cubetto sopra: in S il cubetto laterale sta da una certa parte; nelle figure 1, 2 e 3 ruotate in modo che il cubetto in più all'estremità stia sopra, il cubetto laterale finisce dalla stessa parte, nella figura 4 dalla parte opposta. La figura 4 è S visto allo specchio.",
    parti: [scelta("", ["Figura 1", "Figura 2", "Figura 3", "Figura 4"], 3)],
  },
  {
    numero: 11,
    slug: "tondini",
    titolo: "I tondini",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "eventi indipendenti", "evento complementare"],
    difficolta: 2,
    // Gli indici in centesimi, M2 migliore di M1 come nel fascicolo: con
    // q1 < q2 le risposte della parte a sono sempre diverse, e nella parte b
    // il prodotto (sopra l'81%), q2, la somma dei difetti (almeno 4) e la
    // somma degli indici (sotto il 2) non coincidono mai.
    variabili: [
      v("q1", "random(90..96)", "l'indice di qualità di M1, in centesimi (fascicolo: 96)"),
      v("q2", "q1 + random(1..3)", "l'indice di qualità di M2, in centesimi, più alto (fascicolo: 98)"),
    ],
    testo:
      r`Una fabbrica utilizza due diversi macchinari, M1 e M2, per produrre tondini. M1 ha un indice di qualità uguale a \(\var{dpformat(q1/100, 2)}\) (cioè la probabilità che un tondino che esce da M1 non sia difettoso è del \(\var{q1}\%\)), mentre M2 ha indice di qualità uguale a \(\var{dpformat(q2/100, 2)}\).`,
    suggerimento:
      r`a) Difettoso è l'evento contrario di non difettoso: \(1 - \var{dpformat(q2/100, 2)} = \var{dpformat((100 - q2)/100, 2)}\). ` +
      r`b) Il tondino è buono alla fine se è buono dopo M1 E dopo M2; gli eventi sono indipendenti, quindi si moltiplica: \(\var{dpformat(q1/100, 2)} \cdot \var{dpformat(q2/100, 2)} = \var{q1*q2/10000}\), che in percentuale è \(\var{q1*q2/100}\%\).`,
    parti: [
      // Gli errori del fascicolo (0,04, 0,96, 0,98): il difetto di M1, gli
      // indici di qualità di M1 e di M2.
      scelta(
        "a) La probabilità che un tondino esca da M2 difettoso è:",
        [
          r`\(\var{dpformat((100 - q2)/100, 2)}\)`,
          r`\(\var{dpformat((100 - q1)/100, 2)}\)`,
          r`\(\var{dpformat(q1/100, 2)}\)`,
          r`\(\var{dpformat(q2/100, 2)}\)`,
        ],
        0,
      ),
      // Gli errori del fascicolo (98%, 6%, 1,94%): il solo indice di M2, la
      // somma delle probabilità di difetto, la somma degli indici letta come
      // percentuale.
      scelta(
        "b) Per la realizzazione di tondini metallici, M1 e M2 lavorano in serie, cioè ogni tondino viene lavorato prima da M1 e poi da M2. " +
          "Supponiamo che gli eventi «M1 produce un tondino non difettoso» e «M2 produce un tondino non difettoso» siano fra loro indipendenti; allora la probabilità che un tondino non sia difettoso alla fine del ciclo di produzione (cioè dopo essere stato lavorato sia da M1 che da M2) è:",
        [r`\(\var{q2}\%\)`, r`\(\var{q1*q2/100}\%\)`, r`\(\var{200 - q1 - q2}\%\)`, r`\(\var{(q1 + q2)/100}\%\)`],
        1,
      ),
    ],
  },
  {
    numero: 12,
    slug: "materia-preferita",
    titolo: "La materia preferita",
    ambito: "Dati e previsioni",
    temi: ["diagramma a torta", "percentuali", "probabilità", "campione"],
    difficolta: 1,
    testo:
      "In una scuola frequentata da 800 studenti si sceglie un campione di 300 studenti per un sondaggio sulla materia preferita. I risultati del sondaggio sono rappresentati nel seguente diagramma. " +
      img("d12", "Diagramma a torta: matematica 20%, francese 7%, scienze 3%, italiano 27%, inglese 13%, storia 7%, educazione fisica 23%"),
    suggerimento:
      r`Le percentuali si riferiscono al campione di 300 studenti, non agli 800 della scuola. ` +
      r`a) Non hanno scelto matematica l'\(80\%\) del campione: \(300 \cdot 0{,}80 = 240\) studenti. ` +
      r`b) Hanno scelto matematica il \(20\% = \frac{20}{100} = \frac{1}{5}\) del campione.`,
    parti: [
      numerica("a) Qual è il numero di studenti del campione che NON hanno indicato come materia preferita la matematica?", "240"),
      scelta(
        "b) Qual è la probabilità che uno studente, scelto a caso dal campione, abbia indicato come materia preferita la matematica?",
        [r`\(\frac{1}{20}\)`, r`\(\frac{1}{15}\)`, r`\(\frac{1}{7}\)`, r`\(\frac{1}{5}\)`],
        3,
      ),
    ],
  },
  {
    numero: 13,
    slug: "quattro-circonferenze",
    titolo: "Quattro circonferenze",
    ambito: "Spazio e figure",
    temi: ["circonferenza", "cerchio", "area", "perimetro"],
    difficolta: 2,
    testo:
      r`Ricorda che la lunghezza di una circonferenza si calcola moltiplicando il suo diametro per \(\pi\) e che l'area di un cerchio si ottiene moltiplicando il quadrato del suo raggio per \(\pi\). ` +
      "Quattro circonferenze, ciascuna con diametro 10 cm, sono tangenti a due a due come mostrato nella seguente figura. " +
      img("d13", "Quattro cerchi uguali disposti in un quadrato due per due, tangenti fra loro; in grigio la regione al centro, delimitata da quattro archi"),
    suggerimento:
      r`a) La regione grigia è delimitata da quattro archi, ciascuno un quarto di circonferenza: in tutto una circonferenza intera, \(10\pi\) cm. ` +
      r`b) I centri dei quattro cerchi formano un quadrato di lato 10 cm (area \(100\text{ cm}^2\)); dentro il quadrato ci sono quattro quarti di cerchio di raggio 5 cm, cioè un cerchio intero di area \(25\pi\). ` +
      r`La regione grigia misura \(100 - 25\pi \approx 21{,}46\text{ cm}^2\).`,
    parti: [
      scelta("a) Il perimetro della regione evidenziata in grigio misura in centimetri:", [r`\(20\pi\)`, r`\(10\pi\)`, r`\(5\pi\)`, r`\(4\pi\)`], 1),
      numerica(r`b) Quanto misura, in \(\text{cm}^2\), la superficie della regione evidenziata in grigio? Arrotonda ai centesimi.`, "21.46", "0.05"),
    ],
  },
  {
    numero: 14,
    slug: "velocita-media",
    titolo: "La velocità media",
    ambito: "Relazioni e funzioni",
    temi: ["velocità", "media", "problemi"],
    difficolta: 2,
    testo:
      "Un automobilista percorre i primi 120 km di un certo percorso alla velocità media di 60 km/h e i successivi 120 km alla velocità media di 120 km/h. Qual è la sua velocità media durante l'intero percorso?",
    suggerimento:
      r`Non è la media fra 60 e 120. I primi 120 km richiedono 2 ore, i successivi 120 km 1 ora: 240 km in 3 ore, cioè \(240 : 3 = 80\) km/h.`,
    parti: [scelta("", ["70 km/h", "80 km/h", "90 km/h", "100 km/h"], 1)],
  },
  {
    numero: 15,
    slug: "due-simmetrie",
    titolo: "Due simmetrie",
    ambito: "Spazio e figure",
    temi: ["simmetria assiale", "piano cartesiano"],
    difficolta: 2,
    adattamento: "Nella parte a, dove nel fascicolo si segnavano i punti sulla figura, si sceglie la coordinata del punto Q.",
    testo:
      r`Il punto \(P\) in figura ha coordinate \((-3; 1)\). Considera il punto \(Q\), simmetrico di \(P\) rispetto alla retta \(a\), e poi il punto \(R\), simmetrico di \(Q\) rispetto alla retta \(b\). ` +
      img("d15", "Piano cartesiano a quadretti con il punto P(−3; 1), la retta verticale a di equazione x = −5 e la retta b, bisettrice del secondo e quarto quadrante"),
    suggerimento:
      r`La retta \(a\) ha equazione \(x = -5\) e \(P\) sta 2 quadretti alla sua destra: \(Q\) sta 2 quadretti a sinistra, \(Q(-7; 1)\). ` +
      r`La retta \(b\) è \(y = -x\): il simmetrico di \((x; y)\) è \((-y; -x)\), quindi \(R(-1; 7)\).`,
    parti: [
      scelta(r`a) Quali sono le coordinate del punto \(Q\)?`, ["(−7; 1)", "(−1; 3)", "(3; 1)", "(−3; −1)"], 0),
      scelta(r`b) Quali sono le coordinate del punto \(R\)?`, ["(−7; 1)", "(1; 7)", "(7; 1)", "(−1; 7)"], 3),
    ],
  },
  {
    numero: 16,
    slug: "multipli",
    titolo: "Multipli e condizioni",
    ambito: "Numeri",
    temi: ["divisibilità", "multipli", "condizioni necessarie e sufficienti"],
    difficolta: 2,
    testo: "Leggi con attenzione le seguenti proposizioni sui numeri naturali.",
    suggerimento:
      "a) 6 è pari ma non è multiplo di 4. Falsa. " +
      "b) Se un numero è 9·k, è anche 3·(3k). Vera. " +
      "c) «Solo se è pari» vuol dire che essere pari è necessario: ogni multiplo di 6 è 2·(3k), quindi è pari. Vera. " +
      "d) 15 è multiplo di 5 ma non di 10. Falsa.",
    parti: [
      veroFalso(
        [
          "Se un numero è pari allora è multiplo di 4",
          "Se un numero è multiplo di 9 allora è multiplo di 3",
          "Un numero è multiplo di 6 solo se è pari",
          "Un numero è multiplo di 5 se e solo se è multiplo di 10",
        ],
        [false, true, true, false],
        "Indica se ciascuna proposizione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 17,
    slug: "parallelogramma-nel-quadrato",
    titolo: "Il parallelogramma nel quadrato",
    ambito: "Spazio e figure",
    temi: ["area", "parallelogramma", "quadrato"],
    difficolta: 1,
    // La figura non porta misure; AE resta un terzo del lato, come è disegnata.
    variabili: [
      v("k", "random(2..6)", "AE e FC, in cm (fascicolo: 2)"),
      v("lato", "3*k", "il lato del quadrato, il triplo di AE come in figura (fascicolo: 6)"),
    ],
    testo:
      r`Considera il quadrato ABCD il cui lato misura \(\var{lato}\) cm. AE e FC misurano ciascuno \(\var{k}\) cm. ` +
      img("d17", "Il quadrato ABCD con E sul lato AB e F sul lato DC; i segmenti AF ed EC sono paralleli"),
    suggerimento:
      r`AECF è un parallelogramma con base \(AE = \var{k}\) cm e altezza uguale al lato del quadrato, \(\var{lato}\) cm: area \(\var{k} \cdot \var{lato} = \var{k*lato}\text{ cm}^2\). ` +
      r`Oppure: al quadrato (\(\var{lato^2}\text{ cm}^2\)) si tolgono i due triangoli rettangoli \(EBC\) e \(AFD\), ciascuno di area \(\frac{\var{lato-k} \cdot \var{lato}}{2} = \var{(lato-k)*lato/2}\): \(\var{lato^2} - \var{(lato-k)*lato} = \var{k*lato}\).`,
    parti: [numerica(r`Quanto misura la superficie del quadrilatero AECF, in \(\text{cm}^2\)?`, "k*lato")],
  },
  {
    numero: 18,
    slug: "raccolta-differenziata",
    titolo: "La raccolta differenziata",
    ambito: "Numeri",
    temi: ["minimo comune multiplo"],
    difficolta: 1,
    // I tre periodi sono 4, 3 e 2 volte uno stesso numero, come nel fascicolo
    // (28, 21, 14 = 4, 3, 2 volte 7): il mcm è sempre 12 volte quel numero.
    variabili: [
      v("fattore", "random(4..10)", "il fattore comune dei tre periodi (fascicolo: 7)"),
      v("carta", "4*fattore", "i giorni fra due raccolte della carta (fascicolo: 28)"),
      v("vetro", "3*fattore", "i giorni fra due raccolte del vetro (fascicolo: 21)"),
      v("plastica", "2*fattore", "i giorni fra due raccolte della plastica (fascicolo: 14)"),
    ],
    testo:
      r`In un quartiere di una città, il calendario della raccolta differenziata (carta, vetro e plastica) prevede che la raccolta della carta avvenga ogni \(\var{carta}\) giorni, quella del vetro ogni \(\var{vetro}\) giorni e quella della plastica ogni \(\var{plastica}\) giorni. Oggi sono state effettuate le raccolte di carta, vetro e plastica.`,
    suggerimento:
      r`Serve il minimo comune multiplo di \(\var{carta}\), \(\var{vetro}\) e \(\var{plastica}\). ` +
      r`\(\var{carta} = 4 \cdot \var{fattore}\), \(\var{vetro} = 3 \cdot \var{fattore}\), \(\var{plastica} = 2 \cdot \var{fattore}\): il mcm è \(\var{fattore} \cdot \text{mcm}(4, 3, 2) = \var{fattore} \cdot 12 = \var{12*fattore}\).`,
    parti: [numerica("Fra quanti giorni la raccolta di carta, vetro e plastica verrà fatta di nuovo contemporaneamente?", "12*fattore")],
  },
  {
    numero: 19,
    slug: "quadrato-positivo",
    titolo: "Un quadrato positivo",
    ambito: "Numeri",
    temi: ["disequazioni"],
    difficolta: 1,
    testo: r`Nell'insieme dei numeri reali, la disequazione \(x^2 > 0\) è verificata`,
    suggerimento: r`Il quadrato di un numero diverso da zero è sempre positivo (anche per i negativi: \((-3)^2 = 9\)); per \(x = 0\) si ha \(0 > 0\), falso. Quindi per ogni \(x \ne 0\).`,
    parti: [scelta("", [r`per ogni \(x \ne 0\)`, r`per ogni \(x\)`, r`solo per ogni \(x < 0\)`, r`solo per ogni \(x > 0\)`], 0)],
  },
  {
    numero: 20,
    slug: "vittime-della-strada",
    titolo: "Le vittime della strada",
    ambito: "Dati e previsioni",
    temi: ["tabelle", "percentuali", "variazione percentuale"],
    difficolta: 2,
    adattamento: "Nella parte b i calcoli non si scrivono: si inserisce solo il risultato.",
    testo:
      "La seguente tabella riporta il numero di vittime per incidenti stradali dal 2001 al 2007 in una regione italiana (fonte: Eurostat, Regional Transport Statistics). " +
      r`\[\begin{array}{|c|c|} \hline \text{Anno} & \text{Numero di vittime} \\ \hline 2001 & 792 \\ \hline 2002 & 776 \\ \hline 2003 & 700 \\ \hline 2004 & 681 \\ \hline 2005 & 635 \\ \hline 2006 & 539 \\ \hline 2007 & 531 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Le diminuzioni sono 16 (2001-2002), 76 (2002-2003), 19 (2003-2004), 46 (2004-2005): la più grande è fra il 2002 e il 2003. ` +
      r`b) La diminuzione è \(792 - 531 = 261\) vittime, da confrontare con il valore di partenza, quello del 2001: \(\frac{261}{792} \approx 0{,}33\), cioè circa il 33%.`,
    parti: [
      scelta(
        "a) In quale dei seguenti periodi si è avuta la diminuzione più consistente del numero di vittime per incidenti stradali?",
        ["tra il 2001 e il 2002", "tra il 2002 e il 2003", "tra il 2003 e il 2004", "tra il 2004 e il 2005"],
        1,
      ),
      numerica(
        "b) Di quale percentuale è diminuito il numero di vittime per incidenti stradali dal 2001 al 2007? Scrivi solo il numero, arrotondato all'unità.",
        "26100/792",
        "0.5",
      ),
    ],
  },
  {
    numero: 21,
    slug: "retta-r",
    titolo: "La retta r",
    ambito: "Spazio e figure",
    temi: ["retta", "piano cartesiano", "area del triangolo"],
    difficolta: 2,
    testo:
      "Osserva la seguente figura. " +
      img("d21", "Piano cartesiano con la retta r che taglia l'asse x nel punto A, a sinistra dell'origine O, e l'asse y nel punto B, sopra l'origine") +
      r` Le coordinate di \(A\) sono \((-3; 0)\) e l'area del triangolo \(AOB\) è 9. Quale fra le seguenti equazioni rappresenta la retta \(r\)?`,
    suggerimento:
      r`Il triangolo \(AOB\) è rettangolo in \(O\): \(\frac{OA \cdot OB}{2} = 9\) con \(OA = 3\), quindi \(OB = 6\) e \(B(0; 6)\). ` +
      r`La retta passa per \((0; 6)\) e per \((-3; 0)\): sale di 6 mentre \(x\) aumenta di 3, pendenza 2. È \(y = 2x + 6\) (infatti per \(x = -3\) dà 0).`,
    parti: [scelta("", [r`\(y = 2x + 6\)`, r`\(y = -2x - 6\)`, r`\(y = 3x + 9\)`, r`\(y = -3x - 9\)`], 0)],
  },
  {
    numero: 22,
    slug: "italiani-nel-2020",
    titolo: "Gli italiani nel 2020",
    ambito: "Numeri",
    temi: ["percentuali", "problemi"],
    difficolta: 2,
    testo:
      "L'ISTAT, nelle «Previsioni della popolazione italiana per l'Anno 2020», prevede che in quell'anno i quindicenni italiani saranno circa 592 000, cioè lo 0,95% della popolazione italiana del 2020.",
    suggerimento:
      r`Se \(P\) è la popolazione, \(0{,}95\% \cdot P = 592\,000\), cioè \(0{,}0095 \cdot P = 592\,000\): \(P = \frac{592\,000}{0{,}0095} \approx 62\,315\,789\). ` +
      r`Attenzione: 0,95% è \(0{,}0095\), non \(0{,}95\).`,
    parti: [
      numerica(
        "Calcola qual è, secondo l'ISTAT, il numero stimato di italiani nel 2020. Esprimi il risultato con un numero intero (senza spazi né punti).",
        "592000/0.0095",
        "1",
      ),
    ],
  },
  {
    numero: 23,
    slug: "due-cubi-incollati",
    titolo: "Due cubi incollati",
    ambito: "Spazio e figure",
    temi: ["superficie", "cubo", "espressioni letterali"],
    difficolta: 2,
    testo:
      r`Un solido \(S\) è ottenuto incollando uno sopra l'altro due cubi come mostra la seguente figura: ` +
      img("d23", "Un cubo di spigolo a con sopra, al centro della faccia superiore, un cubo più piccolo di spigolo b") +
      r` Quale delle seguenti espressioni esprime l'area della superficie totale del solido \(S\)?`,
    suggerimento:
      r`Il cubo grande ha superficie \(6a^2\), ma un quadrato \(b^2\) della faccia di sopra è coperto: \(6a^2 - b^2\). ` +
      r`Del cubo piccolo si vedono 5 facce (quella di sotto è incollata): \(5b^2\). In tutto \(6a^2 - b^2 + 5b^2 = 6a^2 + 4b^2\).`,
    parti: [scelta("", [r`\(5a^2 + 4b^2\)`, r`\(6a^2 + 4b^2\)`, r`\(6a^2 + 5b^2\)`, r`\(6a^2 + 6b^2\)`], 1)],
  },
  {
    numero: 24,
    slug: "cornici-di-quadrati",
    titolo: "Le cornici di quadrati",
    ambito: "Relazioni e funzioni",
    temi: ["successioni", "regolarità", "argomentare"],
    difficolta: 2,
    adattamento: "Nella parte b la motivazione andava scritta: qui si sceglie fra motivazioni proposte.",
    testo:
      "Al centro della figura c'è un quadrato nero Q. Il quadrato è circondato da una prima cornice bianca formata da 8 quadrati tutti uguali a Q e da una seconda cornice grigia. " +
      "Immagina che la figura si estenda con successive cornici (terza, quarta, ecc.) sempre formate da quadrati tutti uguali a Q. " +
      img("d24", "Il quadrato nero Q al centro, la prima cornice bianca di 8 quadrati e la seconda cornice grigia di 16 quadrati"),
    suggerimento:
      r`La cornice numero \(n\) è il bordo di un quadrato di lato \(2n + 1\) da cui si toglie il quadrato di lato \(2n - 1\): \((2n+1)^2 - (2n-1)^2 = 8n\) quadrati (8, 16, 24, 32, …). ` +
      r`a) La quarta cornice ha \(8 \cdot 4 = 32\) quadrati. ` +
      r`b) Ogni cornice ha un multiplo di 8 quadrati, e 70 non è multiplo di 8 (\(8 \cdot 8 = 64\), \(8 \cdot 9 = 72\)): non è possibile.`,
    parti: [
      numerica("a) Quanti sono i quadrati della quarta cornice?", "32"),
      scelta(
        "b) Se si continua a estendere la figura nello stesso modo, è possibile ottenere una cornice formata da 70 quadrati tutti uguali a Q?",
        [
          "È possibile, perché 70 è un numero pari, come il numero di quadrati di ogni cornice",
          "È possibile: è la nona cornice",
          "Non è possibile, perché il numero di quadrati di ogni cornice è un multiplo di 8, e 70 non è multiplo di 8",
          "Non è possibile, perché le cornici hanno sempre un numero di quadrati multiplo di 10",
        ],
        2,
      ),
    ],
  },
  {
    numero: 25,
    slug: "ordine-crescente",
    titolo: "In ordine crescente",
    ambito: "Numeri",
    temi: ["potenze", "potenze con esponente negativo", "ordinamento"],
    difficolta: 2,
    testo: "Quale tra le seguenti sequenze di numeri è ordinata in modo crescente?",
    suggerimento:
      r`\(-10^4 = -10\,000\); \(-4 \cdot 10^{-4} = -0{,}0004\); \(10^{-4} = 0{,}0001\); \(\frac{1}{10^{-4}} = 10^4 = 10\,000\). ` +
      r`In ordine crescente: \(-10\,000 < -0{,}0004 < 0{,}0001 < 10\,000\), la sequenza A.`,
    parti: [
      scelta(
        "",
        [
          r`\(-10^4,\ -4 \cdot 10^{-4},\ 10^{-4},\ \frac{1}{10^{-4}}\)`,
          r`\(-4 \cdot 10^{-4},\ -10^4,\ \frac{1}{10^{-4}},\ 10^{-4}\)`,
          r`\(-10^4,\ 10^{-4},\ \frac{1}{10^{-4}},\ -4 \cdot 10^{-4}\)`,
          r`\(-4 \cdot 10^{-4},\ -10^4,\ 10^{-4},\ \frac{1}{10^{-4}}\)`,
        ],
        0,
      ),
    ],
  },
  {
    numero: 26,
    slug: "intensita-luminosa",
    titolo: "L'intensità luminosa",
    ambito: "Relazioni e funzioni",
    temi: ["proporzionalità quadratica inversa", "formule"],
    difficolta: 2,
    testo:
      r`Una sorgente luminosa puntiforme è posta nel vuoto. \(I\) è l'intensità luminosa misurata a una distanza \(r\) dalla sorgente. Il prodotto fra l'intensità luminosa \(I\) e il quadrato della distanza \(r\) dalla sorgente è uguale a una costante \(k\).`,
    suggerimento:
      r`a) «Il prodotto fra \(I\) e il quadrato di \(r\)» è \(I \cdot r^2\): \(I \cdot r^2 = k\). ` +
      r`b) Se \(r\) raddoppia, \(r^2\) diventa 4 volte più grande; perché il prodotto resti \(k\), \(I\) deve diventare un quarto: \(\frac{I}{4} \cdot (2r)^2 = I \cdot r^2 = k\).`,
    parti: [
      scelta(
        r`a) Quale fra le seguenti formule esprime la relazione tra \(I\) e \(r\)?`,
        [r`\(\frac{I}{r^2} = k\)`, r`\(\left(\frac{I}{r}\right)^2 = k\)`, r`\(I \cdot r^2 = k\)`, r`\((I \cdot r)^2 = k\)`],
        2,
      ),
      scelta(r`b) Se la distanza \(r\) raddoppia, allora l'intensità luminosa \(I\)`, ["diventa il doppio", "diventa la metà", "diventa il quadruplo", "diventa un quarto"], 3),
    ],
  },
  {
    numero: 27,
    slug: "area-del-quadrato",
    titolo: "L'area del quadrato",
    ambito: "Spazio e figure",
    temi: ["teorema di Pitagora", "area", "quadrato"],
    difficolta: 2,
    testo:
      "ABCD è un quadrato, il segmento EC è lungo 2 dm e il segmento EB è lungo 1 dm. " +
      img("d27", "Il quadrato ABCD con il punto E sul lato AB; il segmento EC è lungo 2 e il segmento EB è lungo 1") +
      " La superficie del quadrato ABCD misura",
    suggerimento:
      r`Il triangolo \(EBC\) è rettangolo in \(B\): per il teorema di Pitagora \(BC^2 = EC^2 - EB^2 = 4 - 1 = 3\). ` +
      r`L'area del quadrato è proprio \(BC^2 = 3\text{ dm}^2\) (il lato è \(\sqrt{3}\) dm).`,
    parti: [scelta("", [r`\(3\text{ dm}^2\)`, r`\(4\text{ dm}^2\)`, r`\(5\text{ dm}^2\)`, r`\(4\sqrt{3}\text{ dm}^2\)`], 0)],
  },
  {
    numero: 28,
    slug: "trote-nel-lago",
    titolo: "Le trote nel lago",
    ambito: "Dati e previsioni",
    temi: ["campione", "proporzioni", "stime"],
    difficolta: 2,
    testo:
      "Un gruppo di biologi, per stimare quante trote ci sono in un lago, ne pesca 200 e, dopo averle marcate, le rigetta nel lago. " +
      "Dopo qualche giorno, utilizzando la stessa rete, vengono pescate 720 trote e solo 12 di esse sono marcate. " +
      "In base a queste informazioni, quante trote possiamo pensare che ci siano all'incirca nel lago?",
    suggerimento:
      r`Nel campione le trote marcate sono \(\frac{12}{720} = \frac{1}{60}\). Se nel lago la proporzione è la stessa, le 200 trote marcate sono \(\frac{1}{60}\) del totale: \(200 \cdot 60 = 12\,000\) trote.`,
    parti: [scelta("", ["2 000", "9 000", "12 000", "144 000"], 2)],
  },
  {
    numero: 29,
    slug: "lampada",
    titolo: "La lampada",
    ambito: "Spazio e figure",
    temi: ["similitudine", "triangoli simili", "proporzioni"],
    difficolta: 2,
    testo:
      "In figura è rappresentata una lampada con paralume e relative misure. " +
      img("d29", "Lampada con paralume: la lampadina è 10 cm sopra il bordo inferiore del paralume, che è 30 cm sopra il piano e sporge di 20 cm dall'asse; il raggio di luce passa per il bordo e arriva sul piano a distanza x dall'asse") +
      r` Quanto misura il raggio \(x\) del cerchio di luce proiettato sul piano d'appoggio della lampada?`,
    suggerimento:
      r`Il raggio di luce parte dalla lampadina e passa per il bordo del paralume: scendendo di 10 cm si sposta di 20 cm. Fino al piano scende di \(10 + 30 = 40\) cm, 4 volte tanto: ` +
      r`per i triangoli simili \(\frac{x}{20} = \frac{40}{10}\), \(x = 80\) cm.`,
    parti: [scelta("", ["50 cm", "60 cm", "70 cm", "80 cm"], 3)],
  },
  {
    numero: 30,
    slug: "motorino",
    titolo: "Il nuovo motorino",
    ambito: "Numeri",
    temi: ["percentuali", "sconti", "argomentare"],
    difficolta: 2,
    adattamento: "Nel fascicolo si sceglieva fra le due offerte e si scrivevano i calcoli: qui si sceglie fra quattro conclusioni con i calcoli.",
    testo:
      "Marco vuole acquistare un nuovo motorino e un amico gli offre 400 euro per il vecchio. Due rivenditori gli fanno le seguenti offerte per lo stesso modello di motorino. " +
      "Offerta A: prezzo di 2500 euro e il 10% di sconto se consegna al rivenditore il vecchio motorino. " +
      "Offerta B: prezzo di 2950 euro, sul quale è praticato uno sconto del 20%. " +
      "Che cosa conviene fare a Marco?",
    suggerimento:
      r`Offerta A: \(2500 - 10\% \cdot 2500 = 2500 - 250 = 2250\) euro, e il vecchio motorino va al rivenditore. ` +
      r`Offerta B: \(2950 - 20\% \cdot 2950 = 2950 - 590 = 2360\) euro, ma Marco vende il vecchio motorino all'amico e incassa 400 euro: spende \(2360 - 400 = 1960\) euro. Conviene B.`,
    parti: [
      scelta(
        "",
        [
          "Conviene l'offerta A consegnando il vecchio motorino: spende 2250 euro, meno dei 2360 euro dell'offerta B",
          "Conviene l'offerta B vendendo il vecchio motorino all'amico: spende 2360 − 400 = 1960 euro, meno dei 2250 euro dell'offerta A",
          "Conviene l'offerta A consegnando il vecchio motorino: spende 2500 − 250 − 400 = 1850 euro, meno dei 1960 euro dell'offerta B",
          "Le due scelte si equivalgono: in entrambi i casi spende 2250 euro",
        ],
        1,
      ),
    ],
  },
  {
    numero: 31,
    slug: "sterlina-euro-dollaro",
    titolo: "Sterlina, euro e dollaro",
    ambito: "Dati e previsioni",
    temi: ["lettura di grafici", "grafici a linee"],
    difficolta: 2,
    testo:
      "Nel seguente grafico sono indicati il rapporto di cambio fra sterlina ed euro dal 2000 al 2010 (linea più scura) e il rapporto di cambio fra sterlina e dollaro dal 2000 al 2010 (linea più chiara). " +
      img("d31", "Grafico a linee dal 2000 al 2010 fra 1,0 e 2,2: la linea scura (euro per una sterlina) e la linea chiara (dollari per una sterlina) si incrociano intorno al 2003; dopo il 2003 la linea chiara sta sempre sopra la scura") +
      " Dalle informazioni riportate sul grafico puoi dedurre che:",
    suggerimento:
      "La linea più alta indica la valuta di cui servono più unità per una sterlina. Fino al 2003 la linea scura (euro) sta sopra la chiara (dollari) quasi sempre; dal 2003 al 2010 la linea chiara (dollari) sta sempre sopra. " +
      "Quindi dal 2003 al 2010 occorrevano più dollari che euro per acquistare una sterlina.",
    parti: [
      scelta(
        "",
        [
          "dal 2000 al 2010 occorrevano più dollari che euro per acquistare una sterlina",
          "dal 2000 al 2010 occorrevano più euro che dollari per acquistare una sterlina",
          "dal 2003 al 2010 occorrevano più dollari che euro per acquistare una sterlina",
          "dal 2003 al 2010 occorrevano più euro che dollari per acquistare una sterlina",
        ],
        2,
      ),
    ],
  },
  {
    numero: 32,
    slug: "sviluppo-del-cubo",
    titolo: "Lo sviluppo del cubo",
    ambito: "Spazio e figure",
    temi: ["cubo", "sviluppo piano", "visualizzazione spaziale"],
    difficolta: 1,
    testo:
      "La seguente figura rappresenta uno sviluppo piano di un cubo. " +
      img("d32", "Sviluppo del cubo: una fila di quattro facce 2, 3, 4, 5; la faccia 6 sopra la 5 e la faccia 1 sotto la 2") +
      " Quale tra le seguenti coppie è formata da facce opposte del cubo?",
    suggerimento:
      "Nella fila di quattro facce 2, 3, 4, 5, che si chiude ad anello attorno al cubo, sono opposte le facce a un posto di distanza: 2 e 4, 3 e 5. Le facce 1 e 6 chiudono il cubo sopra e sotto e sono opposte fra loro.",
    parti: [scelta("", ["1 e 4", "2 e 5", "3 e 5", "4 e 6"], 2)],
  },
];

export const PACCHETTO_INVALSI_2013: EsercizioPacchetto[] = creaPacchetto({ anno: 2013, annoScolastico: "2012/13" }, DOMANDE);

if (lanciatoDirettamente(import.meta.url)) {
  scriviPacchetto(PACCHETTO_INVALSI_2013);
}
