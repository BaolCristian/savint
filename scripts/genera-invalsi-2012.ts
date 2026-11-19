/**
 * La prova INVALSI di matematica 2011/12 (classe seconda della secondaria di
 * secondo grado): 30 domande, una per esercizio, nei file
 * `content/esercizi/invalsi-2012-dNN-*.json`.
 *
 * Le regole comuni a tutte le prove sono in `scripts/invalsi/comune.ts`; il
 * modello di riferimento è `scripts/genera-invalsi-2015.ts`. I file JSON NON
 * si correggono a mano: si corregge qui e si rigenera con
 *
 *     npx tsx scripts/genera-invalsi-2012.ts
 *
 * `src/lib/esercizi/__tests__/pacchetto-invalsi-2012.test.ts` controlla che i
 * file su disco coincidano con quello che questo script produce, che reggano
 * la verifica a venti semi e che le risposte giuste prendano tutti i punti.
 *
 * Scelte di trascrizione:
 * - le figure e i grafici sono ritagliati dal fascicolo
 *   (`content/esercizi/immagini/`, copiate dal seed);
 * - le domande da argomentare (D8, D11 b e c, D16, D23 b) sono diventate a
 *   scelta fra motivazioni proposte; la descrizione lo dice;
 * - i «calcoli da scrivere» (D20, D24) non si correggono: resta il risultato.
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
  veroFalso,
  type Domanda,
  type EsercizioPacchetto,
} from "./invalsi/comune";

/** Le immagini ritagliate dal fascicolo (in `content/esercizi/immagini/`). */
const IMMAGINE = {
  d02: "7aa3cdcb-3555-401d-b0ac-d83c7cb53e07.png",
  d03: "766ce61b-9649-46cf-80e8-eb0a515b5d93.png",
  d04: "673685b7-0d84-4015-a245-b27c218101f7.png",
  d06: "1ad1d28f-d0a6-41f7-95be-503763145e9e.png",
  d08: "9bd1e874-2d47-4fe0-8c87-e2a7e22126bc.png",
  d09: "2dc10e1e-d42a-42d6-9326-b38256f229d7.png",
  d10: "fa014805-98ce-4fa2-9d1c-efa6a345e645.png",
  d13: "97964789-2ee2-4854-9f43-455fa88a8af9.png",
  d17: "b87d0acc-11fe-4c0d-9614-48f170760d4f.png",
  d22: "0a44fad7-2bfe-42f1-adcc-530f34595f2d.png",
  d24: "c7fa317d-55d9-49fe-8b2d-dece864237d5.png",
  d26: "ce48e24b-939d-4e42-abfd-8ce03ca97641.png",
  d27: "d6ea9259-9b95-4500-bd97-496634c6b6b4.png",
} as const;

const img = (chiave: keyof typeof IMMAGINE, descrizione: string) => immagine(IMMAGINE[chiave], descrizione);

const GRAFICI = ["Il grafico 1", "Il grafico 2", "Il grafico 3", "Il grafico 4"];
const GRAFICI_26 = ["Il grafico 2", "Il grafico 3", "Il grafico 4", "Il grafico 5"];

