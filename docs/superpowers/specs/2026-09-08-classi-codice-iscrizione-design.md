# Iscrizione a una classe con un codice

**Data:** 2026-09-08
**Stato:** approvato
**Nasce da:** una domanda del committente — «i docenti possono provare gli
esercizi, caricare gli studenti?» — e dalla scoperta che ne è seguita.

## Il problema

Oggi una classe esiste **solo perché uno studente di quella classe ha già
fatto accesso con Google almeno una volta**. L'unico codice che crea una
`Classe` è `allineaClassi`, che gira al momento dell'accesso e legge i gruppi
`allievi.*` dello studente. L'elenco fra cui il docente sceglie le classi che
insegna (`classiDisponibili`) legge le classi esistenti.

Quindi il primo giorno di scuola il docente entra e non vede niente. Non può
dichiarare cosa insegna, non può preparare un compito, finché i suoi ragazzi
non hanno fatto accesso. Non è un difetto: è il progetto «classi dai gruppi
Google soltanto» che funziona come specificato. Ma è il momento in cui il
prodotto sembra rotto proprio a chi lo apre per la prima volta.

## La scelta

Il docente **crea la classe** e ottiene un **codice**. Lo detta in aula o lo
scrive alla lavagna; lo studente lo inserisce una volta e risulta iscritto.

I due modi **convivono**. Dove i gruppi Google funzionano — a Paolo Sarpi
funzionano — restano la fonte, e non c'è ragione di buttarli: sono
automatici e non si sbagliano. Il codice serve al primo giorno, alle classi
che i gruppi non coprono, e a chi non ha un dominio Workspace.

## La trappola, che decide il progetto

`allineaClassi` è una **sostituzione integrale**: a ogni accesso cancella le
iscrizioni dello studente che non trova fra i suoi gruppi.

Uno studente iscritto con il codice risulterebbe iscritto — fino al suo
accesso successivo, quando la sincronizzazione gli toglierebbe quella classe
perché non corrisponde a nessun gruppo. Nessun errore, nessun avviso: sparisce
e basta, e il docente vedrebbe la classe svuotarsi da sola.

Quindi **ogni iscrizione porta la sua provenienza**, e la sincronizzazione da
Google gestisce soltanto le iscrizioni che ha creato lei. Un'iscrizione da
codice la tocca solo il docente, o lo studente stesso.

Questa è la regola da cui dipende tutto il resto, ed è l'unica cosa in questa
specifica che, se sbagliata, distrugge dati in silenzio.

## I doppioni

Se il docente crea «2A» e più tardi compare il gruppo `allievi.2a@`, si
otterrebbero due classi con lo stesso nome e gli studenti divisi fra le due:
metà iscritti col codice, metà dal gruppo, e due elenchi di consegne per
quello che è lo stesso gruppo di ragazzi.

**Quando la sincronizzazione trova un gruppo il cui nome coincide con una
classe creata a mano e ancora senza gruppo, la adotta** — le scrive dentro
l'indirizzo del gruppo invece di crearne una nuova. Da quel momento la classe
è alimentata da entrambe le vie.

L'adozione riempie soltanto un campo mancante: non sposta studenti, non
cancella iscrizioni, non tocca classi già legate a un gruppo. È
volutamente l'operazione più timida che risolve il problema. Il confronto è
sul nome esatto, ed è difendibile perché un'installazione serve una scuola
sola: due classi che si chiamano «2A» nella stessa scuola sono la stessa
classe.

## Il codice

Corto e **leggibile ad alta voce**, perché verrà dettato in classe: sei
caratteri da un alfabeto senza ambiguità — niente `O` contro `0`, niente `I`
contro `1`, niente `S` contro `5`. Maiuscolo, ma accettato in qualunque
cassa quando lo studente lo digita.

**Rigenerabile.** Se il codice gira dove non deve, il docente ne fa un altro:
quello vecchio smette di funzionare e **gli iscritti restano**. È la
differenza fra chiudere una porta e sfrattare la classe.

Non scade da solo. Una scadenza automatica sembra prudente e in pratica
tradisce: il ragazzo assente il giorno della dettatura trova il codice morto
e nessuno che sappia perché.

## Cosa NON copre

- **Rimuovere uno studente da una classe.** Serve, ma è un'altra cosa: tocca
  cosa succede ai suoi tentativi e alle sue consegne, e merita la propria
  decisione. Oggi lo si può ancora fare solo cambiando i gruppi Google.
- **Un codice per il docente.** I docenti si dichiarano già da sé le classi
  che insegnano, ed è la governance scelta nel sotto-progetto 4.
- **Limiti di frequenza per indovinare un codice.** Le rotte hanno già il
  tetto per utente del sotto-progetto 4; sei caratteri su un alfabeto di 32
  sono un miliardo di combinazioni, e chi indovina entra in una classe di una
  scuola in cui ha già un accesso valido. Il rischio è basso e il rimedio
  esiste: si rigenera.

## Le pagine

| Chi | Dove | Cosa |
|---|---|---|
| Docente | `/dashboard/esercizi/classi` | crea una classe, vede il codice, lo rigenera, vede chi si è iscritto e come |
| Studente | la sua area | inserisce un codice |

Il docente deve vedere **da dove** viene ogni iscritto — gruppo o codice —
perché è ciò che gli spiega perché un ragazzo c'è o non c'è.

## Rischi accettati

- **Un codice detto ad alta voce esce dall'aula.** Chi lo usa entra in una
  classe, vede i compiti assegnati e può svolgerli; non vede le consegne
  altrui, che restano al docente. Il rimedio è la rigenerazione, ed è per
  questo che gli iscritti non si perdono quando si rigenera.
- **L'adozione per nome può unire due classi che il docente voleva distinte**
  se le ha chiamate allo stesso modo. In una scuola sola è più probabile che
  sia la stessa classe; e unire è recuperabile, mentre lasciarle divise
  produce due elenchi di consegne che nessuno riconcilia.
