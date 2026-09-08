/* Derived from Numbas (https://github.com/numbas/Numbas), Copyright 2011-2026 Newcastle University.
 * Licensed under the Apache License, Version 2.0. Ported to TypeScript for SAVINT; see packages/engine/NOTICE. */

// Messaggi italiani per le chiavi di errore lanciate da `math/`, `jme/`,
// `parts/`, `marking/` e `question/`. Le chiavi sono quelle upstream
// (`new Numbas.Error('<chiave>', ...)`, inventario §7.10: 36 chiavi in jme.js,
// più le 29 di math.js/util.js) più `util.equality not defined for type` (util.js:178) e
// `jme.subvars.display not available`, che è nostra (decisione 1 del brief:
// i rami di `subvars` che servono `treeToJME`/`texify` passano da
// `displayHooks`, riempiti dal Task 5).
// I testi sono scritti da noi, non tradotti dai file upstream; i segnaposto
// sono nella forma `{nome}` (vedi `t()` in i18n/index.ts).

export const it: Record<string, string> = {
  // math.js, util.js — le 31 chiavi degli errori lanciati da `math/` (49 siti).
  // upstream sono `new Numbas.Error(chiave)` come tutte le altre; nel port
  // erano `new Error(chiave)`, cioè la chiave grezza come messaggio, che
  // arrivava fino al feedback dello studente. Le due marcate "nostra" hanno la
  // chiave upstream ma nessun testo nei cataloghi upstream.
  "math.choose.empty selection": "Selezione vuota passata a una funzione casuale",
  "math.combinations.complex": "Non si possono calcolare le combinazioni di numeri complessi",
  "math.combinations.k less than zero": "Non posso calcolare le combinazioni: k è più piccolo di zero",
  "math.combinations.n less than k": "Non posso calcolare le combinazioni: n è più piccolo di k",
  "math.combinations.n less than zero": "Non posso calcolare le combinazioni: n è più piccolo di zero",
  "math.gcf.complex": "Non posso calcolare l'MCD di numeri complessi",
  "math.lcm.complex": "Non posso calcolare l'mcm di numeri complessi",
  "math.niceNumber.undefined": "Era atteso un numero, è arrivato <code>undefined</code>",
  "math.order complex numbers": "I numeri complessi non si possono ordinare",
  "math.permutations.complex": "Non si possono calcolare le permutazioni di numeri complessi",
  "math.permutations.k less than zero": "Non posso calcolare le permutazioni: k è più piccolo di zero",
  "math.permutations.n less than k": "Non posso calcolare le permutazioni: n è più piccolo di k",
  "math.permutations.n less than zero": "Non posso calcolare le permutazioni: n è più piccolo di zero",
  "math.precround.complex": "Non posso arrotondare a un numero complesso di cifre decimali",
  "math.random_integer_partition.invalid k": "La dimensione della partizione deve essere fra 1 e {n}.",
  "math.rangeToList.zero step size": "Non si può convertire in lista un intervallo con passo zero.",
  "math.real interval.invalid string": "La stringa <code>{str}</code> non è una definizione di intervallo valida.",
  "math.shuffle_together.lists not all the same length": "Le liste non hanno tutte la stessa lunghezza.",
  "math.siground.complex": "Non posso arrotondare a un numero complesso di cifre significative",
  "math.toNearest.complex": "Non posso arrotondare al multiplo di un numero complesso", // nostra
  "matrixmath.abs.non-square": "Non posso calcolare il determinante di una matrice non quadrata.",
  "matrixmath.abs.too big":
    "Mi dispiace, non so ancora calcolare il determinante di una matrice più grande di 3x3.",
  "matrixmath.mul.different sizes": "Non posso moltiplicare matrici di dimensioni diverse.",
  "matrixmath.not invertible": "Questa operazione funziona solo su una matrice invertibile.",
  "matrixmath.not square": "Questa operazione funziona solo su una matrice quadrata.",
  "util.formatNumberNotation.unrecognised syntax":
    "La sintassi di formattazione numerica <code>{syntax}</code> non è riconosciuta.",
  "util.permutations.r bigger than n": "Non si possono prendere più elementi di quanti ne ha la lista.", // nostra
  "util.product.non list": "Passato a <code>product</code> un valore che non è una lista",
  "vectormath.cross.matrix too big":
    "Non posso calcolare il prodotto vettoriale di una matrice che non sia $1 \\times N$ o $N \\times 1$.",
  "vectormath.cross.not 3d": "Il prodotto vettoriale è definito solo per vettori tridimensionali.",
  "vectormath.dot.matrix too big":
    "Non posso calcolare il prodotto scalare di una matrice che non sia $1 \\times N$ o $N \\times 1$.",

  "jme.calculus.unknown derivative": "Non si sa derivare {tree}",
  "jme.compile list.mismatched bracket": "Parentesi non corrispondenti nella lista di espressioni",
  "jme.compile list.missing right bracket": "Manca una parentesi chiusa nella lista di espressioni",
  "jme.display.collectRuleset.no sets": "Per comporre un insieme di regole serve la lista degli insiemi definiti",
  "jme.display.collectRuleset.set not defined": "L'insieme di regole {name} non è definito",
  "jme.display.unknown token type": "Non so rendere un token di tipo {type}",
  "jme.display.wrong number of arguments": "{name} è chiamata con {count} argomenti, un numero che nessuna definizione accetta",
  "jme.display.simplifyTree.stuck in a loop":
    "La semplificazione di {expr} è entrata in un ciclo: le regole si annullano a vicenda",
  "jme.evaluate.no scope given": "Per valutare un'espressione serve uno scope",
  "jme.func.except.continuous range": "Non si può usare `except` su un intervallo continuo (passo 0)",
  "jme.func.listval.invalid index": "Indice {index} fuori dalla lista, che ha {size} elementi",
  "jme.func.listval.key not in dict": "La chiave {key} non è nel dizionario",
  "jme.func.listval.not a list": "Si può indicizzare solo una lista",
  "jme.func.parse.no notation": "La notazione {notation_name} non esiste",
  "jme.func.satisfy.condition not a boolean": "Le condizioni di `satisfy` devono valere vero o falso",
  "jme.func.satisfy.took too many runs": "`satisfy` non ha trovato valori che soddisfano le condizioni",
  "jme.func.satisfy.wrong number of definitions": "`satisfy` vuole una definizione per ogni nome",
  "jme.func.switch.no default case": "Nessun caso di `switch` è vero e non c'è un caso predefinito",
  "jme.iterate_until.condition produced non-boolean": "La condizione di `iterate_until` ha prodotto {type} invece di un booleano",
  "jme.makeFast.no fast definition of function":
    "La funzione {name} non ha una definizione utilizzabile in forma veloce",
  "jme.map.matrix map returned non number": "Mappando su una matrice si devono produrre numeri",
  "jme.map.vector map returned non number": "Mappando su un vettore si devono produrre numeri",
  "jme.matchTree.group name not a name":
    "Il nome di un gruppo catturato deve essere un nome o una coppia chiave-valore",
  "jme.matchTree.match macro first argument not a dictionary":
    "Il primo argomento di `@ deve essere un dizionario di sotto-pattern",
  "jme.matrix.reports bad size": "La matrice dichiara una dimensione diversa da quella reale",
  "jme.matrix.value not the right type": "Valore di tipo sbagliato nella costruzione di una matrice",
  "jme.parse signature.invalid signature string": "Firma di funzione non valida: {str}",
  "jme.script.error parsing notes": "Errore nell'analisi delle note: {message}",
  "jme.script.note.compilation error": "Errore di compilazione nella nota {name}: {message}",
  "jme.script.note.empty expression": "La nota {name} non ha un'espressione",
  "jme.script.note.invalid definition": 'Definizione di nota non valida: "{source}".{hint}',
  "jme.script.note.invalid definition.description missing closing bracket":
    " Manca la parentesi chiusa della descrizione.",
  "jme.script.note.invalid definition.missing colon":
    " Manca il segno dei due punti che separa nome ed espressione.",
  "jme.shunt.expected argument before comma": "Manca un argomento prima della virgola",
  "jme.shunt.keypair in wrong place": "Coppia chiave-valore fuori posto: serve un dizionario o un pattern",
  "jme.shunt.list mixed argument types":
    "Non si possono mescolare elementi di lista ({mode}) e di dizionario ({argmode})",
  "jme.shunt.missing operator": "Manca un operatore: l'espressione non può essere valutata",
  "jme.shunt.no left bracket": "Manca la parentesi aperta",
  "jme.shunt.no left bracket in function": "Manca la parentesi aperta nell'applicazione di funzione",
  "jme.shunt.no right bracket": "Manca la parentesi chiusa",
  "jme.shunt.no right square bracket": "Manca la parentesi quadra chiusa che termina la lista",
  "jme.shunt.not enough arguments": "Argomenti insufficienti per l'operazione {op}",
  "jme.shunt.pipe right hand takes no arguments":
    "A destra dell'operatore pipe serve l'applicazione di una funzione",
  "jme.substituteTree.undefined variable": "Variabile non definita: {name}",
  "jme.subvars.error compiling": "{message} nell'espressione {expression}",
  "jme.subvars.null substitution": "Sostituzione vuota in {str}",
  "jme.subvars.display not available":
    "La sostituzione in {op} richiede il modulo di visualizzazione, non ancora caricato",
  "jme.texsubvars.missing parameter": "Manca il parametro in {op}: {parameter}",
  "jme.texsubvars.no right brace": "Manca la graffa chiusa in {op}",
  "jme.texsubvars.no right bracket": "Manca la quadra chiusa negli argomenti di {op}",
  "jme.thtml.not html": "Valore non HTML passato al costruttore del tipo html",
  "jme.tokenise.invalid near": "Espressione non valida: {expression}, alla posizione {position} vicino a {nearby}",
  "jme.tokenise.keypair key not a string": "La chiave di un dizionario deve essere una stringa, non {type}",
  "jme.tokenise.number.object not complex": "Oggetto non complesso passato al costruttore di un numero",
  "jme.type.no cast method": "Conversione automatica non disponibile da {from} a {to}",
  "jme.type.type already registered": "Il tipo di dato {type} è già registrato",
  "jme.typecheck.for in name wrong type": "Il nome legato da `of:` deve essere un nome o una lista di nomi, non {type}",
  "jme.typecheck.function maybe implicit multiplication":
    "La funzione {name} non è definita: forse intendevi {first}*{possibleOp}(...)?",
  "jme.typecheck.function not defined":
    "La funzione {op} non è definita: {op} è una variabile e intendevi {suggestion}*(...)?",
  "jme.typecheck.map not on enumerable": "Non si può mappare su un valore di tipo {type}",
  "jme.typecheck.no right type definition": "Nessuna definizione di {op} adatta a questi tipi di argomento",
  "jme.typecheck.no right type unbound name": "La variabile {name} non è definita",
  "jme.typecheck.op not defined": "L'operazione {op} non è definita",
  "jme.typecheck.wrong arguments for anonymous function":
    "Numero di argomenti sbagliato per questa funzione anonima",
  "jme.typecheck.wrong names for anonymous function":
    "Nomi di argomento non validi per una funzione anonima: {names_type}",
  "jme.user javascript.error": "Errore nella funzione JavaScript {name}: {message}",
  "jme.user javascript.returned undefined": "La funzione JavaScript {name} non ha restituito un valore",
  "jme.variables.async function not supported": "La funzione {name} è asincrona: non è supportata",
  "jme.variables.circular reference": "Riferimento circolare nel calcolo di {name}",
  "jme.variables.empty definition": "La variabile {name} non ha una definizione",
  "jme.variables.empty name": "Il nome di una variabile non può essere vuoto",
  "jme.variables.error computing dependency": "Errore nel calcolo della dipendenza {name}: {message}",
  "jme.variables.error evaluating variable": "Errore nel valutare la variabile {name}: {message}",
  "jme.variables.error making function": "Errore nel creare la funzione {name}: {message}",
  "jme.variables.invalid function language": "Linguaggio di funzione non valido: {language}",
  "jme.variables.javascript function not allowed": "Le funzioni JavaScript non sono permesse qui ({name})",
  "jme.variables.syntax error in function definition": "Errore di sintassi nella definizione della funzione",
  "jme.variables.variable not defined": "La variabile {name} non è definita",
  "jme.vector.value not an array of numbers": "Un vettore va costruito da un array di numeri",
  // marking.js — le chiavi degli errori del motore di correzione. Le due
  // marcate "nostra" sostituiscono un `TypeError` upstream.
  "marking.apply.not a list": "Il primo argomento di `apply` deve essere una lista",
  "marking.no question in scope": "Non c'è nessuna domanda in cui cercare la parte {path}", // nostra
  "marking.note.error evaluating note": "Errore nel calcolo della nota {name}: {message}",
  "marking.state function outside marking script":
    "La funzione {name} si può usare solo dentro uno script di correzione", // nostra
  // I messaggi mostrati allo studente: quelli chiamati con `R()` da marking.js
  // e quelli chiamati con `translate(...)` dai 5 script `.jme` in ambito
  // (inventario 05 §6.4 e §6.5).
  "part.gapfill.error marking gap": "Errore nella correzione di {name}: {message}",
  "part.gapfill.feedback header": "<strong>{name}</strong>",
  "part.jme.answer invalid": "La tua risposta non è un'espressione matematica valida.<br/>{message}.",
  "part.jme.error checking numerically":
    "C'è stato un errore nella verifica numerica della tua risposta: {message}",
  "part.jme.marking.correct": "La tua risposta è numericamente corretta.",
  "part.jme.must-have bits": '<span class="monospace">{string}</span>',
  "part.jme.must-have one": "La tua risposta deve contenere: {strings}",
  "part.jme.must-have several": "La tua risposta deve contenere tutti questi elementi: {strings}",
  "part.jme.must-match.failed": "La tua risposta non è scritta nella forma richiesta.",
  "part.jme.must-match.warning": "La tua risposta non è scritta nella forma richiesta: {message}",
  "part.jme.not-allowed bits": '<span class="monospace">{string}</span>',
  "part.jme.not-allowed one": "La tua risposta non deve contenere: {strings}",
  "part.jme.not-allowed several": "La tua risposta non deve contenere nessuno di questi elementi: {strings}",
  "part.jme.unexpected variable name":
    "La tua risposta è stata interpretata usando il nome di variabile inatteso <code>{name}</code>.",
  "part.marking.correct": "La tua risposta è corretta.",
  "part.marking.incorrect": "La tua risposta non è corretta.",
  "part.marking.nothing entered": "Non hai inserito una risposta.",
  "part.marking.partially correct": "La tua risposta è parzialmente corretta.",
  "part.mcq.correct choice": "Hai scelto una risposta corretta.",
  "part.mcq.incorrect choice": "Hai scelto una risposta errata.",
  "part.mcq.wrong number of choices": "Hai scelto il numero sbagliato di opzioni.",
  "part.numberentry.answer invalid": "Non hai inserito un numero valido.",
  "part.numberentry.answer not reduced": "La tua risposta non è ridotta ai minimi termini.",
  "part.patternmatch.correct except case":
    "La tua risposta è corretta, a meno di maiuscole e minuscole.",
  "question.can not submit": "Non è possibile inviare la risposta: controlla se ci sono errori.",
  "ruleset.circular reference": "Riferimento circolare nell'insieme di regole {name}",
  "ruleset.set not defined": "L'insieme di regole {name} non è definito",
  "util.equality not defined for type": "Uguaglianza non definita per il tipo {type}",
  // part.js e parts/*.js — le chiavi usate dal modulo `parts/` (inventario 05
  // §6.4). Le chiavi "letterali" (`You have not given your answer...`,
  // `minimum value`, `maximum value`) sono l'idioma Numbas: la chiave È il
  // testo inglese, e `R()` ripiega su di essa quando non è nel dizionario.
  "alternative": "alternativa",
  "gap": "spazio",
  "part": "parte",
  "step": "passaggio",
  "minimum value": "valore minimo",
  "maximum value": "valore massimo",
  "You have not given your answer to the correct precision.":
    "Non hai dato la risposta con la precisione richiesta.",
  "feedback.you were awarded": "Hai ottenuto <strong>{count}</strong> punto.",
  "feedback.you were awarded_plural": "Hai ottenuto <strong>{count}</strong> punti.",
  "feedback.taken away": "Ti è stato tolto <strong>{count}</strong> punto.",
  "feedback.taken away_plural": "Ti sono stati tolti <strong>{count}</strong> punti.",
  "part.error": "{path}: {message}",
  "part.missing type attribute": "{part}: manca il tipo della parte",
  "part.unknown type": "{part}: tipo di parte sconosciuto {type}",
  "part.setting not present": "L'impostazione '{property}' non è definita",
  "part.marking.did not answer": "Non hai risposto a questa domanda.",
  "part.marking.error in adaptive marking":
    "C'è stato un errore nella correzione adattiva di questa parte. Segnalalo. {message}",
  "part.marking.error in marking script":
    "C'è stato un errore nell'algoritmo di correzione di questa parte. Segnalalo. {message}",
  "part.marking.maximum scaled down":
    "Il massimo che puoi ottenere per questa parte è <strong>{count}</strong> punto. I punteggi saranno riscalati.",
  "part.marking.maximum scaled down_plural":
    "Il massimo che puoi ottenere per questa parte è <strong>{count}</strong> punti. I punteggi saranno riscalati.",
  "part.marking.maximum score applied": "Il punteggio massimo per questa parte è <strong>{score}</strong>.",
  "part.marking.minimum score applied": "Il punteggio minimo per questa parte è <strong>{score}</strong>.",
  "part.marking.missing required note": "L'algoritmo di correzione non definisce la nota <code>{note}</code>",
  "part.marking.no result after replacement":
    "Non è stato possibile correggere questa parte con le tue risposte alle parti precedenti.",
  "part.marking.not submitted": "Nessuna risposta inviata.",
  "part.marking.parameter already in scope":
    "C'è una variabile di nome <code>{name}</code>, che è anche il nome di un parametro di correzione. Rinomina la variabile.",
  "part.marking.resubmit because of variable replacement":
    "La correzione di questa parte dipende dalle tue risposte ad altre parti, che hai cambiato. Invia di nuovo la risposta per aggiornare il punteggio.",
  "part.marking.uncaught error": "Errore durante la correzione: {message}",
  "part.marking.used variable replacements":
    "Questa parte è stata corretta usando le tue risposte alle parti precedenti.",
  "part.marking.variable replacement part not answered": "Devi prima rispondere a {part}.",
  "part.marking.variable replacement part not found": "Non trovo la parte {part}.",
  "part.marking.adaptive marking use condition not a boolean":
    "La condizione d'uso nella correzione adattiva vale {type} invece di un booleano.",
  "part.marking.adaptive variable replacement does not satisfy condition":
    "La tua risposta a <strong>{name}</strong> non è stata usata perché non soddisfa la condizione.",
  "part.marking.adaptive variable replacement does not satisfy condition message":
    "La tua risposta a <strong>{name}</strong> non è stata usata: {message}",
  "part.marking.adaptive variable replacement refers to self":
    "Questa parte si riferisce a sé stessa in una sostituzione di variabile per la correzione adattiva.",
  "part.marking.adaptive variable replacement refers to nothing":
    "Questa parte contiene una sostituzione di variabile non valida per la correzione adattiva.",
  "part.gapfill.cyclic adaptive marking":
    "C'è un ciclo nella correzione adattiva di questa parte: <strong>{name1}</strong> dipende da <strong>{name2}</strong>, che a sua volta dipende da <strong>{name1}</strong>.",
  "part.jme.answer missing": "Manca la risposta corretta",
  "part.jme.invalid value generator expression":
    "Espressione non valida per il generatore di valori della variabile <code>{name}</code>: {message}",
  "part.mcq.invalid layout": "La disposizione delle celle di questa parte non è valida (tipo: {layoutType}).",
  "part.mcq.matrix cell empty": "La cella ({row},{column}) della matrice dei punteggi di {part} è vuota",
  "part.mcq.matrix jme error": "La cella ({row},{column}) della matrice dei punteggi di {part} dà un errore JME: {error}",
  "part.mcq.matrix not a list": "La matrice dei punteggi, definita da un'espressione JME, non è una lista.",
  "part.mcq.matrix not a number": "La cella ({row},{column}) della matrice dei punteggi di {part} non vale un numero",
  "part.mcq.matrix wrong size": "La matrice dei punteggi ha le dimensioni sbagliate.",
  "part.mcq.options def not a list": "L'espressione che definisce {properties} non è una lista.",
  "part.numberentry.display answer wrong type":
    "La risposta mostrata per questa parte è di tipo <code>{got_type}</code>, ma dovrebbe essere <code>{want_type}</code>.",
  "part.numberentry.negative decimal places":
    "Questa parte arrotonderebbe la risposta a un numero negativo di decimali, il che non ha senso.",
  "part.numberentry.zero sig fig":
    "Questa parte arrotonderebbe la risposta a zero cifre significative, il che non ha senso.",
  // question.js — le chiavi del caricamento e del ciclo di vita di una
  // domanda (inventario 06 §5). Le quattro marcate "nostra" non hanno un
  // equivalente upstream: rifiutano funzionalità fuori ambito (decisioni 1-4
  // del brief del Task 9).
  "question.error": "Domanda {number}: {message}",
  "question.error in advice": "Errore nel suggerimento", // nostra, giro di correzioni 1
  "question.error in part prompt": "Errore nella consegna della parte {path}", // nostra, giro di correzioni 1
  "question.error in statement": "Errore nel testo dell'esercizio", // nostra, giro di correzioni 1
  "question.function.async not supported":
    "La funzione {name} è asincrona (type: \"promise\"): il motore è sincrono e non la supporta", // nostra
  "question.no such part": "Non trovo la parte {path}",
  "question.parts mode not supported":
    "La modalità di generazione delle parti \"{mode}\" non è supportata", // nostra
  "question.preamble not supported":
    "Questa domanda ha un preambolo JavaScript: il motore non esegue codice arbitrario", // nostra
  "question.required extension not available":
    "Questa domanda richiede l'estensione <code>{extension}</code>, che non è disponibile",
  "jme.variables.duplicate definition": "La variabile {name} è definita più di una volta",
  "jme.variables.question took too many runs to generate variables":
    "Non è stato generato in tempo un insieme valido di variabili per la domanda",
  "variable.error in variable definition": "Errore nella definizione della variabile {name}",
};