const DOMANDE: Domanda[] = [
  {
    numero: 1,
    slug: "zucchero-nei-cereali",
    titolo: "Lo zucchero nei cereali",
    ambito: "Numeri",
    temi: ["percentuali", "tabelle"],
    difficolta: 1,
    testo:
      "La tabella seguente riporta alcune informazioni nutrizionali stampate su tre confezioni di cereali per la prima colazione. " +
      r`\[\begin{array}{|c|c|c|} \hline & \text{Grammi di cereali} & \text{Percentuale di zucchero} \\ \hline \text{Confezione 1} & 100 & 20\% \\ \hline \text{Confezione 2} & 200 & 10\% \\ \hline \text{Confezione 3} & 70 & 20\% \\ \hline \end{array}\]`,
    suggerimento:
      r`Lo zucchero è la percentuale dei grammi di cereali. Confezione 1: \(20\%\) di 100 g = 20 g; confezione 2: \(10\%\) di 200 g = 20 g; confezione 3: \(20\%\) di 70 g = 14 g. ` +
      "a) 20 g e 14 g: falsa. b) 20 g e 20 g sono uguali, la 1 non ne ha di più: falsa. c) 20 g contro 14 g: vera.",
    parti: [
      veroFalso(
        [
          "La quantità di zucchero contenuta nella confezione 2 è uguale alla quantità di zucchero contenuta nella confezione 3",
          "La quantità di zucchero contenuta nella confezione 1 è maggiore della quantità di zucchero contenuta nella confezione 2",
          "La quantità di zucchero contenuta nella confezione 1 è maggiore della quantità di zucchero contenuta nella confezione 3",
        ],
        [false, false, true],
        "Sulla base dei dati in tabella, indica se ciascuna affermazione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 2,
    slug: "impianti-di-risalita",
    titolo: "Gli impianti di risalita",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "modellizzazione", "grafici"],
    difficolta: 2,
    testo:
      "Mario va in vacanza in una località sciistica. Per usufruire degli impianti di risalita (seggiovie, funivie, ...), può scegliere tra due offerte, A e B, entrambe valide per tutta la stagione invernale. " +
      "Offerta A: costo iniziale fisso di 100 euro più 15 euro per ogni giornaliero (ossia per ogni giorno in cui si usano gli impianti di risalita). " +
      "Offerta B: 30 euro per ogni giornaliero, senza costo iniziale. Osserva la seguente figura. " +
      img("d02", "Due grafici a punti del costo in euro in funzione del numero di giornalieri, da 0 a 12: il grafico F parte da 0, il grafico G parte da 100"),
    suggerimento:
      r`a) L'offerta A costa già 100 euro con 0 giornalieri: è il grafico G, che parte da 100. ` +
      r`b) Con l'offerta B si pagano 30 euro al giorno: \(2 \cdot 30 = 60\) e \(3 \cdot 30 = 90\) euro. ` +
      r`c) Per 5 giorni: A costa \(100 + 5 \cdot 15 = 175\) euro, B costa \(5 \cdot 30 = 150\) euro: conviene B. ` +
      r`d) \(c = 100 + 15g\) per l'offerta A, \(c = 30g\) per l'offerta B. ` +
      r`e) \(30g = 1{,}5 \cdot (100 + 15g)\), cioè \(30g = 150 + 22{,}5g\), \(7{,}5g = 150\), \(g = 20\).`,
    parti: [
      scelta("a) Quale, fra i grafici F e G, rappresenta l'offerta A?", ["Il grafico F", "Il grafico G"], 1),
      numerica("b) Completa la tabella relativa all'offerta B. Costo in euro per 2 giorni:", "60"),
      numerica("Costo in euro per 3 giorni:", "90"),
      scelta(
        "c) Se Mario usa gli impianti di risalita solo per cinque giorni durante la stagione invernale, quale offerta gli conviene scegliere?",
        ["L'offerta A", "L'offerta B"],
        1,
      ),
      espressione(r`d) Scrivi la formula che esprime il costo \(c\) dell'offerta A al variare del numero di giornalieri \(g\). \(c =\)`, "100 + 15*g"),
      espressione(r`Scrivi la formula per l'offerta B. \(c =\)`, "30*g"),
      numerica("e) Qual è il numero di giornalieri per cui il costo dell'offerta B è una volta e mezza il costo dell'offerta A?", "20"),
    ],
  },
  {
    numero: 3,
    slug: "triangoli-stessa-base",
    titolo: "Triangoli con la stessa base",
    ambito: "Spazio e figure",
    temi: ["area", "triangoli", "rette parallele"],
    difficolta: 1,
    testo:
      r`ABC è uno degli infiniti triangoli aventi la base AB sulla retta \(r\) e il terzo vertice in un punto qualunque della retta \(s\) parallela a \(r\) e passante per C. ` +
      img("d03", "Due rette parallele r e s; il triangolo ABC ha la base AB su r e il vertice C su s; C' è il simmetrico di C rispetto all'asse di AB, tratteggiato") +
      " Fra gli infiniti triangoli descritti sopra, quali hanno la stessa area di ABC?",
    suggerimento:
      r`L'area è \(\frac{\text{base} \cdot \text{altezza}}{2}\). Tutti questi triangoli hanno la stessa base AB e la stessa altezza, la distanza fra le rette parallele \(r\) e \(s\): hanno tutti la stessa area.`,
    parti: [
      scelta(
        "",
        [
          "Soltanto il triangolo ABC', simmetrico di ABC rispetto all'asse di AB",
          "Soltanto il triangolo isoscele di base AB",
          "Soltanto il triangolo rettangolo in A e il triangolo rettangolo in B",
          "Tutti gli infiniti triangoli di base AB",
        ],
        3,
      ),
    ],
  },
  {
    numero: 4,
    slug: "boyscout",
    titolo: "L'età dei boyscout",
    ambito: "Dati e previsioni",
    temi: ["istogrammi", "frequenze percentuali", "lettura di grafici"],
    difficolta: 1,
    testo:
      "Un gruppo di boyscout è formato da ragazzi di età compresa tra i 10 e i 14 anni. La distribuzione delle frequenze percentuali delle età è riportata nel diagramma seguente. " +
      img("d04", "Diagramma a barre dei ragazzi per età in percentuale: 10 anni 5%, 11 anni 30%, 12 anni 40%, 13 anni 15%, 14 anni 10%"),
    suggerimento:
      "Dal diagramma: 10 anni 5%, 11 anni 30%, 12 anni 40%, 13 anni 15%, 14 anni 10%. " +
      "a) Meno di 13 anni: 5% + 30% + 40% = 75%, non più dell'80%: falsa. " +
      "b) Più di 11 anni: 40% + 15% + 10% = 65%, meno del 70%: vera. " +
      "c) 12 o 14 anni: 40% + 10% = 50%; 10, 11 o 13 anni: 5% + 30% + 15% = 50%: vera.",
    parti: [
      veroFalso(
        [
          "Più dell'80% dei ragazzi ha meno di 13 anni",
          "Meno del 70% dei ragazzi ha più di 11 anni",
          "La percentuale di ragazzi che hanno 12 o 14 anni è uguale alla percentuale di ragazzi che hanno 10 o 11 o 13 anni",
        ],
        [false, true, true],
        "Sulla base dei dati riportati nel diagramma, indica se ciascuna affermazione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 5,
    slug: "potenze-di-due",
    titolo: "Potenze di 2 e di 10",
    ambito: "Numeri",
    temi: ["potenze", "stime"],
    difficolta: 2,
    testo: r`Si sa che \(2^{10} = 1024\). Quale fra le seguenti potenze del 10 è quella che più si avvicina a \(2^{70}\)?`,
    suggerimento:
      r`\(2^{70} = (2^{10})^7 = 1024^7\), e \(1024 \approx 1000 = 10^3\): quindi \(2^{70} \approx (10^3)^7 = 10^{21}\).`,
    parti: [scelta("", [r`\(10^{24}\)`, r`\(10^{21}\)`, r`\(10^{14}\)`, r`\(10^{7}\)`], 1)],
  },
  {
    numero: 6,
    slug: "test-diagnostico",
    titolo: "Il test diagnostico",
    ambito: "Dati e previsioni",
    temi: ["probabilità", "diagramma ad albero", "tabelle a doppia entrata"],
    difficolta: 3,
    testo:
      "Si sa che in una popolazione di 10 000 individui il 10% è affetto da una malattia, mentre il 90% è sano. " +
      "Il test che diagnostica la presenza della malattia è affidabile solo parzialmente: nel 5% dei casi rileva la malattia su un individuo sano e nell'1% dei casi non rileva la malattia su un individuo malato. Il diagramma seguente riassume la situazione. " +
      img("d06", "Diagramma ad albero: 10 000 individui, di cui 9 000 sani (8 550 esito corretto del test, 450 esito errato) e 1 000 malati (990 esito corretto, 10 esito errato)") +
      " a) Utilizzando i dati del diagramma ad albero, completa la seguente tabella. " +
      r`\[\begin{array}{|c|c|c|c|} \hline & \text{Esito corretto} & \text{Esito errato} & \text{Totale} \\ \hline \text{Sani} & \ldots & 450 & \ldots \\ \hline \text{Malati} & \ldots & \ldots & \ldots \\ \hline \text{Totale} & 9\,540 & \ldots & 10\,000 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Dall'albero: sani con esito corretto 8 550, in tutto 9 000; malati con esito corretto 990 ed errato 10, in tutto 1 000; esiti errati \(450 + 10 = 460\). ` +
      r`b) Gli esiti corretti sono \(8\,550 + 990 = 9\,540\) su 10 000: \(\frac{9\,540}{10\,000} = 95{,}4\%\). ` +
      r`c) Ora i casi possibili sono solo i 9 540 esiti corretti, e di questi 8 550 sono sani: \(\frac{8\,550}{9\,540} \approx 0{,}896\), cioè \(89{,}6\%\).`,
    parti: [
      numerica("Sani con esito corretto del test:", "8550"),
      numerica("Sani, totale:", "9000"),
      numerica("Malati con esito corretto del test:", "990"),
      numerica("Malati con esito errato del test:", "10"),
      numerica("Malati, totale:", "1000"),
      numerica("Totale degli esiti errati del test:", "460"),
      scelta(
        "b) Qual è la probabilità che l'esito del test sia corretto per una persona scelta a caso da quella popolazione?",
        ["99,0%", "97,0%", "95,4%", "85,5%"],
        2,
      ),
      numerica(
        "c) Qual è la probabilità che un individuo, preso a caso tra tutti quelli che hanno avuto un esito corretto al test, sia sano? Scrivi il risultato in percentuale con una cifra dopo la virgola (solo il numero).",
        "89.6",
        "0.05",
      ),
    ],
  },
  {
    numero: 7,
    slug: "tariffe-telefoniche",
    titolo: "Le tariffe telefoniche",
    ambito: "Relazioni e funzioni",
    temi: ["modellizzazione", "tabelle", "problemi"],
    difficolta: 2,
    testo:
      "Una compagnia telefonica propone quattro tariffe K, X, Y e Z, tra le quali i clienti possono scegliere. Le tariffe sono descritte nella seguente tabella (tutti i costi sono in centesimi di euro). " +
      r`\[\begin{array}{|c|c|c|c|} \hline \text{Tariffa} & \text{Costo alla risposta} & \text{Costo per minuto} & \text{Costo per SMS} \\ \hline K & 0 & 18 & 5 \\ \hline X & 4 & 12 & 5 \\ \hline Y & 8 & 6 & 10 \\ \hline Z & 8 & 12 & 0 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Con la tariffa Y: \(8 + 3 \cdot 6 = 26\) centesimi. ` +
      r`b) Ogni giorno Marta fa 20 telefonate da 1 minuto e invia 25 SMS. K: \(20 \cdot 18 + 25 \cdot 5 = 485\); X: \(20 \cdot (4 + 12) + 25 \cdot 5 = 445\); ` +
      r`Y: \(20 \cdot (8 + 6) + 25 \cdot 10 = 530\); Z: \(20 \cdot (8 + 12) + 0 = 400\) centesimi. La più vantaggiosa è Z.`,
    parti: [
      scelta("a) Giulia ha scelto la tariffa Y. Quanti centesimi di euro deve pagare per una telefonata della durata di 3 minuti?", ["14", "18", "24", "26"], 3),
      scelta(
        "b) Marta vuole scegliere la tariffa per lei più conveniente. Di solito ogni giorno invia 25 SMS e fa 20 telefonate, ciascuna delle quali dura in media 1 minuto. Sulla base di queste informazioni, quale fra le quattro tariffe è la più vantaggiosa per Marta?",
        ["La tariffa K", "La tariffa X", "La tariffa Y", "La tariffa Z"],
        3,
      ),
    ],
  },
  {
    numero: 8,
    slug: "sezione-del-cubo",
    titolo: "La sezione del cubo",
    ambito: "Spazio e figure",
    temi: ["cubo", "geometria solida", "argomentare"],
    difficolta: 2,
    adattamento: "Nel fascicolo la motivazione andava scritta: qui si sceglie fra motivazioni proposte.",
    testo:
      "La seguente figura rappresenta in prospettiva un cubo che è stato sezionato con il piano passante per i vertici B, D, E. " +
      img("d08", "Il cubo ABCDEFGH, con la base ABCD e la faccia superiore EFGH (E sopra A), e il triangolo BDE tracciato") +
      " Marina afferma: «Il triangolo BDE è un triangolo equilatero». Marina ha ragione?",
    suggerimento:
      r`BD, BE e DE sono ciascuno la diagonale di una faccia del cubo (la base ABCD, la faccia ABFE, la faccia ADHE). Le facce sono quadrati uguali, quindi le tre diagonali sono uguali (lunghe \(\ell\sqrt{2}\) se \(\ell\) è lo spigolo): il triangolo è equilatero.`,
    parti: [
      scelta(
        "",
        [
          "Sì, perché i suoi tre lati sono diagonali di facce del cubo, che sono quadrati uguali: i tre lati sono uguali",
          "Sì, perché i suoi vertici sono vertici del cubo, e tre vertici di un cubo formano sempre un triangolo equilatero",
          "No, perché BD è la diagonale della base ed è più lunga di BE e di DE",
          "No, perché il triangolo BDE è rettangolo, come gli angoli del cubo",
        ],
        0,
      ),
    ],
  },
  {
    numero: 9,
    slug: "carte-di-credito",
    titolo: "Le carte di credito",
    ambito: "Dati e previsioni",
    temi: ["lettura di grafici", "variazioni percentuali"],
    difficolta: 3,
    testo:
      "Osserva i seguenti grafici relativi alle operazioni effettuate con carte di credito dal 2004 al 2008 (fonte: Osservatorio sulle carte di credito). " +
      img(
        "d09",
        "A sinistra, istogramma del numero di operazioni in milioni: 433,6 nel 2004, 463,5 nel 2005, 465,9 nel 2006, 503,9 nel 2007, 522,6 nel 2008. A destra, grafico a linea della variazione percentuale annua: 15,90%, 6,90%, 0,50%, 8,20%, 3,70%",
      ),
    suggerimento:
      "Il primo grafico dà il numero di operazioni, il secondo di quanto per cento è cresciuto ogni anno: una variazione positiva, anche piccola, vuol dire che il numero è aumentato. " +
      "a) Il numero cresce ogni anno (è la crescita a rallentare): falsa. " +
      "b) Non c'è contraddizione: le variazioni sono tutte positive, quindi il numero cresce sempre: falsa. " +
      r`c) Dal 2006 al 2007 l'aumento è \(503{,}9 - 465{,}9 = 38\) milioni, dal 2007 al 2008 \(522{,}6 - 503{,}9 = 18{,}7\) milioni: vera. ` +
      "d) Nel 2006 si è quasi azzerata la crescita (0,50%), non il numero di operazioni (465,9 milioni): falsa.",
    parti: [
      veroFalso(
        [
          "Il numero di operazioni effettuate con carte di credito è diminuito dal 2004 fino al 2006, poi è aumentato e, successivamente, è di nuovo diminuito fino al 2008",
          "I due grafici sono in contraddizione perché il primo mostra una continua crescita nel tempo, mentre il secondo no",
          "L'aumento del numero di operazioni effettuate con carte di credito che si è avuto dal 2006 al 2007 è stato superiore all'aumento che si è avuto dal 2007 al 2008",
          "Nel 2006 il numero di operazioni effettuate con carte di credito si è quasi azzerato",
        ],
        [false, false, true, false],
      ),
    ],
  },
  {
    numero: 10,
    slug: "spazio-di-frenata",
    titolo: "Lo spazio di frenata",
    ambito: "Relazioni e funzioni",
    temi: ["formule", "funzione quadratica", "grafici"],
    difficolta: 2,
    testo:
      "Con «spazio di frenata» intendiamo lo spazio che un'auto percorre dall'inizio della frenata fino a quando si ferma. " +
      "Una regola pratica per stimare lo spazio di frenata (in metri), nel caso in cui l'auto viaggi su una strada asfaltata in buone condizioni e non bagnata, è la seguente: " +
      "«Eleva al quadrato il valore della velocità (in km/h) dell'auto all'inizio della frenata e dividi il risultato ottenuto per 200». " +
      r`a) Completa la tabella seguente, che fornisce lo spazio di frenata \(s\) (approssimato per eccesso al metro) per alcuni valori della velocità \(v\). ` +
      r`\[\begin{array}{|c|c|} \hline v\ (\text{km/h}) & s\ (\text{m, per eccesso}) \\ \hline 40 & 8 \\ \hline 50 & 13 \\ \hline 60 & \ldots \\ \hline 70 & 25 \\ \hline 80 & \ldots \\ \hline 90 & \ldots \\ \hline 100 & 50 \\ \hline \end{array}\]` +
      " I grafici per la parte b: " +
      img("d10", "Quattro grafici di s in funzione di v: 1 una curva che parte da 0 e sale sempre più ripida; 2 una retta che sale dall'origine; 3 una curva che scende verso l'asse v; 4 una retta che scende"),
    suggerimento:
      r`a) \(s = \frac{v^2}{200}\): \(\frac{3600}{200} = 18\), \(\frac{6400}{200} = 32\), \(\frac{8100}{200} = 40{,}5\), che per eccesso diventa 41. ` +
      r`b) Lo spazio cresce con il quadrato della velocità: parte da 0 e cresce sempre più in fretta (raddoppiando la velocità, lo spazio quadruplica). È una parabola, il grafico 1.`,
    parti: [
      numerica(r`Per \(v = 60\): \(s =\)`, "18"),
      numerica(r`Per \(v = 80\): \(s =\)`, "32"),
      numerica(r`Per \(v = 90\): \(s =\)`, "41"),
      scelta(r`b) Quale fra i grafici della figura può rappresentare lo spazio di frenata \(s\) al variare della velocità \(v\)?`, GRAFICI, 0),
    ],
  },
  {
    numero: 11,
    slug: "tre-numeri-consecutivi",
    titolo: "Tre numeri consecutivi",
    ambito: "Numeri",
    temi: ["divisibilità", "polinomi", "argomentare"],
    difficolta: 3,
    adattamento:
      "Nel fascicolo la spiegazione (b) e la dimostrazione (c) andavano scritte: qui si sceglie fra quelle proposte; nella tabella si può scrivere il prodotto o il suo risultato.",
    testo:
      r`a) Osserva e completa la seguente tabella. ` +
      r`\[\begin{array}{|c|c|} \hline n & (n-1)n(n+1) \\ \hline 2 & 1 \times 2 \times 3 \\ \hline 3 & 2 \times 3 \times 4 \\ \hline 4 & \ldots \\ \hline 5 & \ldots \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Per \(n = 4\): \(3 \times 4 \times 5 = 60\); per \(n = 5\): \(4 \times 5 \times 6 = 120\). ` +
      r`b) \(n - 1\), \(n\), \(n + 1\) sono tre numeri naturali consecutivi: almeno uno è pari e uno è multiplo di 3, quindi il prodotto è divisibile per 2 e per 3, cioè per 6. Controllare qualche caso non basta: bisogna che valga per ogni \(n\). ` +
      r`c) Si raccoglie \(n\) e si riconosce una differenza di quadrati: \(n^3 - n = n(n^2 - 1) = n(n - 1)(n + 1)\).`,
    parti: [
      espressione(r`Per \(n = 4\): \((n-1)n(n+1) =\)`, "3*4*5"),
      espressione(r`Per \(n = 5\): \((n-1)n(n+1) =\)`, "4*5*6"),
      scelta(
        r`b) Giulia afferma: «Per ogni numero naturale \(n\) maggiore di 1, \((n-1)n(n+1)\) è divisibile per 6». Perché Giulia ha ragione?`,
        [
          "Perché nella tabella i risultati 6, 24, 60, 120 sono tutti divisibili per 6",
          "Perché fra tre numeri naturali consecutivi c'è sempre almeno un numero pari e sempre un multiplo di 3, quindi il prodotto è divisibile per 2 e per 3",
          "Perché la somma dei tre fattori è sempre un multiplo di 6",
          r`Perché \(1 \times 2 \times 3 = 6\), e il primo prodotto della tabella è divisibile per 6`,
        ],
        1,
      ),
      scelta(
        r`c) Francesco afferma: «\(n^3 - n\) è uguale a \((n-1)n(n+1)\)». Quale ragionamento dimostra che Francesco ha ragione?`,
        [
          r`Per \(n = 2\) si ottiene \(8 - 2 = 6\) e \(1 \times 2 \times 3 = 6\): i due risultati coincidono`,
          r`\((n-1)n(n+1) = (n^2 - 1) \cdot n\), ma \(n^2 - 1 = (n-1)^2\), quindi si ottiene \(n^3 - n\)`,
          r`\(n^3 - n = n(n^2 - 1) = n(n-1)(n+1)\), raccogliendo \(n\) e scomponendo la differenza di quadrati \(n^2 - 1\)`,
          r`\(n^3 - n = n^2\), e anche \((n-1)n(n+1)\) ha il termine di grado più alto uguale a \(n^2\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 12,
    slug: "equazione-con-parametro",
    titolo: "Un'equazione con parametro",
    ambito: "Numeri",
    temi: ["equazioni", "parametri"],
    difficolta: 2,
    testo: r`È data l'equazione \((3k - 6)x - 5k + 2 = 0\), in cui \(x\) è l'incognita e \(k\) è un numero reale.`,
    suggerimento:
      r`Se la soluzione è \(x = 0\), sostituendo si ottiene \((3k - 6) \cdot 0 - 5k + 2 = 0\), cioè \(-5k + 2 = 0\), \(k = \frac{2}{5}\). ` +
      r`Per questo valore il coefficiente \(3k - 6\) non è zero, quindi \(x = 0\) è proprio l'unica soluzione.`,
    parti: [espressione(r`Per quale valore di \(k\) la soluzione dell'equazione è 0? Scrivi il valore come frazione. \(k =\)`, "2/5")],
  },
  {
    numero: 13,
    slug: "angoli-alla-circonferenza",
    titolo: "Angoli alla circonferenza",
    ambito: "Spazio e figure",
    temi: ["circonferenza", "angoli alla circonferenza"],
    difficolta: 2,
    testo:
      "Osserva la circonferenza di centro O rappresentata in figura. " +
      img("d13", "Una circonferenza di centro O con i punti C, B, D, E; sono tracciate le corde CB, CE, CD, BE e BD") +
      " Comunque siano presi i punti B, C, D, E sulla circonferenza, è possibile affermare che",
    suggerimento:
      "Gli angoli CEB e CDB sono angoli alla circonferenza che insistono sullo stesso arco CB (dalla stessa parte): sono congruenti, comunque si scelgano i punti. Le altre affermazioni valgono solo per particolari posizioni dei punti.",
    parti: [
      scelta(
        "",
        [
          "il triangolo BCE è congruente al triangolo CBD",
          "il segmento BD è congruente al segmento CE",
          "l'angolo EBC è congruente all'angolo DCB",
          "l'angolo CEB è congruente all'angolo CDB",
        ],
        3,
      ),
    ],
  },
  {
    numero: 14,
    slug: "occupati-in-italia",
    titolo: "Gli occupati in Italia",
    ambito: "Dati e previsioni",
    temi: ["tabelle", "variazioni percentuali", "media"],
    difficolta: 2,
    testo:
      "La seguente tabella riporta il numero di occupati, in migliaia, in Italia in ciascuno degli anni dal 1995 al 2005. " +
      r`\[\begin{array}{|c|c|} \hline \text{Anni} & \text{Occupati (in migliaia)} \\ \hline 1995 & 20\,240 \\ \hline 1996 & 20\,326 \\ \hline 1997 & 20\,384 \\ \hline 1998 & 20\,591 \\ \hline 1999 & 20\,847 \\ \hline 2000 & 21\,210 \\ \hline 2001 & 21\,604 \\ \hline 2002 & 21\,913 \\ \hline 2003 & 22\,241 \\ \hline 2004 & 22\,404 \\ \hline 2005 & 22\,563 \\ \hline \end{array}\]`,
    suggerimento:
      r`a) L'aumento è \(21\,604 - 21\,210 = 394\) migliaia, e la percentuale si calcola rispetto al valore di partenza, quello del 2000: \(\frac{394}{21\,210} \times 100\). ` +
      r`b) \(22\,563 - 20\,240 = 2\,323\) migliaia. ` +
      r`c) Dal 1995 al 2005 ci sono 10 anni: \(2\,323 : 10 = 232{,}3\) migliaia all'anno.`,
    parti: [
      scelta(
        "a) Quale tra le seguenti espressioni dà come risultato l'aumento percentuale del numero di occupati nel 2001 rispetto al numero di occupati nel 2000?",
        [
          r`\(\frac{21\,604}{21\,210} \times 100\)`,
          r`\(\frac{394}{21\,210} \times 100\)`,
          r`\(\frac{21\,210}{21\,604} \times 100\)`,
          r`\(\frac{394}{21\,604} \times 100\)`,
        ],
        1,
      ),
      numerica("b) Di quante migliaia sono aumentati gli occupati dal 1995 al 2005?", "2323"),
      numerica("c) Qual è stato l'aumento medio annuo del numero di occupati nei dieci anni dal 1995 al 2005, in migliaia?", "232.3"),
    ],
  },
  {
    numero: 15,
    slug: "elezioni",
    titolo: "Le elezioni",
    ambito: "Numeri",
    temi: ["percentuali", "percentuale di una percentuale"],
    difficolta: 1,
    testo:
      "Nelle ultime elezioni svoltesi in un paese europeo è andato a votare il 70% degli aventi diritto al voto. Di questi il 20% ha votato per il partito A. Quale percentuale di aventi diritto al voto ha votato per il partito A?",
    suggerimento: r`È il 20% del 70%: \(0{,}20 \cdot 0{,}70 = 0{,}14\), cioè il 14% degli aventi diritto.`,
    parti: [scelta("", ["60%", "50%", "20%", "14%"], 3)],
  },
  {
    numero: 16,
    slug: "scarto-quadratico-medio",
    titolo: "Lo scarto quadratico medio",
    ambito: "Dati e previsioni",
    temi: ["media", "deviazione standard", "argomentare"],
    difficolta: 2,
    adattamento: "Nel fascicolo la motivazione andava scritta: qui si sceglie fra motivazioni proposte.",
    testo:
      "La professoressa Rossi vuole verificare il livello delle conoscenze in scienze nelle classi 1A e 1B. Decide di somministrare lo stesso test nelle due classi. Elaborando i punteggi del test ottiene i seguenti risultati. " +
      r`\[\begin{array}{|c|c|c|} \hline & \text{Classe 1A} & \text{Classe 1B} \\ \hline \text{media aritmetica} & 6{,}5 & 6{,}5 \\ \hline \text{scarto quadratico medio} & 1{,}1 & 2{,}3 \\ \hline \end{array}\]` +
      "Martina, un'alunna di 1B, afferma che i risultati indicano che gli alunni delle due classi hanno lo stesso livello medio di conoscenze, ma gli studenti della classe 1A hanno ottenuto complessivamente punteggi più vicini alla media. Martina ha ragione?",
    suggerimento:
      "Le medie sono uguali (6,5): stesso livello medio. Lo scarto quadratico medio (deviazione standard) misura quanto i punteggi si allontanano dalla media: in 1A è più piccolo (1,1 contro 2,3), quindi i punteggi di 1A sono più vicini alla media. Martina ha ragione.",
    parti: [
      scelta(
        "",
        [
          "Sì, perché le medie sono uguali e lo scarto quadratico medio della 1A è minore: i punteggi della 1A sono meno dispersi attorno alla media",
          "Sì, perché lo scarto quadratico medio della 1A è minore, e quindi la 1A ha anche la media più alta",
          "No, perché con la stessa media i punteggi delle due classi sono distribuiti allo stesso modo",
          "No, perché la 1B ha lo scarto quadratico medio maggiore, quindi i suoi punteggi sono più vicini alla media",
        ],
        0,
      ),
    ],
  },
  {
    numero: 17,
    slug: "area-quadrilatero",
    titolo: "Area di un quadrilatero",
    ambito: "Spazio e figure",
    temi: ["area", "piano cartesiano"],
    difficolta: 2,
    testo:
      "Calcola l'area del quadrilatero ABCD disegnato in figura. " +
      img("d17", "Il quadrilatero ABCD nel piano cartesiano con A(5; 3), B(3; 3), C(3; 5), D(−3; −3); ogni quadretto ha il lato di 1 cm"),
    suggerimento:
      r`Si legge \(A(5; 3)\), \(B(3; 3)\), \(C(3; 5)\), \(D(-3; -3)\). Il quadrilatero è il triangolo ACD meno il triangolo ABC. ` +
      r`Il triangolo ACD sta nel rettangolo da \(x = -3\) a \(x = 5\) e da \(y = -3\) a \(y = 5\), di area \(8 \cdot 8 = 64\), a cui si tolgono tre triangoli rettangoli: \(\frac{6 \cdot 8}{2} = 24\), \(\frac{8 \cdot 6}{2} = 24\), \(\frac{2 \cdot 2}{2} = 2\); resta \(64 - 50 = 14\). ` +
      r`Il triangolo ABC è rettangolo in B con cateti 2 e 2: area 2. In tutto \(14 - 2 = 12\text{ cm}^2\).`,
    parti: [numerica(r`Area, in \(\text{cm}^2\):`, "12")],
  },
  {
    numero: 18,
    slug: "meta-di-a-alla-quarta",
    titolo: "La metà di una potenza",
    ambito: "Numeri",
    temi: ["potenze", "calcolo letterale"],
    difficolta: 1,
    testo:
      r`Armando, Bruno, Caterina e Daniela hanno opinioni diverse sul numero che si ottiene dividendo \(a^4\) per 2. ` +
      r`Armando dice: «si ottiene \(\left(\frac{a}{2}\right)^4\)». Bruno sostiene: «si ottiene \(a^2\)». ` +
      r`Caterina dice: «si ottiene \(\frac{1}{2}a^4\)». Daniela afferma: «si ottiene \(\left(\frac{a}{2}\right)^2\)». Chi ha ragione?`,
    suggerimento:
      r`Dividere per 2 vuol dire moltiplicare per \(\frac{1}{2}\): \(a^4 : 2 = \frac{1}{2}a^4\). Invece \(\left(\frac{a}{2}\right)^4 = \frac{a^4}{16}\), e dividere per 2 non dimezza l'esponente.`,
    parti: [scelta("", ["Armando", "Bruno", "Caterina", "Daniela"], 2)],
  },
  {
    numero: 19,
    slug: "potenze-di-una-frazione",
    titolo: "Potenze di una frazione",
    ambito: "Numeri",
    temi: ["potenze", "frazioni", "confronto"],
    difficolta: 2,
    testo: r`Giovanni afferma che \(\left(\frac{3}{40}\right)^{80}\) è maggiore di \(\left(\frac{3}{40}\right)^{81}\). Ha ragione?`,
    suggerimento:
      r`\(\left(\frac{3}{40}\right)^{81} = \left(\frac{3}{40}\right)^{80} \cdot \frac{3}{40}\), e moltiplicare un numero positivo per un numero minore di 1 lo rende più piccolo: Giovanni ha ragione. ` +
      r`Non vale per «qualsiasi frazione»: con una frazione maggiore di 1, come \(\frac{3}{2}\), le potenze crescono.`,
    parti: [
      scelta(
        "",
        [
          "Giovanni ha ragione perché quando si eleva a potenza una qualsiasi frazione il risultato diminuisce all'aumentare dell'esponente",
          "Giovanni non ha ragione perché l'esponente della seconda frazione è maggiore dell'esponente della prima",
          r`Giovanni ha ragione perché moltiplicando \(\left(\frac{3}{40}\right)^{80}\) per \(\frac{3}{40}\), che è minore di 1, si ottiene un numero minore di \(\left(\frac{3}{40}\right)^{80}\)`,
          r`Giovanni non ha ragione perché calcolando \(\left(\frac{3}{40}\right)^{81}\) si ottiene una frazione con un numeratore maggiore di quello di \(\left(\frac{3}{40}\right)^{80}\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 20,
    slug: "investimenti",
    titolo: "Luigi e Paolo investono",
    ambito: "Numeri",
    temi: ["percentuali", "aumenti e sconti successivi"],
    difficolta: 2,
    adattamento: "Nel fascicolo andavano scritti anche i calcoli: qui si riportano solo i risultati.",
    testo:
      "Luigi e Paolo investono la stessa somma di denaro. Dopo il primo anno, la somma investita da Luigi è aumentata del 10% e quella investita da Paolo è diminuita del 5%. " +
      "Luigi e Paolo decidono di reinvestire per un altro anno ancora le somme ottenute dopo il primo anno. Nel secondo anno Luigi perde il 5%, mentre Paolo guadagna il 10%. " +
      "Se Luigi e Paolo hanno investito inizialmente una somma di 1 000 euro ciascuno, quanto avrà ciascuno dei due alla fine del secondo anno?",
    suggerimento:
      r`Luigi: \(1000 \cdot 1{,}10 = 1100\), poi \(1100 \cdot 0{,}95 = 1045\) euro. Paolo: \(1000 \cdot 0{,}95 = 950\), poi \(950 \cdot 1{,}10 = 1045\) euro. ` +
      r`Hanno la stessa somma, perché la moltiplicazione è commutativa: \(1{,}10 \cdot 0{,}95 = 0{,}95 \cdot 1{,}10 = 1{,}045\). Non è \(+10\% - 5\% = +5\%\): la seconda percentuale si calcola sulla somma già cambiata.`,
    parti: [numerica("Luigi, in euro:", "1045"), numerica("Paolo, in euro:", "1045")],
  },
  {
    numero: 21,
    slug: "somma-di-potenze",
    titolo: "Somma di potenze",
    ambito: "Numeri",
    temi: ["potenze", "raccoglimento"],
    difficolta: 2,
    testo: r`L'espressione \(a^{37} + a^{38}\) è uguale a`,
    suggerimento:
      r`Si raccoglie \(a^{37}\): \(a^{37} + a^{38} = a^{37} + a^{37} \cdot a = a^{37}(a + 1)\). La somma di due potenze NON è una potenza con gli esponenti sommati: quello vale per il prodotto.`,
    parti: [scelta("", [r`\(2a^{75}\)`, r`\(a^{75}\)`, r`\(a^{37}(a + 1)\)`, r`\(a^{37 \cdot 38}\)`], 2)],
  },
  {
    numero: 22,
    slug: "arco-di-cubi",
    titolo: "L'arco da dipingere",
    ambito: "Spazio e figure",
    temi: ["superficie", "geometria solida", "parallelepipedo"],
    difficolta: 3,
    testo:
      r`L'arco mostrato in figura è formato da sei cubi di lato \(L\) e da un parallelepipedo di dimensioni \(L\), \(L\), \(4L\). ` +
      img("d22", "Un arco appoggiato su un piano: due colonne di tre cubi ciascuna, alle estremità, sostengono un parallelepipedo lungo quattro cubi") +
      " Si vuole dipingere l'arco; quanto misura la superficie da colorare?",
    suggerimento:
      r`Si contano le facce che restano visibili. Ogni colonna di 3 cubi ha 4 facce laterali di \(3L^2\): \(12L^2\), e due colonne \(24L^2\); le basi poggiano a terra e le cime sono coperte dal parallelepipedo. ` +
      r`Il parallelepipedo: sopra \(4L^2\), i due fianchi lunghi \(2 \cdot 4L^2 = 8L^2\), le due testate \(2L^2\), sotto \(4L^2 - 2L^2 = 2L^2\) (due quadretti poggiano sulle colonne). ` +
      r`In tutto \(24L^2 + 4L^2 + 8L^2 + 2L^2 + 2L^2 = 40L^2\).`,
    parti: [scelta("", [r`\(42L^2\)`, r`\(40L^2\)`, r`\(38L^2\)`, r`\(36L^2\)`], 1)],
  },
  {
    numero: 23,
    slug: "cambio-in-franchi",
    titolo: "Il cambio in franchi",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "modellizzazione", "argomentare"],
    difficolta: 3,
    adattamento: "Nel fascicolo la motivazione della parte b andava scritta: qui si sceglie fra motivazioni proposte.",
    testo:
      "Un turista italiano in viaggio in Svizzera, prima di cambiare i suoi euro in franchi, esamina le seguenti proposte fatte da due banche. " +
      "Banca A: 1 euro viene scambiato con 1,412 franchi senza spese. Banca B: 1 euro viene scambiato con 1,416 franchi con una commissione fissa di 2 franchi.",
    suggerimento:
      r`a) \(300 \cdot 1{,}412 = 423{,}6\) franchi. ` +
      r`b) Cambiando \(x\) euro, A dà \(1{,}412x\) franchi e B dà \(1{,}416x - 2\). B dà di più quando \(0{,}004x > 2\), cioè per \(x > 500\) euro: per esempio con 1 000 euro A dà 1 412 franchi e B 1 414. Carlo non ha ragione.`,
    parti: [
      numerica("a) Se il turista cambia 300 euro, quanti franchi ottiene presso la banca A?", "423.6"),
      scelta(
        "b) Carlo afferma che, qualunque sia la somma che si vuole cambiare, è sempre più conveniente la banca A. Carlo ha ragione?",
        [
          "Carlo ha ragione perché la banca A non fa pagare spese",
          "Carlo ha ragione perché la commissione di 2 franchi rende la banca B sempre più cara",
          "Carlo non ha ragione perché per somme maggiori di 500 euro la banca B dà più franchi (con 1 000 euro: 1 412 franchi dalla A, 1 414 dalla B)",
          "Carlo non ha ragione perché la banca B conviene sempre, dato che il suo cambio è più alto",
        ],
        2,
      ),
    ],
  },
  {
    numero: 24,
    slug: "tenda-da-sole",
    titolo: "La tenda da sole",
    ambito: "Spazio e figure",
    temi: ["teorema di Pitagora", "problemi"],
    difficolta: 2,
    adattamento: "Nel fascicolo andavano scritti anche i calcoli: qui si riporta solo il risultato.",
    testo:
      "Occorre confezionare una tenda da sole per il balcone in figura. La tenda deve essere fissata al muro a 3 m di altezza dal pavimento del balcone, che è largo 1 m. La tenda deve sporgere 0,5 m dalla ringhiera che è alta 1 m. " +
      img("d24", "Un balcone largo 1 m con la ringhiera alta 1 m; la tenda parte dal muro a 3 m di altezza e scende fino all'altezza della ringhiera, 0,5 m oltre la ringhiera; x è la lunghezza della tenda"),
    suggerimento:
      r`La tenda è l'ipotenusa di un triangolo rettangolo. Il cateto verticale va da 3 m all'altezza della ringhiera: \(3 - 1 = 2\) m; quello orizzontale va dal muro a 0,5 m oltre la ringhiera: \(1 + 0{,}5 = 1{,}5\) m. ` +
      r`\(x = \sqrt{2^2 + 1{,}5^2} = \sqrt{4 + 2{,}25} = \sqrt{6{,}25} = 2{,}5\) m.`,
    parti: [numerica(r`Qual è la lunghezza \(x\) della tenda, in metri?`, "2.5", "0.01")],
  },
  {
    numero: 25,
    slug: "sconti-successivi",
    titolo: "Due sconti",
    ambito: "Numeri",
    temi: ["percentuali", "sconti successivi"],
    difficolta: 2,
    testo:
      "In un negozio un abito è messo in vendita con uno sconto del 30% sul prezzo originario. Durante la stagione dei saldi il prezzo già scontato viene ancora abbassato del 10%. Qual è la percentuale complessiva di sconto sul prezzo originario dell'abito?",
    suggerimento:
      r`Dopo il primo sconto si paga il 70% del prezzo, dopo il secondo il 90% di quello: \(0{,}70 \cdot 0{,}90 = 0{,}63\), cioè il 63% del prezzo originario. Lo sconto complessivo è \(100\% - 63\% = 37\%\), non 40%: il 10% si calcola sul prezzo già scontato.`,
    parti: [scelta("", ["20%", "33%", "37%", "40%"], 2)],
  },
  {
    numero: 26,
    slug: "grafici-simmetrici",
    titolo: "Grafici simmetrici",
    ambito: "Relazioni e funzioni",
    temi: ["simmetrie", "grafici", "piano cartesiano"],
    difficolta: 2,
    testo:
      "Di seguito sono rappresentati cinque grafici. " +
      img(
        "d26",
        "Cinque grafici: 1 una curva che parte dall'origine e sale verso destra, piegando; 2 una curva che parte dall'origine e sale ripida verso destra; 3 una curva che parte dall'origine e scende verso sinistra; 4 una curva che parte dall'origine e sale verso sinistra; 5 una curva che parte dall'origine e scende verso destra",
      ),
    suggerimento:
      r`Il grafico 1 sta nel primo quadrante (\(x \ge 0\), \(y \ge 0\)). ` +
      r`a) La simmetria rispetto all'asse \(x\) cambia il segno di \(y\): la curva va a destra e verso il basso, grafico 5. ` +
      r`b) La simmetria rispetto all'asse \(y\) cambia il segno di \(x\): la curva va a sinistra e verso l'alto, grafico 4. ` +
      r`c) La simmetria rispetto all'origine cambia il segno di entrambe: la curva va a sinistra e verso il basso, grafico 3. Il grafico 2 è il simmetrico rispetto alla bisettrice \(y = x\).`,
    parti: [
      scelta(r`a) Quale grafico è il simmetrico del grafico 1 rispetto all'asse delle \(x\)?`, GRAFICI_26, 3),
      scelta(r`b) Quale grafico è il simmetrico del grafico 1 rispetto all'asse delle \(y\)?`, GRAFICI_26, 2),
      scelta(r`c) Quale grafico è il simmetrico del grafico 1 rispetto all'origine \(O(0; 0)\)?`, GRAFICI_26, 1),
    ],
  },
  {
    numero: 27,
    slug: "libro-delle-vacanze",
    titolo: "Il libro delle vacanze",
    ambito: "Relazioni e funzioni",
    temi: ["lettura di grafici", "modellizzazione"],
    difficolta: 2,
    testo:
      "Durante il periodo estivo Anna deve leggere un libro di 305 pagine come compito per le vacanze. Nel mese di giugno si riposa e a partire dal primo giorno di luglio legge 5 pagine al giorno per tutto il mese. " +
      "In agosto va in vacanza con i genitori e dimentica il libro a casa; al suo ritorno, negli ultimi 10 giorni di vacanza, per terminare il libro legge 15 pagine al giorno. " +
      "Quale, fra i seguenti grafici, può rappresentare l'andamento del numero di pagine lette da Anna nel periodo estivo? " +
      img(
        "d27",
        "Quattro grafici delle pagine lette nel tempo: 1 piatto, poi una salita, poi piatto, poi una salita più ripida; 2 come il primo ma l'ultima salita ha la stessa pendenza della prima; 3 sale subito, poi più ripido; 4 piatto, poi una curva che sale, piatto, poi un'altra curva",
      ),
    suggerimento:
      "In giugno Anna non legge: il grafico è piatto a zero. In luglio legge 5 pagine al giorno, sempre lo stesso numero: un tratto di retta in salita (155 pagine). In agosto, finché è via, il numero di pagine lette non cambia: tratto piatto. " +
      "Negli ultimi 10 giorni legge 15 pagine al giorno, il triplo di prima: una retta in salita più ripida. È il grafico 1 (il 2 ha l'ultima salita come la prima, il 4 ha tratti curvi, cioè una velocità di lettura che cambia).",
    parti: [scelta("", GRAFICI, 0)],
  },
  {
    numero: 28,
    slug: "equazione-di-secondo-grado",
    titolo: "Una soluzione dell'equazione",
    ambito: "Numeri",
    temi: ["equazioni"],
    difficolta: 1,
    testo: r`L'equazione \(x(x - 1) = 6\) ha fra le sue soluzioni`,
    suggerimento:
      r`Basta provare: per \(x = 3\) si ha \(3 \cdot 2 = 6\). (Svolgendo: \(x^2 - x - 6 = 0\), cioè \((x - 3)(x + 2) = 0\), con soluzioni 3 e \(-2\).) Per 6 si ottiene \(6 \cdot 5 = 30\), per 7 si ottiene 42.`,
    parti: [scelta("", [r`\(\frac{1}{6}\)`, "3", "6", "7"], 1)],
  },
  {
    numero: 29,
    slug: "lati-e-altezze",
    titolo: "Lati e altezze di un triangolo",
    ambito: "Spazio e figure",
    temi: ["triangoli", "disuguaglianza triangolare", "proporzionalità inversa"],
    difficolta: 2,
    testo: "Leggi con attenzione le affermazioni sui triangoli.",
    suggerimento:
      r`a) È la disuguaglianza triangolare: vera. ` +
      r`b) Per ogni lato \(b\) e la sua altezza \(h\) vale \(b \cdot h = 2A\), un prodotto costante: sono inversamente proporzionali. Vera. ` +
      r`c) Da \(a < b + c\) si ricava \(a - b < c\): la differenza di due lati è sempre minore del terzo. Falsa.`,
    parti: [
      veroFalso(
        [
          "Se tre punti A, B, C non sono allineati, nel triangolo ABC ciascun lato è minore della somma degli altri due lati",
          r`Dato un triangolo di area \(A\), i lati e le altezze ad essi relative sono grandezze inversamente proporzionali`,
          "In un triangolo la differenza tra due lati può essere maggiore del terzo lato",
        ],
        [true, true, false],
      ),
    ],
  },
  {
    numero: 30,
    slug: "negazione",
    titolo: "La negazione",
    ambito: "Numeri",
    temi: ["logica", "quantificatori", "numeri naturali"],
    difficolta: 1,
    testo: "Quale tra le seguenti frasi è la negazione della proposizione «Tutti i numeri naturali sono dispari»?",
    suggerimento:
      "Per negare «tutti sono dispari» basta che ce ne sia almeno uno che non lo è: «Almeno un numero naturale non è dispari». «Nessuno è dispari» e «tutti sono pari» dicono molto di più, sono affermazioni contrarie, non la negazione.",
    parti: [
      scelta(
        "",
        [
          "Tutti i numeri naturali sono pari",
          "Nessun numero naturale è dispari",
          "Almeno un numero naturale non è dispari",
          "Qualche numero naturale è dispari",
        ],
        2,
      ),
    ],
  },
];

export const PACCHETTO_INVALSI_2012: EsercizioPacchetto[] = creaPacchetto({ anno: 2012, annoScolastico: "2011/12" }, DOMANDE);

if (lanciatoDirettamente(import.meta.url)) {
  scriviPacchetto(PACCHETTO_INVALSI_2012);
}
