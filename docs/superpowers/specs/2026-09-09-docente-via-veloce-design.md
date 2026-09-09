# La parte del docente: una via veloce, e le raccolte come opzione

**Data:** 2026-09-09
**Stato:** approvato
**Nasce da:** «la parte del docente, editor e gestione, è molto confusa».

## Cosa non va

Il docente vede cinque riquadri di pari peso — *Le tue classi*, *Contenitori*,
*Batterie*, *Compiti*, *Redazione* — ma quelle cinque cose non sono
alternative fra cui scegliere: sono una **sequenza obbligata**. Dichiarare le
classi, scrivere o raccogliere esercizi, metterli in un contenitore, comporre
una batteria, e solo allora assegnare. Niente sulla pagina lo dice. Chi
clicca «Compiti» — che è quello che vuole fare — scopre di non poter fare
niente e non capisce perché.

E tre nomi su cinque sono il nostro vocabolario, non il suo. Un insegnante
non pensa «compongo una batteria pescando dai contenitori»: pensa «dieci
equazioni alla 2A entro venerdì».

Sotto c'è un problema più profondo. Ogni esercizio **sa già** a che anno
appartiene, di che argomento è, con quali etichette e a che difficoltà — c'è
persino un indice sul database per anno e argomento. Un contenitore è un
sacchetto riempito a mano. Stiamo chiedendo al docente di **ricostruire a
mano un raggruppamento che i dati esprimono già**, e di farlo prima di poter
assegnare qualunque cosa.

## La scelta

**Assegnare diventa un percorso solo, e diretto**: classe, argomento, quanti
esercizi, entro quando. Gli esercizi si pescano dai metadati che esistono
già.

Le raccolte a mano **restano**, come seconda via per chi vuole scegliere gli
esercizi uno per uno. Diventano un'opzione, non un pedaggio.

Questo non annulla la decisione presa quando il programma è nato — i
contenitori riempiti a mano danno controllo esatto, ed è una cosa che serve.
Le toglie il carattere di obbligo.

## Le parole

Cambiano perché sono la metà del problema.

| Prima | Adesso | Perché |
|---|---|---|
| Redazione | **I miei esercizi** | è dove il docente scrive e trova i propri esercizi |
| Contenitori | **Raccolte** | un docente raccoglie esercizi; non li «contiene» |
| Batterie | *(sparisce)* | era il nostro modo di dire «quanti pescarne»: adesso è un campo del modulo |
| Compiti | **Compiti assegnati** | dice che è lo storico, non il posto dove se ne dà uno |
| Le tue classi | **Le tue classi** | già nel linguaggio giusto |

«Batteria» sparisce dalla vista, non dal modello: continua a esistere come
provenienza di ciò che è stato assegnato, generata dal sistema. Il docente
non deve più nominarla né saperla comporre.

## Come si assegna

Una sola schermata, con l'azione principale in cima alla pagina degli
esercizi:

- **classe** (fra quelle che il docente ha dichiarato)
- **argomento** (fra quelli che gli esercizi dichiarano davvero — non un
  campo libero, così non si può chiedere un argomento che non esiste)
- **quanti esercizi**
- **entro quando** (facoltativo)
- **difficoltà** (facoltativa: qualsiasi, oppure fino a un livello)
- **anno**: preso dalla classe, non chiesto — la 2A vuole esercizi del
  secondo anno, e chiederlo sarebbe chiedere una cosa che sappiamo

Sotto, **quanti esercizi corrispondono** ai filtri, aggiornato mentre si
sceglie. È l'informazione che evita l'unico errore frequente: chiedere dieci
esercizi dove ce ne sono quattro.

E un'anteprima: si vede cosa riceveranno gli studenti prima di darlo.

## Il modello, e perché non si aggira

Oggi un `Compito` **richiede** una `Batteria`, e ogni `BatteriaRegola`
**richiede** un `Contenitore`. Un'assegnazione diretta per argomento non ha
dove stare.

La via sbagliata sarebbe creare un contenitore nascosto per ogni
assegnazione: inquinerebbe proprio l'elenco delle raccolte che stiamo
rendendo visibile, e trasformerebbe una decisione di prodotto in spazzatura
nel database.

La via giusta è **rendere la regola capace di due forme**: «pesca N da questa
raccolta» oppure «pesca N fra gli esercizi con questo argomento (e anno, e
difficoltà)». Una regola ha l'una o l'altra, mai entrambe, mai nessuna.

Così la pesca, il controllo di capienza, il congelamento in `drawnVersionIds`
e l'esclusione fra regole restano **una sola strada** — quella già rivista a
fondo, che ha già pagato due difetti gravi trovati in revisione. Un secondo
percorso di pesca sarebbe un secondo posto dove sbagliare.

Le batterie generate dal sistema si marcano come tali e non compaiono in
nessun elenco: sono provenienza, non contenuto.

## Cosa NON cambia

- Il congelamento: quello che viene pescato resta pescato. Un esercizio
  aggiunto dopo non entra in un compito già dato.
- La verifica a venti semi, l'editor, l'anteprima, tutto ciò che sta sotto.
- Le raccolte e il loro riempimento a mano, che restano com'erano.

## Cosa NON copre

- **Modificare un compito già assegnato.** Riassegnare significa darne un
  altro. Toccare quello dato mentre trenta studenti ci lavorano è la cosa che
  la specifica dell'editor ha già deciso di non fare.
- **Salvare i filtri come raccolta.** Sarebbe comodo — «tutte le equazioni di
  seconda» come raccolta viva — ma una raccolta che cambia sotto i piedi
  romperebbe l'idea che una raccolta è un elenco che il docente controlla. Se
  servirà, sarà una terza cosa con un nome suo.

## Rischi accettati

- **Un argomento scritto in due modi** («equazioni» ed «Equazioni») diventa
  due voci nel menu. I metadati degli esercizi non sono normalizzati. Si
  normalizza in lettura per il menu; normalizzarli sul serio è un altro
  lavoro, e il codice classe di ieri ha già mostrato quanto costa scoprirlo
  tardi.
- **Il conteggio dei corrispondenti è una fotografia.** Fra il momento in cui
  il docente lo legge e quello in cui assegna, un altro docente può togliere
  un esercizio. Il rifiuto per capienza insufficiente resta, con il suo
  dettaglio: il conteggio riduce la sorpresa, non la elimina.
