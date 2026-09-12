# Registri di lavoro

Qui sta il *perché* di lavori già finiti, quando la ragione non si legge
dal codice: le decisioni prese durante l'esecuzione di un piano, con la
misura che le ha motivate e il costo che avrebbero avuto se sbagliate.

La specifica di un lavoro dice **cosa** si vuole
(`docs/superpowers/specs/`), il piano dice **come**
(`docs/superpowers/plans/`), il registro dice **cosa si è scoperto
strada facendo** — comprese le volte in cui il piano aveva torto.

Non sono documenti da tenere aggiornati: sono fotografie. Se il codice
cambia, il registro resta la ragione per cui a un certo punto era così.

## 2026-09-10 — l'editor leggibile e le formule visuali

- `2026-09-10-editor-leggibile-registro.md` — il registro dei sette
  task, con i **ventidue Ruling** presi durante l'esecuzione.
- `2026-09-10-editor-leggibile-revisione-finale.md` — la revisione
  dell'intero ramo, che ha guardato *fra* i task invece che dentro.

Le tre cose che valgono oltre quel lavoro, se non hai tempo di leggere
il resto:

1. **In JME `sin x` si compila come una moltiplicazione** fra una
   variabile chiamata `sin` e la `x`. L'esercizio si salva, supera la
   verifica a venti semi, e sbaglia in silenzio davanti alla classe. È
   la ragione d'essere dell'eco del motore sotto i campi.
2. **`jme.compile` non è un cancello sufficiente** per una formula
   convertita da un editor visuale: la quadratica
   `(-b+-sqrt(b^2-4a c))/(2a)` compila e vale **la sola radice col
   meno**. Serve il rifiuto testuale di `+-`/`-+` *e* dei caratteri
   Unicode `±`/`∓`, che MathLive emette per `\pm`/`\mp`. Il controllo
   dei nomi liberi da solo non la prende: `a`, `b`, `c` sono tutti
   dichiarati.
3. **`findvars(albero, [], builtinScope)` toglie già le costanti** in
   posizione di valore (`pi*x` → `["x"]`) e le tiene solo in posizione
   di funzione (`pi(x+1)` → `["x","pi"]`). Un filtro `allConstants()`
   sopra non sarebbe ridondante: aprirebbe un buco. Il piano lo
   prescriveva, e il piano sbagliava.
