import { jme, errorMessageIn } from "@savint/engine";

export type EsitoConversione =
  | { ok: true; jme: string }
  | {
      ok: false;
      /** `nome_come_funzione` è il quarto motivo, e non c'era nel brief: ce
       * l'ha messo la constatazione che un nome in posizione di chiamata
       * vuole una frase OPPOSTA a quella di un nome in posizione di valore.
       * A `sin x` si risponde «scrivi le parentesi: sin(x)»; ad `a(x+1)`
       * quella stessa frase suggerirebbe il difetto, perché le parentesi ci
       * sono già e quel che manca è l'asterisco. Due frasi contrarie non
       * possono stare dietro un motivo solo. */
      motivo: "ambiguo" | "non_compila" | "nome_sconosciuto" | "nome_come_funzione";
      dettaglio: string;
    };

export interface OpzioniConversione {
  /** La superficie ammette UN nome libero non dichiarato: l'incognita.
   *
   * Vale per la **risposta attesa** di una parte a espressione, dove
   * `a*n*x^(n-1)` è la forma normale e `x` è l'incognita, non una variabile
   * dimenticata nel pannello (`content/esercizi/06-derivate-elementari.json`).
   * Non è un'indulgenza inventata qui: `verifica.ts:363-416` **campiona
   * già** gli identificatori liberi delle risposte a espressione, per
   * progetto, e questo cancello si allinea a ciò che la verifica fa a valle.
   *
   * Uno, non «quanti se ne vogliono»: è il numero che separa l'incognita
   * dalla giustapposizione. `sin x` ne ha due (`sin`, `x`), `s e n x` — ciò
   * che MathLive fa di `sen x`, e che vale `e` di Nepero senza lanciare —
   * ne ha tre.
   *
   * Sul **valore atteso** di una parte numerica resta spento: lì il valore
   * deve essere calcolabile dalle variabili dichiarate, e un nome libero è
   * davvero un errore. */
  incognitaAmmessa?: boolean;
}

/** I segni che MathLive emette per `\pm` e `\mp`, in tutte le forme in cui
 * li emette davvero.
 *
 * I due digrammi ASCII sono quelli del brief. I due caratteri Unicode sono
 * la lacuna che quella misura aveva: `\mp` esce come **U+2213**, non come
 * `-+`, e `\frac{-b\mp\sqrt{b^2-4ac}}{2a}` — la stessa quadratica, con
 * l'altro segno — passerebbe il cancello. `jme.compile` li ACCETTA in
 * silenzio: `x=+-3` compila e vale `x = -3`, la quadratica compila e tiene
 * la sola radice col meno, `a±b` compila e ha nomi tutti noti. (`x=±3`
 * lancia in compilazione, ma affidarsi a quello vorrebbe dire affidarsi al
 * caso: `a±b` no.)
 *
 * Questi caratteri stanno nell'elenco dei RIFIUTI, non nella tabella delle
 * riscritture dello strato 2: non c'è un JME in cui tradurli, ed è tutto il
 * punto. */
const SEGNI_AMBIGUI = ["+-", "-+", "±", "∓"] as const;

/** Il contenuto delle parentesi che si aprono in `aperta`, e l'indice subito
 * dopo quella che le chiude. `null` se non si chiudono. Le parentesi si
 * contano, non si cerca la prima chiusa: `root(3)(x+(1))` è un caso
 * normale. */
function gruppo(testo: string, aperta: number): { dentro: string; dopo: number } | null {
  if (testo[aperta] !== "(") return null;
  let profondita = 0;
  for (let i = aperta; i < testo.length; i += 1) {
    if (testo[i] === "(") profondita += 1;
    else if (testo[i] === ")") {
      profondita -= 1;
      if (profondita === 0) return { dentro: testo.slice(aperta + 1, i), dopo: i + 1 };
    }
  }
  return null;
}

/** Strato 2, riga 1: `root(n)(x)` → `(x)^(1/(n))`.
 *
 * JME non ha una `root` a due chiamate: `root(3)(8)` compila (una chiamata
 * su una chiamata è sintassi valida) ma il motore rifiuta di valutarla
 * («Nessuna definizione di root adatta a questi tipi di argomento»), cioè
 * fallirebbe soltanto sotto gli occhi della classe.
 *
 * Le parentesi attorno a radicando e indice non sono ornamento: senza,
 * `root(n)(x+1)` diventerebbe `x+1^(1/n)`, cioè un'altra formula. */
