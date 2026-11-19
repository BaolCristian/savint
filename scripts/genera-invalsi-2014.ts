/**
 * La prova INVALSI di matematica 2013/14 (classe seconda della secondaria di
 * secondo grado, fascicolo 1): 28 domande, una per esercizio, nei file
 * `content/esercizi/invalsi-2014-dNN-*.json`.
 *
 * Le regole comuni a tutte le prove sono in `scripts/invalsi/comune.ts`.
 * I file JSON NON si correggono a mano: si corregge qui e si rigenera con
 *
 *     npx tsx scripts/genera-invalsi-2014.ts
 *
 * `src/lib/esercizi/__tests__/pacchetto-invalsi-2014.test.ts` controlla che i
 * file su disco coincidano con quello che questo script produce, che reggano
 * la verifica a venti semi e che le risposte giuste prendano tutti i punti.
 *
 * Scelte di trascrizione:
 * - le figure e i grafici sono ritagliati dal fascicolo
 *   (`content/esercizi/immagini/`, copiati dal seed);
 * - le domande da disegnare (D3a: segnare la nave sulla mappa; D19: scrivere
 *   il numero nel diagramma) o da argomentare (D6) sono diventate a scelta o a
 *   risposta numerica; la D14 (una crocetta per riga) è una scelta per riga;
 * - dove il fascicolo chiedeva anche i calcoli (D9, D11, D16, D20, D22) si
 *   scrive solo il risultato;
 * - le probabilità e i rapporti si scrivono come frazione (parte
 *   «espressione», che accetta qualunque forma equivalente);
 * - le domande di solo testo e calcolo hanno i NUMERI VARIABILI (regole in
 *   `scripts/invalsi/comune.ts`): D9, D12, D16, D17, D18, D19, D20, D21, D25
 *   (parte b). Le altre restano con i numeri del fascicolo: legate a
 *   un'immagine o a un grafico che mostra i numeri (D2, D3, D4, D5, D7, D11,
 *   D14, D25 parte a, D26, D28), concettuali o Vero/Falso su affermazioni
 *   fisse (D1, D6, D10, D15, D23, D24), con distrattori di cui non si
 *   ricostruisce l'errore (D8, D13, D27), o in cui cambiare i numeri non
 *   garantisce un problema pulito (D22).
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
  d02a: "7ed654ff-18e1-45ae-b049-9fcbd210359d.png",
  d02b: "fb6a2be4-7b95-471b-899a-47f1dfa77105.png",
  d03: "2c7cd723-dcb6-45b1-8bf9-e850def1879c.png",
  d04: "99efd70f-9071-40be-beb0-b39abc29a579.png",
  d05: "71b9a253-3204-4c97-8039-37c86057835a.png",
  d07: "df492ea7-4a73-492b-81cb-4b9f209d6345.png",
  d11: "c8834c5c-6f4e-467c-a614-939f470db249.png",
  d14: "d60b79b6-e496-4df3-9858-a0f3564be33d.png",
  d16: "9430c057-86d7-4d1a-9f16-d86c33d246e8.png",
  d18: "8ced7087-6f63-4897-aa2b-c05e4bdd707c.png",
  d19: "0e511a88-5ae5-4824-8e74-f04973b3d2cc.png",
  d21: "2f44c761-86d3-4a87-a20b-4404a91c82ed.png",
  d23: "de8184ae-98d9-4863-a22a-60cc3974fdae.png",
  d25: "1c4a450c-65f4-413a-8618-1b94553b904e.png",
  d26: "b88460d6-8f6d-4ba5-971f-66a6dcdd3be8.png",
  d28: "d527d5e9-d27e-4c57-bba6-db0a735ad581.png",
} as const;

const img = (chiave: keyof typeof IMMAGINE, descrizione: string) => immagine(IMMAGINE[chiave], descrizione);

const SOLO_RISULTATO = "Nel fascicolo andavano scritti anche i calcoli: qui si scrive solo il risultato.";

const DOMANDE: Domanda[] = [
  {
    numero: 1,
    slug: "intero-negativo",
    titolo: "Un intero negativo",
    ambito: "Numeri",
    temi: ["numeri relativi", "potenze"],
    difficolta: 1,
    testo: r`Se \(k\) è un numero intero negativo, qual è il maggiore tra i seguenti numeri?`,
    suggerimento:
      r`Con \(k\) negativo: \(5 + k\) è minore di 5, \(5 \cdot k\) è negativo, \(5^k\) è una frazione minore di 1 (per esempio \(5^{-1} = \frac{1}{5}\)), ` +
      r`mentre \(5 - k\) è maggiore di 5, perché togliere un numero negativo vuol dire aggiungere (per \(k = -2\): \(5 - (-2) = 7\)).`,
    parti: [scelta("", [r`\(5 + k\)`, r`\(5 \cdot k\)`, r`\(5 - k\)`, r`\(5^k\)`], 2)],
  },
  {
    numero: 2,
    slug: "pioggia-a-udine",
    titolo: "La pioggia a Udine",
    ambito: "Dati e previsioni",
    temi: ["grafici", "lettura di grafici", "istogrammi"],
    difficolta: 2,
    testo:
      "Osserva il grafico che riporta alcuni dati raccolti dalla stazione meteorologica di Udine. " +
      img("d02a", "Istogramma del numero di giorni di pioggia per mese: media dal 2001 al 2011 (nero), 2010 (bianco), 2011 (grigio)") +
      " La figura seguente mostra la precipitazione mensile cumulata del 2010 e del 2011. Per esempio, come si vede, a Udine, nel 2010, dall'inizio dell'anno fino ad Aprile sono caduti all'incirca 400 mm di pioggia. " +
      img("d02b", "Grafico della precipitazione mensile cumulata in mm, mese per mese, nel 2010 (triangoli) e nel 2011 (cerchi)"),
    suggerimento:
      "a1) A Settembre 2010 i giorni di pioggia sono 13, a Settembre 2011 sono 5: vera. " +
      "a2) La barra nera più alta è quella di Agosto (circa 12,3), più di Aprile (circa 11,4): falsa. " +
      "a3) Nel 2010 (barre bianche) Giugno ha 7 giorni, il valore più basso dell'anno: vera. " +
      "b1) A fine Aprile 2010 la cumulata è circa 400 mm, a fine Giugno circa 880 mm: in Maggio e Giugno sono caduti circa 480 mm, cioè circa 500: vera. " +
      "b2) Da Aprile in poi i triangoli (2010) stanno sempre sopra i cerchi (2011): vera. " +
      "b3) La cumulata cresce sempre perché somma la pioggia dei mesi precedenti, ma la pioggia di ogni mese è la differenza fra due punti vicini, che non cresce sempre (per esempio nel 2011 da Ottobre a Novembre la cumulata aumenta pochissimo): falsa.",
    parti: [
      veroFalso(
        [
          "Nel mese di Settembre 2010 ci sono stati più giorni di pioggia che nel mese di Settembre 2011",
          "Nel periodo 2001-2011, Aprile è stato il mese con il maggior numero medio di giorni di pioggia",
          "Nel 2010, Giugno è stato il mese con il minor numero di giorni di pioggia",
        ],
        [true, false, true],
        "a) Sulla base dei dati riportati nel primo grafico (giorni di pioggia) indica se ciascuna affermazione è vera o falsa.",
      ),
      veroFalso(
        [
          "Nei mesi di Maggio e Giugno 2010 sono caduti complessivamente circa 500 mm di pioggia",
          "Da Aprile in poi la precipitazione mensile cumulata del 2010 è stata maggiore della precipitazione mensile cumulata del 2011",
          "Sia nel 2010 sia nel 2011, a partire da Gennaio ogni mese è piovuto sempre di più fino ad avere un massimo di precipitazioni in Dicembre",
        ],
        [true, true, false],
        "b) Sulla base dei dati rappresentati nel secondo grafico (precipitazione mensile cumulata) indica se ciascuna affermazione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 3,
    slug: "nave-e-fari",
    titolo: "La nave e i fari",
    ambito: "Spazio e figure",
    temi: ["orientamento", "teorema di Pitagora", "distanza"],
    difficolta: 2,
    adattamento: "Nella parte a la nave andava segnata sulla mappa: qui si sceglie la sua posizione fra quelle proposte.",
    testo:
      "Un capitano vede dalla sua nave che il faro A sulla costa si trova esattamente in direzione Nord-Est (NE), mentre il faro B si trova esattamente in direzione Est (E). " +
      img("d03", "Mappa a quadretti con la rosa dei venti, l'Isola Rotonda a sinistra e i fari A e B sulla costa a destra"),
    suggerimento:
      "a) B è a Est della nave: la nave sta sulla stessa riga orizzontale di B, 6 quadretti più in basso di A. A è a Nord-Est, cioè sulla diagonale dei quadretti: " +
      "per scendere di 6 quadretti lungo la diagonale ci si sposta anche di 6 quadretti verso Ovest. La nave è 6 quadretti a sud e 6 a ovest di A. " +
      r`b) Dall'Isola Rotonda al faro A ci sono 10 quadretti in orizzontale e 3 in verticale: per il teorema di Pitagora \(\sqrt{10^2 + 3^2} = \sqrt{109} \approx 10{,}4\) miglia.`,
    parti: [
      scelta(
        "a) Dove si trova la nave?",
        [
          "6 quadretti a ovest del faro A, alla stessa altezza di A",
          "6 quadretti a sud e 6 quadretti a ovest del faro A",
          "6 quadretti a sud del faro A",
          "3 quadretti a sud e 3 quadretti a ovest del faro A",
        ],
        1,
      ),
      scelta(
        "b) Se il lato di ogni quadretto della mappa corrisponde a 1 miglio nautico, qual è la distanza del faro A dall'Isola Rotonda?",
        ["13 miglia nautiche", "Dalle 9 alle 10 miglia nautiche", "Dalle 10 alle 11 miglia nautiche", "12 miglia nautiche"],
        2,
      ),
    ],
  },
  {
    numero: 4,
    slug: "palestra",
    titolo: "La palestra",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "modellizzazione", "grafici"],
    difficolta: 2,
    testo:
      "Per frequentare una palestra Paolo deve pagare quest'anno una quota fissa di 60 euro e 5 euro per ogni ingresso. " +
      img("d04", "Quattro grafici a punti del costo C in funzione del numero n di ingressi: Grafico 1 costante a 60, Grafico 2 da 0 a 90, Grafico 3 da 5 a 65, Grafico 4 da 60 a 160"),
    suggerimento:
      r`a) Con 0 ingressi si pagano già 60 euro, e ogni ingresso aggiunge 5 euro: con 20 ingressi \(60 + 100 = 160\) euro. È il Grafico 4. ` +
      r`b) Tolta la quota fissa restano \(200 - 60 = 140\) euro, e \(140 : 5 = 28\) ingressi. ` +
      r`c) \(C = 60 + 5n\).`,
    parti: [
      scelta(
        r`a) Quale fra i grafici descrive il costo \(C\) (in euro) della palestra in funzione del numero \(n\) di ingressi?`,
        ["Grafico 1", "Grafico 2", "Grafico 3", "Grafico 4"],
        3,
      ),
      numerica("b) Paolo ha a disposizione 200 euro. Se si iscrive alla palestra, qual è il numero massimo di ingressi a cui ha diritto quest'anno?", "28"),
      espressione(r`c) Completa la formula che esprime il costo \(C\) della palestra in funzione del numero \(n\) di ingressi. \(C =\)`, "60 + 5*n"),
    ],
  },
  {
    numero: 5,
    slug: "frequenza-cardiaca",
    titolo: "La frequenza cardiaca",
    ambito: "Relazioni e funzioni",
    temi: ["funzioni lineari", "percentuali", "lettura di grafici"],
    difficolta: 2,
    testo:
      "Le persone, durante le attività sportive, non dovrebbero superare una determinata frequenza del battito cardiaco, frequenza che varia in funzione dell'età. " +
      r`Il numero massimo di battiti al minuto che non dovrebbe essere superato (frequenza cardiaca massima consigliata) si può calcolare sottraendo a 220 l'età \(x\) del soggetto. ` +
      r`Inoltre, affinché un allenamento in palestra sia efficace, il numero dei battiti \(y\) dovrebbe essere mantenuto in un intervallo compreso tra il 70% e il 90% della frequenza cardiaca massima consigliata. ` +
      r`Sul seguente diagramma cartesiano sono rappresentate, in funzione dell'età (\(x\)), le frequenze cardiache (F) massima e minima entro le quali si ha un allenamento efficace per soggetti che hanno un'età compresa tra 20 e 70 anni. ` +
      img("d05", "Due segmenti nel piano età-frequenza: la frequenza massima scende da 180 a 20 anni a circa 135 a 70 anni, la minima da 140 a circa 105"),
    suggerimento:
      r`a) La frequenza massima consigliata è \(220 - x\); il 70% e il 90% si ottengono moltiplicandola per \(0{,}7\) e per \(0{,}9\): \(0{,}7 \cdot (220 - x) \le y \le 0{,}9 \cdot (220 - x)\). ` +
      r`b1) A 20 anni le frequenze sono 180 e 140 (differenza 40), a 70 anni 135 e 105 (differenza 30): falsa. ` +
      "b2) A 20 anni le due rette partono da 140 e 180: vera. " +
      "b3) A 70 anni la frequenza massima è circa 135, non 120: falsa.",
    parti: [
      scelta(
        "a) Quale delle seguenti disuguaglianze esprime il numero di battiti da mantenere in un allenamento efficace?",
        [
          r`\(70 \cdot (220 - x) \le y \le 90 \cdot (220 - x)\)`,
          r`\(0{,}7 \cdot (220 - x) \le y \le 0{,}9 \cdot (220 - x)\)`,
          r`\(220 - 0{,}9 \cdot x \le y \le 220 - 0{,}7 \cdot x\)`,
          r`\(0{,}9 \cdot 220 - x \le y \le 0{,}7 \cdot 220 - x\)`,
        ],
        1,
      ),
      veroFalso(
        [
          "La differenza fra la frequenza massima e la frequenza minima a 70 anni è maggiore di quella a 20 anni",
          "A vent'anni un allenamento è efficace quando la frequenza cardiaca si mantiene all'incirca tra 140 e 180 battiti al minuto",
          "Perché un allenamento sia efficace, chi ha 70 anni non deve superare la frequenza cardiaca di circa 120 battiti al minuto",
        ],
        [false, true, false],
        "b) Aiutandoti con il diagramma cartesiano, indica se ciascuna affermazione è vera o falsa.",
      ),
    ],
  },
  {
    numero: 6,
    slug: "numeri-primi-marco",
    titolo: "Marco e i numeri primi",
    ambito: "Numeri",
    temi: ["numeri primi", "controesempio", "argomentare"],
    difficolta: 2,
    adattamento: "Nel fascicolo la motivazione andava scritta: qui si sceglie fra motivazioni proposte.",
    testo: r`Marco afferma che, per ogni numero naturale \(n\) maggiore di 0, \(n^2 + n + 1\) è un numero primo. Marco ha ragione?`,
    suggerimento:
      r`Per \(n = 1, 2, 3\) si ottengono 3, 7, 13, che sono primi, ma qualche esempio non basta a dire «per ogni \(n\)». ` +
      r`Per \(n = 4\): \(16 + 4 + 1 = 21 = 3 \cdot 7\), che non è primo. Basta un controesempio: Marco non ha ragione.`,
    parti: [
      scelta(
        "",
        [
          r`Marco ha ragione, perché per \(n = 1, 2, 3\) si ottengono 3, 7 e 13, che sono numeri primi`,
          r`Marco ha ragione, perché \(n^2 + n + 1\) è sempre dispari`,
          r`Marco non ha ragione, perché per \(n = 4\) si ottiene \(21 = 3 \cdot 7\), che non è primo`,
          r`Marco non ha ragione, perché \(n^2 + n + 1\) è sempre pari`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 7,
    slug: "poligono-quadrettato",
    titolo: "Il poligono sulla griglia",
    ambito: "Spazio e figure",
    temi: ["area", "poligoni"],
    difficolta: 2,
    testo: "Osserva la figura. " + img("d07", "Un poligono di cinque lati disegnato su una griglia a quadretti"),
    suggerimento:
      "Il poligono sta in un rettangolo di 5 × 7 = 35 quadretti. Si tolgono i quattro triangoli rettangoli che restano fuori: " +
      "a sinistra 3 × 7 : 2 = 10,5; in alto a destra 2 × 2 : 2 = 2; la rientranza a destra 4 × 1 : 2 = 2; in basso 5 × 1 : 2 = 2,5. " +
      r`\(35 - 10{,}5 - 2 - 2 - 2{,}5 = 18\text{ m}^2\).`,
    parti: [numerica(r`Se il lato di ogni quadretto della griglia corrisponde a 1 m, quanto misura la superficie del poligono, in \(\text{m}^2\)?`, "18")],
  },
  {
    numero: 8,
    slug: "potenza-diviso-due",
    titolo: "Una potenza diviso 2",
    ambito: "Numeri",
    temi: ["potenze"],
    difficolta: 2,
    testo: r`Il risultato di \(16^{100} : 2\) è uguale a`,
    suggerimento:
      r`\(16 = 2^4\), quindi \(16^{100} = 2^{400}\) e \(2^{400} : 2 = 2^{399}\). Dividere per 2 non dimezza l'esponente né la base: \(16^{50}\) e \(8^{100}\) sono molto più piccoli.`,
    parti: [scelta("", [r`\(8^{99}\)`, r`\(8^{100}\)`, r`\(16^{50}\)`, r`\(2^{399}\)`], 3)],
  },
  {
    numero: 9,
    slug: "corsa-campestre",
    titolo: "La corsa campestre",
    ambito: "Numeri",
    temi: ["percentuali", "problemi"],
    difficolta: 2,
    adattamento: SOLO_RISULTATO,
    // Gli alunni restano 1 000 e le percentuali sono decine: ogni passaggio
    // dà un intero. Tutte le percentuali si leggono «il …%» (niente 80, 11).
    variabili: [
      v("partecipa", "10*random(4..7)", "la percentuale di alunni che partecipano (fascicolo: 60)"),
      v("ritiro1", "10*random(1..4)", "la percentuale di partecipanti che si ritira dopo 3 km (fascicolo: 30)"),
      v("ritiro2", "10*random(2..5)", "la percentuale dei restanti che si ritira dopo altri 5 km (fascicolo: 40)"),
      v("partenti", "10*partecipa", "gli alunni che partecipano (fascicolo: 600)"),
      v("restano", "partenti*(100 - ritiro1)/100", "gli alunni rimasti dopo 3 km (fascicolo: 420)"),
      v("arrivano", "restano*(100 - ritiro2)/100", "gli alunni che arrivano al traguardo (fascicolo: 252)"),
    ],
    testo:
      r`A una corsa campestre partecipa il \(\var{partecipa}\%\) degli alunni di una scuola. Dopo i primi 3 km il \(\var{ritiro1}\%\) degli alunni partecipanti si ritira e, dopo altri 5 km, si ritira il \(\var{ritiro2}\%\) dei restanti. ` +
      "Tutti gli altri arrivano al traguardo. Se gli alunni della scuola sono 1 000, quanti arrivano al traguardo?",
    suggerimento:
      r`Partecipano \(1000 \cdot \var{partecipa/100} = \var{partenti}\) alunni. Dopo 3 km se ne ritira il \(\var{ritiro1}\%\): restano \(\var{partenti} \cdot \var{(100 - ritiro1)/100} = \var{restano}\). ` +
      r`Poi si ritira il \(\var{ritiro2}\%\) di questi: restano \(\var{restano} \cdot \var{(100 - ritiro2)/100} = \var{arrivano}\) alunni. Le percentuali non si sommano: ognuna si calcola sui rimasti.`,
    parti: [numerica("Numero di alunni che arrivano al traguardo:", "arrivano")],
  },
  {
    numero: 10,
    slug: "stipendi",
    titolo: "Gli stipendi",
    ambito: "Dati e previsioni",
    temi: ["moda", "mediana", "media", "tabelle"],
    difficolta: 2,
    testo:
      "Osserva la seguente tabella, che riporta la distribuzione di frequenza degli stipendi mensili dei dipendenti di un'azienda. " +
      r`\[\begin{array}{|c|c|} \hline \text{Stipendio (in €)} & \text{N° dipendenti} \\ \hline 1\,000 & 12 \\ \hline 1\,300 & 145 \\ \hline 1\,800 & 20 \\ \hline 3\,500 & 8 \\ \hline 5\,000 & 6 \\ \hline \end{array}\]`,
    suggerimento:
      "a) La moda è il valore più frequente, cioè lo stipendio di 1 300 euro; 145 è la sua frequenza: falsa. " +
      "b) I dipendenti sono 12 + 145 + 20 + 8 + 6 = 191: la mediana è il 96° stipendio in ordine, che cade fra il 13° e il 157°, cioè 1 300 euro: vera. " +
      r`c) Somma degli stipendi: \(12\,000 + 188\,500 + 36\,000 + 28\,000 + 30\,000 = 294\,500\); \(294\,500 : 191 \approx 1\,542\) euro, minore di 1 800: vera.`,
    parti: [
      veroFalso(
        ["La moda della distribuzione è 145", "La mediana della distribuzione è 1 300 euro", "La media aritmetica della distribuzione è minore di 1 800 euro"],
        [false, true, true],
      ),
    ],
  },
  {
    numero: 11,
    slug: "parallelogramma",
    titolo: "Il triangolo nel parallelogramma",
    ambito: "Spazio e figure",
    temi: ["area", "parallelogramma", "triangoli"],
    difficolta: 2,
    adattamento: SOLO_RISULTATO,
    testo: r`\(PQRS\) è un parallelogramma e \(T\) è il punto medio di \(SR\). ` + img("d11", "Il parallelogramma PQRS con il punto T a metà del lato SR e il triangolo QST"),
    suggerimento:
      r`Il triangolo \(QST\) ha per base \(ST\), metà di \(SR\), e la stessa altezza del parallelogramma. ` +
      r`Area del triangolo: \(\frac{1}{2} \cdot \frac{SR}{2} \cdot h = \frac{1}{4} \cdot SR \cdot h\), cioè un quarto dell'area del parallelogramma.`,
    parti: [
      espressione(
        r`Qual è il rapporto tra l'area del triangolo \(QST\) e l'area del parallelogramma? Scrivi il risultato come frazione.`,
        "1/4",
      ),
    ],
  },
  {
    numero: 12,
    slug: "sondaggio-rivista",
    titolo: "Il sondaggio sulla rivista",
    ambito: "Dati e previsioni",
    temi: ["tabelle a doppia entrata", "probabilità", "probabilità condizionata"],
    difficolta: 2,
    // Il campione resta di 1 500 donne: l'ultima casella completa il totale.
    variabili: [
      v("occpos", "random(400..500)", "occupate con giudizio positivo (fascicolo: 450)"),
      v("disocpos", "random(250..300)", "disoccupate con giudizio positivo (fascicolo: 276)"),
      v("occneg", "random(330..400)", "occupate con giudizio negativo (fascicolo: 367)"),
      v("disocneg", "1500 - occpos - disocpos - occneg", "disoccupate con giudizio negativo, perché siano 1 500 in tutto: da 300 a 520 (fascicolo: 407)"),
    ],
    testo:
      "È stato effettuato un sondaggio su un campione di 1 500 donne di età compresa tra i 25 e i 55 anni per conoscere la loro opinione su una rivista mensile dedicata alla salute. Si sono ottenuti i seguenti risultati: " +
      r`\[\begin{array}{|l|c|c|} \hline & \text{Occupate} & \text{Disoccupate} \\ \hline \text{Giudizio positivo} & \var{occpos} & \var{disocpos} \\ \hline \text{Giudizio negativo} & \var{occneg} & \var{disocneg} \\ \hline \end{array}\]`,
    suggerimento:
      r`a) Giudizio positivo: \(\var{occpos} + \var{disocpos} = \var{occpos+disocpos}\). ` +
      r`b) Disoccupate: \(\var{disocpos} + \var{disocneg} = \var{disocpos+disocneg}\). ` +
      r`c) Giudizio negativo: \(\var{occneg} + \var{disocneg} = \var{occneg+disocneg}\) donne su 1 500: \(\frac{\var{occneg+disocneg}}{1500}\). ` +
      r`d) Ora i casi possibili sono solo le \(\var{occpos+disocpos}\) donne con giudizio positivo, di cui \(\var{occpos}\) occupate: \(\frac{\var{occpos}}{\var{occpos+disocpos}}\).`,
    parti: [
      numerica("a) Quante sono le donne che hanno espresso un giudizio positivo?", "occpos + disocpos"),
      numerica("b) Quante sono le donne disoccupate intervistate?", "disocpos + disocneg"),
      espressione(
        "c) Scegliendo a caso una delle donne intervistate, qual è la probabilità che abbia espresso un giudizio negativo? Scrivi il risultato come frazione.",
        "{occneg+disocneg}/1500",
      ),
      espressione(
        "d) Scegliendo a caso una delle donne intervistate tra quelle che hanno espresso un giudizio positivo, qual è la probabilità che sia una donna occupata? Scrivi il risultato come frazione.",
        "{occpos}/{occpos+disocpos}",
      ),
    ],
  },
  {
    numero: 13,
    slug: "proporzionalita-inversa-quadrato",
    titolo: "Inversamente proporzionale al quadrato",
    ambito: "Relazioni e funzioni",
    temi: ["proporzionalità inversa"],
    difficolta: 2,
    testo: r`La grandezza \(y\) è inversamente proporzionale al quadrato della grandezza \(x\) e, per \(x = 2\), si ha \(y = 4\). Quindi, se \(x = 8\), \(y\) è uguale a`,
    suggerimento:
      r`\(y = \frac{k}{x^2}\): da \(4 = \frac{k}{4}\) si ha \(k = 16\). Per \(x = 8\): \(y = \frac{16}{64} = \frac{1}{4}\). ` +
      r`In altre parole: \(x\) diventa 4 volte più grande, \(x^2\) 16 volte, quindi \(y\) diventa 16 volte più piccolo: \(4 : 16 = \frac{1}{4}\).`,
    parti: [scelta("", [r`\(\frac{1}{4}\)`, r`\(4\)`, r`\(16\)`, r`\(\frac{1}{16}\)`], 0)],
  },
  {
    numero: 14,
    slug: "quattro-rette",
    titolo: "Le rette F, G, H, K",
    ambito: "Spazio e figure",
    temi: ["retta", "piano cartesiano", "equazione della retta"],
    difficolta: 2,
    adattamento: "Nel fascicolo è una tabella con una crocetta per riga: qui ogni riga è una domanda a scelta.",
    testo:
      r`Sul seguente piano cartesiano sono rappresentate le rette \(F\), \(G\), \(H\), \(K\). ` +
      img("d14", "Piano cartesiano con quattro rette: F passa per l'origine e per (−1; 2), G per (0; 4) e (2; 0), H è orizzontale a y = −2, K è verticale a x = −2") +
      " Associa a ciascuna delle equazioni la retta corrispondente.",
    suggerimento:
      r`a) \(y = -2x + 4\) passa per \((0; 4)\) e per \((2; 0)\): è la retta \(G\). ` +
      r`b) \(y = -2x\) passa per l'origine e per \((-1; 2)\): è la retta \(F\), parallela a \(G\). ` +
      r`c) \(y = -2\) è la retta orizzontale con tutti i punti di ordinata \(-2\): è \(H\). (La retta verticale \(K\) ha equazione \(x = -2\).)`,
    parti: [
      scelta(r`a) \(y = -2x + 4\)`, ["Retta F", "Retta G", "Retta H", "Retta K"], 1),
      scelta(r`b) \(y = -2x\)`, ["Retta F", "Retta G", "Retta H", "Retta K"], 0),
      scelta(r`c) \(y = -2\)`, ["Retta F", "Retta G", "Retta H", "Retta K"], 2),
    ],
  },
  {
    numero: 15,
    slug: "implicazioni",
    titolo: "Se… allora",
    ambito: "Numeri",
    temi: ["implicazione", "legge di annullamento del prodotto", "quadrati"],
    difficolta: 2,
    testo: r`\(a\) e \(b\) sono due numeri reali.`,
    suggerimento:
      r`a) \(2^2 = 4\): vera. ` +
      r`b) Anche \((-2)^2 = 4\): da \(a^2 = 4\) segue \(a = 2\) oppure \(a = -2\). Falsa. ` +
      r`c) Se \(a \cdot b = 0\) può essere \(b = 0\) e \(a\) qualunque (per esempio \(3 \cdot 0 = 0\)). Falsa. ` +
      r`d) Zero per qualunque numero fa zero: vera.`,
    parti: [
      veroFalso(
        [r`Se \(a = 2\), allora \(a^2 = 4\)`, r`Se \(a^2 = 4\), allora \(a = 2\)`, r`Se \(a \cdot b = 0\), allora \(a = 0\)`, r`Se \(a = 0\), allora \(a \cdot b = 0\)`],
        [true, false, false, true],
      ),
    ],
  },
  {
    numero: 16,
    slug: "rettangolo-nella-circonferenza",
    titolo: "Il rettangolo nella circonferenza",
    ambito: "Spazio e figure",
    temi: ["circonferenza", "rettangolo", "diagonali"],
    difficolta: 2,
    adattamento: SOLO_RISULTATO,
    variabili: [v("diametro", "2*random(4..10)", "il diametro in cm, pari: il raggio è intero (fascicolo: 12)")],
    testo:
      r`La circonferenza disegnata qui sotto ha come centro l'origine \(O\) degli assi cartesiani e \(C\) è un suo punto. \(A\) e \(B\) sono le proiezioni sugli assi cartesiani di \(C\). Il diametro della circonferenza è \(\var{diametro}\) cm. ` +
      img("d16", "Circonferenza di centro O; il punto C sulla circonferenza e le sue proiezioni A sull'asse x e B sull'asse y formano il rettangolo OACB"),
    suggerimento:
      r`\(OACB\) è un rettangolo: le sue diagonali \(AB\) e \(OC\) sono uguali. \(OC\) è un raggio, cioè metà del diametro: \(AB = OC = \var{diametro} : 2 = \var{diametro/2}\) cm. Non serve sapere dove sta \(C\).`,
    parti: [numerica(r`Qual è la lunghezza del segmento \(AB\), in cm?`, "diametro/2")],
  },
  {
    numero: 17,
    slug: "equazione-parametrica",
    titolo: "Un'equazione con k",
    ambito: "Numeri",
    temi: ["equazioni", "parametri"],
    difficolta: 2,
    // noto < coef/2: per il k giusto il coefficiente di x, coef - 2·noto, non
    // si annulla (l'equazione ha davvero la sola soluzione 1).
    variabili: [
      v("coef", "random(3..9)", "il termine noto nel coefficiente di x (fascicolo: 3)"),
      v("noto", "random(1..floor((coef-1)/2))", "il termine noto dell'equazione (fascicolo: 1)"),
    ],
    testo: r`È data l'equazione \((2k - \var{coef})x + \var{noto} - k = 0\), in cui \(x\) è l'incognita e \(k\) è un numero reale.`,
    suggerimento:
      r`Se la soluzione è 1, sostituendo \(x = 1\) l'uguaglianza è vera: \(2k - \var{coef} + \var{noto} - k = 0\), cioè \(k - \var{coef-noto} = 0\), \(k = \var{coef-noto}\). ` +
      r`Verifica: per \(k = \var{coef-noto}\) il coefficiente di \(x\) vale \(2 \cdot \var{coef-noto} - \var{coef} = \var{coef-2*noto}\) e il termine noto \(\var{noto} - \var{coef-noto} = -\var{coef-2*noto}\): l'equazione ha la sola soluzione \(x = 1\).`,
    parti: [numerica(r`La soluzione dell'equazione è 1 per \(k =\)`, "coef - noto")],
  },
  {
    numero: 18,
    slug: "trapezio-circoscritto",
    titolo: "Il trapezio circoscritto",
    ambito: "Spazio e figure",
    temi: ["area", "trapezio", "cerchio inscritto"],
    difficolta: 2,
    // Le basi sommano più di 4 raggi: in un trapezio circoscritto la somma
    // delle basi è quella dei lati obliqui, ognuno più lungo dell'altezza.
    variabili: [
      v("raggio", "random(3..8)", "il raggio del cerchio in cm (fascicolo: 5)"),
      v("basi", "4*raggio + random(2..6)", "la somma delle basi in cm, più di 4 raggi (fascicolo: 24)"),
      v("area", "raggio*basi", "l'area del trapezio in cm² (fascicolo: 120)"),
    ],
    testo:
      r`Il trapezio \(ABCD\), circoscritto a un cerchio di raggio \(\var{raggio}\) cm, ha l'area di \(\var{area}\text{ cm}^2\). ` +
      img("d18", "Il trapezio ABCD con la base maggiore AB in basso, circoscritto a un cerchio che tocca le due basi e i due lati obliqui"),
    suggerimento:
      r`Il cerchio tocca entrambe le basi: l'altezza del trapezio è il diametro, \(\var{2*raggio}\) cm. ` +
      r`Da \(\frac{(AB + DC) \cdot \var{2*raggio}}{2} = \var{area}\) si ricava \(AB + DC = \frac{\var{2*area}}{\var{2*raggio}} = \var{basi}\) cm.`,
    parti: [numerica(r`Quanto misura la somma delle basi \(AB\) e \(DC\), in cm?`, "basi")],
  },
  {
    numero: 19,
    slug: "calcio-e-basket",
    titolo: "Calcio e basket",
    ambito: "Dati e previsioni",
    temi: ["insiemi", "diagrammi di Venn"],
    difficolta: 2,
    adattamento: "Nel fascicolo il numero andava scritto nella zona giusta del diagramma: qui si scrive come risposta.",
    // Gli alunni restano 100; si parte dalle quattro zone del diagramma.
    variabili: [
      v("entrambi", "random(10..20)", "chi segue entrambi gli sport (fascicolo: 18)"),
      v("solobasket", "random(5..12)", "chi segue solo il basket (fascicolo: 8)"),
      v("nessuno", "random(5..12)", "chi non segue nessuno dei due (fascicolo: 10)"),
      v("solocalcio", "100 - entrambi - solobasket - nessuno", "chi segue solo il calcio: da 56 a 80 (fascicolo: 64)"),
      v("calcio", "solocalcio + entrambi", "chi segue il calcio (fascicolo: 82)"),
      v("basket", "solobasket + entrambi", "chi segue il basket (fascicolo: 26)"),
    ],
    testo:
      r`Su 100 alunni di una scuola, \(\var{calcio}\) alunni si interessano di calcio, \(\var{basket}\) si interessano di basket, \(\var{nessuno}\) non si interessano né di calcio, né di basket. ` +
      img("d19", "Diagramma di Eulero-Venn con due insiemi che si intersecano, Basket e Calcio, dentro un rettangolo"),
    suggerimento:
      r`Si interessano di almeno uno dei due sport \(100 - \var{nessuno} = \var{100-nessuno}\) alunni. Sommando \(\var{calcio} + \var{basket} = \var{calcio+basket}\) chi segue entrambi gli sport è contato due volte: ` +
      r`\(\var{calcio+basket} - \var{100-nessuno} = \var{entrambi}\) alunni, da scrivere nella zona comune ai due insiemi.`,
    parti: [numerica("Quanti studenti si interessano sia di calcio sia di basket (la zona comune ai due insiemi)?", "entrambi")],
  },
  {
    numero: 20,
    slug: "pezzi-difettosi",
    titolo: "I pezzi difettosi",
    ambito: "Numeri",
    temi: ["proporzioni", "stime"],
    difficolta: 2,
    adattamento: SOLO_RISULTATO,
    // Si parte dalla stima: la seconda produzione, in decine, è quella che la
    // dà quasi esatta. Con difettosi ≤ 20 e prima produzione ≥ 1 000 il
    // quarto termine dista dalla stima al più 0,1: l'arrotondamento non è mai
    // in bilico.
    variabili: [
      v("difettosi", "random(10..20)", "i pezzi difettosi della prima produzione (fascicolo: 14)"),
      v("prod1", "100*random(10..15)", "i pezzi della prima produzione (fascicolo: 1 200)"),
      v("stima", "difettosi + random(5..15)", "la stima arrotondata all'unità (fascicolo: 25)"),
      v("prod2", "10*round(prod1*stima/(10*difettosi))", "i pezzi della seconda produzione, in decine (fascicolo: 2 150)"),
    ],
    testo:
      r`Da un controllo di qualità è emerso che una macchina ha prodotto \(\var{difettosi}\) pezzi difettosi su una produzione di \(\var{prod1}\) pezzi. Che stima è ragionevole fare del numero di pezzi difettosi su una produzione di \(\var{prod2}\) pezzi?`,
    suggerimento:
      r`Si suppone che la proporzione di pezzi difettosi resti la stessa: \(\var{difettosi} : \var{prod1} = x : \var{prod2}\), da cui \(x = \frac{\var{difettosi} \cdot \var{prod2}}{\var{prod1}}\), che arrotondato all'unità dà circa \(\var{stima}\) pezzi.`,
    parti: [numerica("Numero di pezzi difettosi (approssimato all'unità):", "stima")],
  },
  {
    numero: 21,
    slug: "quadrati-annidati",
    titolo: "Quadrati uno nell'altro",
    ambito: "Spazio e figure",
    temi: ["quadrato", "area", "radicali"],
    difficolta: 2,
    // Il lato grande è 4n: i lati dei quadrati sono 4n, 2n√2, 2n, n√2 (e n
    // il quinto). Gli errori del fascicolo (2, 4, 4√2 con n = 2): un quadrato
    // di troppo (o il lato grande diviso per 4), il terzo e il secondo quadrato.
    variabili: [v("n", "random(2..6)", "un quarto del lato del quadrato grande, che ha area 16n² (fascicolo: 2)")],
    testo:
      r`Si è costruita la figura che vedi inserendo nel quadrato più grande un secondo quadrato i cui vertici sono i punti medi dei lati del primo. Si è ripetuta la stessa procedura, inserendo altri due quadrati. Se la superficie del quadrato più grande misura \(\var{16*n^2}\text{ cm}^2\), quanto misura il lato del quadrato più piccolo? ` +
      img("d21", "Quattro quadrati uno dentro l'altro, ognuno con i vertici nei punti medi dei lati del precedente"),
    suggerimento:
      r`Il quadrato con i vertici nei punti medi dei lati ha metà dell'area del precedente. Le aree sono \(\var{16*n^2}\), \(\var{8*n^2}\), \(\var{4*n^2}\), \(\var{2*n^2}\text{ cm}^2\): ` +
      r`il quarto quadrato ha lato \(\sqrt{\var{2*n^2}} = \var{n}\sqrt{2}\) cm.`,
    parti: [scelta("", [r`\(\var{n}\) cm`, r`\(\var{n}\sqrt{2}\) cm`, r`\(\var{2*n}\) cm`, r`\(\var{2*n}\sqrt{2}\) cm`], 1)],
  },
  {
    numero: 22,
    slug: "tariffe-parcheggio",
    titolo: "Le tariffe del parcheggio",
    ambito: "Relazioni e funzioni",
    temi: ["modellizzazione", "equazioni", "problemi"],
    difficolta: 2,
    adattamento: "Nella parte a la tariffa si sceglie fra le tre; nella parte b si scrive solo il risultato, senza i calcoli.",
    testo:
      "Un parcheggio propone ai clienti tre tariffe: tariffa A: 15 euro per tutta la giornata (24 ore); tariffa B: 1 euro all'ora; tariffa C: la prima ora gratis e 1,20 euro per ogni ora successiva.",
    suggerimento:
      r`a) Per 8 ore: A costa 15 euro, B \(8 \cdot 1 = 8\) euro, C \(7 \cdot 1{,}20 = 8{,}40\) euro. Conviene la B. ` +
      r`b) B costa \(h\) euro, C costa \(1{,}20 \cdot (h - 1)\) euro: \(h = 1{,}2h - 1{,}2\), cioè \(0{,}2h = 1{,}2\), \(h = 6\) ore (6 euro in entrambi i casi).`,
    parti: [
      scelta("a) Mario deve lasciare al parcheggio l'auto per 8 ore. Quale tariffa gli conviene scegliere?", ["La tariffa A", "La tariffa B", "La tariffa C"], 1),
      numerica(r`b) Qual è il numero \(h\) di ore di parcheggio per cui le tariffe B e C si equivalgono? \(h =\)`, "6"),
    ],
  },
  {
    numero: 23,
    slug: "triangolo-aureo",
    titolo: "Il triangolo isoscele e la bisettrice",
    ambito: "Spazio e figure",
    temi: ["triangoli", "angoli", "bisettrice", "similitudine"],
    difficolta: 3,
    testo:
      r`Il triangolo \(ABC\) è isoscele sulla base \(AB\). L'angolo in \(C\) è la metà dell'angolo in \(B\) e \(AD\) è la bisettrice dell'angolo \(B\hat{A}C\). ` +
      img("d23", "Il triangolo isoscele ABC con la base AB in basso e il segmento AD, con D sul lato BC"),
    suggerimento:
      r`Gli angoli alla base sono uguali: \(\hat{A} = \hat{B}\), \(\hat{C} = \frac{\hat{B}}{2}\). Da \(\hat{B} + \hat{B} + \frac{\hat{B}}{2} = 180°\) si ha \(\hat{B} = 72°\) e \(\hat{C} = 36°\) (b vera). ` +
      r`La bisettrice divide \(\hat{A}\) in due angoli di 36°. In \(ABD\) l'angolo in \(D\) è \(180° - 36° - 72° = 72°\), non 90°: \(AD\) non è un'altezza (a falsa). ` +
      r`\(ADC\) ha due angoli di 36°: \(DC = AD\); \(ABD\) ha due angoli di 72°: \(AD = AB\). I due triangoli hanno la stessa altezza da \(A\), quindi le aree stanno come \(DC : BD\), ` +
      r`circa \(1{,}6\), non 2 (c falsa). \(ABD\) ha gli stessi angoli di \(ABC\) (36°, 72°, 72°): sono simili, e \(AD : AC = BD : AB\) (d vera).`,
    parti: [
      veroFalso(
        [
          r`\(AD\) è anche l'altezza relativa al lato \(BC\)`,
          r`L'angolo in \(B\) misura 72°`,
          r`L'area del triangolo \(ADC\) è il doppio dell'area del triangolo \(ABD\)`,
          r`\(AD : AC = BD : AB\)`,
        ],
        [false, true, false, true],
      ),
    ],
  },
  {
    numero: 24,
    slug: "numero-tra-zero-e-uno",
    titolo: "Un numero tra 0 e 1",
    ambito: "Numeri",
    temi: ["ordinamento", "potenze", "radicali"],
    difficolta: 2,
    testo: r`Se \(a\) è un numero reale compreso tra 0 e 1 \((0 < a < 1)\), allora`,
    suggerimento:
      r`Prova con \(a = \frac{1}{4}\): \(a^2 = \frac{1}{16}\), \(\sqrt{a} = \frac{1}{2}\), \(\frac{1}{a} = 4\). ` +
      r`Fra 0 e 1 il quadrato rimpicciolisce, la radice ingrandisce e il reciproco supera 1: \(a^2 < a < \sqrt{a} < \frac{1}{a}\).`,
    parti: [
      scelta(
        "",
        [
          r`\(a < \sqrt{a} < \frac{1}{a} < a^2\)`,
          r`\(\frac{1}{a} < \sqrt{a} < a < a^2\)`,
          r`\(a^2 < a < \sqrt{a} < \frac{1}{a}\)`,
          r`\(\sqrt{a} < a < a^2 < \frac{1}{a}\)`,
        ],
        2,
      ),
    ],
  },
  {
    numero: 25,
    slug: "prato-fiorito",
    titolo: "Prato fiorito",
    ambito: "Dati e previsioni",
    temi: ["probabilità"],
    difficolta: 1,
    testo:
      "«Prato fiorito» è un gioco per computer che si gioca su una scacchiera. Cliccando sui riquadri della scacchiera, a volte si può scoprire un fiore nascosto. " +
      "Per esempio, nella scacchiera di 9×9 riquadri rappresentata in figura sono nascosti 10 fiori. " +
      img("d25", "La finestra del gioco Prato fiorito con una scacchiera di 9 per 9 riquadri e il contatore dei fiori a 10"),
    // Variabile solo la parte b: la a dipende dalla figura. Righe pari e
    // colonne multiple di 4: i riquadri sono multipli di 8, i fiori interi.
    variabili: [
      v("righe", "2*random(5..8)", "le righe della scacchiera (fascicolo: 12)"),
      v("colonne", "4*random(4..7)", "le colonne della scacchiera (fascicolo: 20)"),
      v("q", "random(4, 8)", "la probabilità è 1/q (fascicolo: 8)"),
    ],
    suggerimento:
      r`a) I riquadri sono \(9 \cdot 9 = 81\), e 10 nascondono un fiore: \(\frac{10}{81}\). ` +
      r`b) I riquadri sono \(\var{righe} \cdot \var{colonne} = \var{righe*colonne}\): perché la probabilità sia \(\frac{1}{\var{q}}\) i fiori devono essere \(\var{righe*colonne} : \var{q} = \var{righe*colonne/q}\).`,
    parti: [
      scelta(
        "a) Qual è la probabilità di scoprire al primo tentativo un fiore nella scacchiera rappresentata in figura?",
        [r`\(\frac{1}{9}\)`, r`\(\frac{1}{81}\)`, r`\(\frac{10}{80}\)`, r`\(\frac{10}{81}\)`],
        3,
      ),
      numerica(
        r`b) È possibile personalizzare il gioco impostando le dimensioni della scacchiera (cioè il numero di righe e di colonne) e il numero di fiori nascosti. Se si gioca con una scacchiera di \(\var{righe} \times \var{colonne}\) riquadri, quale deve essere il numero dei fiori nascosti perché la probabilità di scoprire un fiore al primo tentativo sia \(\frac{1}{\var{q}}\)?`,
        "righe*colonne/q",
      ),
    ],
  },
  {
    numero: 26,
    slug: "trasformazione-triangolo",
    titolo: "La trasformazione del triangolo",
    ambito: "Spazio e figure",
    temi: ["trasformazioni geometriche", "rotazioni", "piano cartesiano"],
    difficolta: 3,
    testo:
      "Osserva la seguente figura. " +
      img("d26", "Piano cartesiano con il triangolo ABC, A(1; 3), B(1; 6), C(3; 3), e il triangolo A'B'C', A'(−1; 1), B'(−4; 1), C'(−1; 3)") +
      " Il triangolo A'B'C' è stato ottenuto dal triangolo ABC attraverso",
    suggerimento:
      r`Si legge \(A(1; 3)\), \(B(1; 6)\), \(C(3; 3)\) e \(A'(-1; 1)\), \(B'(-4; 1)\), \(C'(-1; 3)\). Il lato \(AB\), verticale, diventa \(A'B'\), orizzontale: è una rotazione di 90°. ` +
      r`Rispetto a \((1; 1)\): \(A\) sta 2 sopra il centro e finisce 2 a sinistra in \((-1; 1)\); \(B\) sta 5 sopra e finisce 5 a sinistra in \((-4; 1)\); \(C\) sta 2 a destra e 2 sopra e finisce in \((-1; 3)\). ` +
      r`Rispetto a \((0; 0)\), invece, \(A\) andrebbe in \((-3; 1)\).`,
    parti: [
      scelta(
        "",
        [
          "una simmetria di centro (0;3)",
          "una rotazione antioraria di centro (0;0) e ampiezza 90°",
          "una simmetria assiale rispetto all'asse y",
          "una rotazione antioraria di centro (1;1) e ampiezza 90°",
        ],
        3,
      ),
    ],
  },
  {
    numero: 27,
    slug: "polinomio-divisibile",
    titolo: "Un polinomio divisibile",
    ambito: "Numeri",
    temi: ["polinomi", "divisibilità", "scomposizione"],
    difficolta: 2,
    testo: r`Il polinomio \(x^3 - 8\) è divisibile per`,
    suggerimento:
      r`Un polinomio è divisibile per \(x - c\) quando si annulla per \(x = c\) (teorema di Ruffini): \(2^3 - 8 = 0\). ` +
      r`Infatti \(x^3 - 8 = (x - 2)(x^2 + 2x + 4)\). Per \(x = -8\), \(-4\), \(4\) il polinomio non si annulla.`,
    parti: [scelta("", [r`\(x + 8\)`, r`\(x - 2\)`, r`\(x + 4\)`, r`\(x - 4\)`], 1)],
  },
  {
    numero: 28,
    slug: "grafico-del-moto",
    titolo: "Il grafico del moto",
    ambito: "Relazioni e funzioni",
    temi: ["grafici", "velocità", "lettura di grafici"],
    difficolta: 2,
    testo:
      r`Il seguente grafico rappresenta le posizioni assunte da un corpo in funzione del tempo. La posizione \(s\) è espressa in chilometri (km) e il tempo \(t\) in ore (h). ` +
      img("d28", "Grafico della posizione s in km in funzione del tempo t in ore: sale da 0 a 200 km fino a t = 2 h, resta a 200 km fino a t = 6 h, poi sale ripidamente") +
      " Quale fra le seguenti è una corretta descrizione del movimento del corpo?",
    suggerimento:
      "Fino a 2 h la posizione cresce in modo lineare: velocità costante (100 km/h). Da 2 h a 6 h la posizione resta 200 km: il corpo è fermo per 6 − 2 = 4 ore, non 6. " +
      "Dopo le 6 h il grafico è molto più ripido che all'inizio: la velocità è maggiore.",
    parti: [
      scelta(
        "",
        [
          "Si muove con velocità costante per 2 ore, poi si ferma per 6 ore e infine riparte con una velocità maggiore di quella con cui si è mosso nelle prime 2 ore",
          "Si muove con velocità costante per 2 ore, poi si ferma per 4 ore e infine riparte con una velocità minore di quella con cui si è mosso nelle prime 2 ore",
          "Si muove con velocità costante per 2 ore, poi si ferma per 6 ore e infine riparte con una velocità minore di quella con cui si è mosso nelle prime 2 ore",
          "Si muove con velocità costante per 2 ore, poi si ferma per 4 ore e infine riparte con una velocità maggiore di quella con cui si è mosso nelle prime 2 ore",
        ],
        3,
      ),
    ],
  },
];

export const PACCHETTO_INVALSI_2014: EsercizioPacchetto[] = creaPacchetto({ anno: 2014, annoScolastico: "2013/14" }, DOMANDE);

if (lanciatoDirettamente(import.meta.url)) {
  scriviPacchetto(PACCHETTO_INVALSI_2014);
}