function sciogliRadici(testo: string): string {
  const RADICE = "root(";
  for (let i = testo.indexOf(RADICE); i !== -1; i = testo.indexOf(RADICE, i + 1)) {
    // `broot(...)` non è una radice: `root` deve cominciare un nome.
    if (i > 0 && /[A-Za-z0-9_]/.test(testo[i - 1] as string)) continue;
    const indice = gruppo(testo, i + RADICE.length - 1);
    if (!indice) continue;
    const radicando = gruppo(testo, indice.dopo);
    if (!radicando) continue;
    const sciolta = `(${radicando.dentro})^(1/(${indice.dentro}))`;
    // Da capo sul testo riscritto: ogni giro toglie una `root(`, quindi il
    // giro finisce. Le radici annidate si sciolgono così, senza che questa
    // funzione debba sapere che esistono.
    return sciogliRadici(testo.slice(0, i) + sciolta + testo.slice(radicando.dopo));
  }
  return testo;
}

/** Strato 2, riga 3: `|…|` → `abs(…)`.
 *
 * JME non ha le barre: `|x|` non compila affatto. Le barre si accoppiano da
 * sinistra, che è l'unica lettura possibile di una sequenza piatta; se sono
 * in numero dispari il testo resta com'è e sarà `jme.compile` a dire che non
 * si capisce — meglio del silenzio di un accoppiamento inventato. */
function sciogliBarre(testo: string): string {
  const pezzi = testo.split("|");
  if (pezzi.length % 2 === 0) return testo;
  let fuori = pezzi[0] as string;
  for (let i = 1; i < pezzi.length; i += 2) {
    fuori += `abs(${pezzi[i]})${pezzi[i + 1]}`;
  }
  return fuori;
}

/** Il nome della prima chiamata a qualcosa che non è una funzione del
 * motore, `null` se non ce ne sono.
 *
 * È il complemento esatto dello strato 3, non la sua copia: `findvars`
 * riporta un nome in posizione di funzione **se e solo se** non è una
 * funzione del motore (`evaluate.ts:751`), ma poi lo mescola ai nomi in
 * posizione di valore, dove il confronto con `nomiNoti` lo assolve. Ed è
 * proprio il nome DICHIARATO il caso frequente: il docente scrive `a(x+1)`
 * intendendo `a·(x+1)`, MathLive emette esattamente `a(x+1)`, e il motore
 * poi lancia («La funzione a non è definita: a è una variabile e intendevi
 * a*(...)?»). Una chiamata a un nome che non è funzione del motore non è
 * mai ciò che il docente ha disegnato, `nomiNoti` o no. */
function chiamataSconosciuta(albero: jme.Tree | null | undefined): string | null {
  if (!albero) return null;
  if (albero.tok.type === "function") {
    const nome = jme.normaliseName(albero.tok.name, jme.builtinScope);
    if (jme.builtinScope.getFunction(nome).length === 0) return nome;
  }
  for (const ramo of albero.args ?? []) {
    const trovata = chiamataSconosciuta(ramo);
    if (trovata !== null) return trovata;
  }
  return null;
}

/** ASCIIMath (ciò che MathLive restituisce con `getValue("ascii-math")`)
 * verso JME. `nomiNoti` sono le variabili dichiarate nell'esercizio: senza
 * di esse il controllo finale non può distinguere una variabile vera da un
 * nome inventato dalla giustapposizione.
 *
 * **`jme.compile` non è un cancello sufficiente**, ed è il motivo per cui
 * questa funzione ha tre strati e non uno:
 *
 * 1. **Il rifiuto testuale di `+-` e `-+`, prima di tutto.** Non si sceglie
 *    una delle due soluzioni e non si prova a produrne una lista: si
 *    rifiuta e si dice perché. È l'unico strato che prende la formula
 *    quadratica — misurato: `findvars` ne dice `["a","b","c"]`, tutti nomi
 *    noti, quindi lo strato 3 la lascerebbe passare. Chi un giorno togliesse
 *    questo strato «tanto c'è il controllo dei nomi» rimetterebbe in
 *    circolazione il caso peggiore.
 * 2. **La tabella degli aggiustamenti**, corta e chiusa, misurata su ciò
 *    che MathLive produce davvero (non su ciò che l'ASCIIMath può in teoria
 *    contenere): `root(n)(x)`, `-:`, `|…|`. In particolare NON servono `xx`
 *    né `**`: MathLive emette già `*` sia per `\times` sia per `\cdot`.
 *    Aggiungere righe «per sicurezza» è come si finisce a mantenere un
 *    parser LaTeX.
 * 3. **I nomi liberi**, ed è lo strato che rende sicuro il resto, in due
 *    controlli che guardano due posizioni diverse. Prima le **chiamate**:
 *    un nome seguito da parentesi che non sia una funzione del motore è
 *    rifiutato sempre, anche se dichiarato (vedi `chiamataSconosciuta`).
 *    Poi i nomi in **posizione di valore**: devono essere fra `nomiNoti`,
 *    salvo l'unica incognita che `incognitaAmmessa` concede sulla
 *    superficie della risposta attesa. `sin x` compila e vale `sin × x` —
 *    una moltiplicazione per una variabile di nome `sin` — e qui viene
 *    rifiutato nominando `sin` da questo secondo controllo.
 *
 * Le costanti del motore (`e`, `pi`, `i`, …) non vanno ripassate per un
 * secondo filtro costruito su `allConstants()`, e la decisione è confermata
 * (Ruling 19). Le toglie già `findvars`, a cui si passa `builtinScope`
 * (`scope.getConstant`, misurato: `findvars(compile("2*pi*r"))` dà `["r"]`,
 * `findvars(compile("pi"))` dà `[]`). Quel filtro sarebbe dunque codice
 * morto sui nomi in posizione di valore — e prima che esistesse
 * `chiamataSconosciuta` era peggio che morto: toglieva anche il `pi` di
 * `pi(x+1)`, cioè apriva un buco nello strato che esiste per chiuderli.
 * L'elenco delle costanti resta quello del motore, preso da `builtinScope`:
 * qui non ce n'è nessuno scritto a mano.
 *
 * Il `dettaglio` è il DATO che la frase mostrata al docente deve nominare —
 * il segno ambiguo, il nome sconosciuto, il messaggio del motore — non la
 * frase: quella si compone con next-intl, dove il docente la legge.
 *
 * ### La via che NON si prende, e quanto costa
 *
 * MathLive sa anche restituire MathJSON, un albero in cui `\sin x` è
 * `["Sin","x"]` e `\pm` è un nodo esplicito che si può rifiutare invece che
 * perdere: un traduttore albero → JME sarebbe **strutturalmente** immune
 * alla giustapposizione, invece che immune per via di un controllo. Non si
 * prende perché MathLive non include il motore di calcolo — lo cerca su un
 * simbolo globale e senza di esso `getValue("math-json")` restituisce
 * `["Error", "compute-engine-not-available"]` — e servirebbero ~2 MB in più
 * di `@cortex-js/compute-engine` per un comodo da scrivania di un solo
 * ruolo. Se un giorno i rifiuti dello strato 3 dessero fastidio davvero, è
 * questa la porta da riaprire. */
export function versoJme(
  asciiMath: string,
  nomiNoti: string[],
  { incognitaAmmessa = false }: OpzioniConversione = {},
): EsitoConversione {
  const ambiguo = SEGNI_AMBIGUI.find((segno) => asciiMath.includes(segno));
  if (ambiguo) return { ok: false, motivo: "ambiguo", dettaglio: ambiguo };

  const testo = sciogliBarre(sciogliRadici(asciiMath).split("-:").join("/")).trim();

  let albero;
  try {
    albero = jme.compile(testo);
  } catch (e) {
    // Locale fissato a "it", come in `eco-jme.tsx` e `verifica.ts`: è il
    // messaggio del motore, non una stringa dell'interfaccia.
    return { ok: false, motivo: "non_compila", dettaglio: errorMessageIn(e, "it") };
  }

  // Le chiamate per prime: dopo questo controllo ogni nome che `findvars`
  // restituisce è in posizione di VALORE, e il conteggio qui sotto conta
  // quello che dice di contare.
  const chiamata = chiamataSconosciuta(albero);
  if (chiamata !== null) return { ok: false, motivo: "nome_come_funzione", dettaglio: chiamata };

  // `findvars` restituisce i nomi normalizzati (minuscoli, se lo scope non
  // è sensibile alle maiuscole): i nomi dichiarati vanno normalizzati con
  // la stessa regola, o una variabile `Vmax` risulterebbe sconosciuta al
  // docente che l'ha appena scritta nel pannello.
  const noti = new Set(nomiNoti.map((nome) => jme.normaliseName(nome, jme.builtinScope)));
  const liberi = jme.findvars(albero, [], jme.builtinScope).filter((nome) => !noti.has(nome));
  if (liberi.length > (incognitaAmmessa ? 1 : 0)) {
    return { ok: false, motivo: "nome_sconosciuto", dettaglio: liberi[0] as string };
  }

  return { ok: true, jme: testo };
}
