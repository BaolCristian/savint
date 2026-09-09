# Via veloce per il docente — piano di implementazione

> **Per chi esegue:** SOTTO-ABILITÀ RICHIESTA: usare
> superpowers:subagent-driven-development, un task alla volta.

**Obiettivo:** assegnare esercizi in una schermata sola — classe, argomento,
quanti, entro quando — pescando dai metadati che gli esercizi già portano. Le
raccolte a mano restano come seconda via.

**Specifica:** `docs/superpowers/specs/2026-09-09-docente-via-veloce-design.md`

## Vincoli globali

- **La migrazione gira su un database con dati veri.** Solo allargamenti:
  rendere `BatteriaRegola.contenitoreId` annullabile e aggiungere colonne
  non può fallire su righe esistenti. **Ogni regola esistente ha un
  contenitore**, e deve continuare a comportarsi esattamente come prima.
- **Mai modificare un `.sql` sotto `prisma/migrations/` già applicato** —
  è un registro storico, e cambiarne anche un commento ne rompe l'impronta
  costringendo a una riparazione a mano del database condiviso. È già
  successo tre volte in questo repository. `prisma migrate dev` qui non
  funziona (ambiente non interattivo): la via è `prisma migrate diff
  --script`, cartella scritta a mano, `prisma migrate deploy`.
- Database di sviluppo condiviso col committente. Mai `prisma migrate
  reset`. Mai occupare la porta 3000; Playwright usa la 3100. Fermare un
  server per porta, mai per corrispondenza sulla riga di comando. **Mai
  `npm ci`** né `git stash` (la pila è condivisa fra worktree).
- Ogni stringa visibile da next-intl, in **entrambi** `it.json` e `en.json`.
- Rotte del docente dietro `requireTeacher()`, pagine dietro
  `redirectUnlessTeacher()`, chiave del tetto di frequenza per azione.
- Test guidati dalle prove; pulizia circoscritta per prefisso, mai una
  `deleteMany()` su tabella intera.
- Commit in italiano, ciascuno chiuso da:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611
  ```

---

## Task 1: La regola con due forme

**Files:** `prisma/schema.prisma`, la migrazione, `src/lib/esercizi/batterie.ts`,
test in `src/lib/esercizi/__tests__/batterie.test.ts`

```prisma
model Batteria {
  automatica Boolean @default(false)   // nuovo: generata dall'assegnazione diretta
}

model BatteriaRegola {
  contenitoreId String?   // era String
  argomento     String?   // nuovo
  anno          Int?      // nuovo
  difficoltaMax Int?      // nuovo
}
```

**L'invariante, ed è tutto il task:** una regola ha **il contenitore, oppure
l'argomento — mai entrambi, mai nessuno dei due**. Il database non può
esprimerlo (Prisma non modella i vincoli CHECK), quindi lo impone il dominio
in scrittura *e* lo verifica in lettura.

`candidatiDisponibili` deve risolvere entrambe le forme. **Una regola
malformata non deve restituire "nessun candidato"**: quel silenzio
produrrebbe un compito più corto del promesso, che è esattamente il difetto
critico già pagato una volta in questo programma. Deve fallire, rumorosamente.

I filtri: `argomento` esatto, `anno` esatto se presente, `difficoltaMax` come
soglia superiore inclusiva. E come per le raccolte, si contano solo gli
esercizi che hanno almeno una versione — la lezione del Task 3+4 del
sotto-progetto 4.

- [ ] **Passo 1: i test che falliscono.** I tre che contano: una regola con
      entrambe le forme è rifiutata in scrittura; una regola con nessuna
      delle due FALLISCE invece di dare zero candidati; una regola a filtro
      pesca esattamente gli esercizi che corrispondono, versione compresa.
      Più la regressione: **le batterie esistenti, tutte a contenitore,
      continuano a comportarsi identiche.**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: schema, migrazione, dominio**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: ispezionare il SQL** — solo `ADD COLUMN` e `DROP NOT NULL`,
      nessun `DROP` di tabella o colonna
- [ ] **Passo 6: commit**

---

## Task 2: Il dominio della via veloce

**Files:** `src/lib/esercizi/compiti.ts`, `src/lib/esercizi/batterie.ts`,
test nei rispettivi file

**Interfaces — produce:**

```ts
export function argomentiDisponibili(anno?: number):
  Promise<{ argomento: string; quanti: number }[]>;

export type FiltroDiretto = { anno: number; argomento: string; difficoltaMax?: number };

export function quantiCorrispondono(f: FiltroDiretto): Promise<number>;

export function assegnaDiretto(input: {
  classeId: string; teacherId: string; filtro: FiltroDiretto;
  quanti: number; opensAt?: Date; dueAt?: Date;
}): Promise<EsitoAssegna>;
```

`assegnaDiretto` **non è una seconda strada di pesca**: crea una batteria
marcata `automatica` con una sola regola a filtro, e delega ad `assegna`.
Tutto ciò che è già stato rivisto a fondo — pesca, capienza, congelamento,
esclusione fra regole, rifiuti col dettaglio — resta una strada sola. Un
secondo percorso sarebbe un secondo posto dove sbagliare.

`elencoBatterie` esclude le automatiche: sono provenienza, non contenuto.

`argomentiDisponibili` normalizza in lettura (spazi ai bordi, cassa) perché i
metadati degli esercizi non sono normalizzati e «equazioni» ed «Equazioni»
non devono diventare due voci nel menu.

**Il test che conta:** un'assegnazione diretta e una per raccolta con lo
stesso insieme di esercizi devono produrre lo stesso `drawnVersionIds` a
parità di seme. Se divergono, la strada non è una sola come dichiarato.

- [ ] **Passo 1: i test che falliscono**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: il dominio**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 3: Le rotte

**Files:** `src/app/api/esercizi/compiti/diretto/route.ts`,
`src/app/api/esercizi/argomenti/route.ts` (GET, con il conteggio),
`src/app/api/__tests__/teacher-only-routes.test.ts`, test della rotta

Modello: `src/app/api/esercizi/compiti/route.ts`. Cancello, tetto, scafo,
dominio in fondo, **rifiuti mappati col dettaglio nel corpo** — il dettaglio
della capienza insufficiente (quanti chiesti, quanti disponibili) è l'unica
informazione utile quando un'assegnazione viene rifiutata, e appiattirla è
l'errore che questo tipo di task fa più spesso.

Il conteggio serve mentre il docente sceglie, quindi viene chiamato spesso:
tetto più alto delle azioni di scrittura.

- [ ] **Passo 1: i test che falliscono**, compreso quello sul dettaglio
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: le rotte**
- [ ] **Passo 4: estendere il registro**
- [ ] **Passo 5: eseguirli e vederli passare**
- [ ] **Passo 6: commit**

---

## Task 4: Le parole e la pagina d'ingresso

**Files:** `src/app/(dashboard)/dashboard/esercizi/page.tsx`,
`src/messages/it.json`, `src/messages/en.json`, e ogni pagina toccata dai
nuovi nomi; test della pagina

| Prima | Adesso |
|---|---|
| Redazione | **I miei esercizi** |
| Contenitori | **Raccolte** |
| Batterie | *(via dalla navigazione)* |
| Compiti | **Compiti assegnati** |

La pagina d'ingresso smette di essere cinque riquadri pari. In cima l'azione
principale — assegnare — e sotto, più piccolo, il resto: i miei esercizi, le
mie classi, le raccolte, i compiti assegnati.

**Gli indirizzi delle pagine non cambiano in questo giro.** Rinominare le
cartelle mentre si rinominano le etichette renderebbe illeggibile il diff e
romperebbe i collegamenti già in giro. Le parole sono ciò che il docente
legge; i percorsi li vede solo la barra degli indirizzi.

Attenzione alle chiavi di traduzione: nessuna orfana, nessuna stringa
dimenticata in inglese. Il conteggio delle chiavi nei due file deve
coincidere.

- [ ] **Passo 1: i test che falliscono**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: rinomina e ristruttura**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 5: Il modulo di assegnazione

**Files:** un client sotto `src/app/(dashboard)/dashboard/esercizi/`,
la pagina d'ingresso che lo ospita, i due file dei messaggi; test

Classe, argomento, quanti, entro quando, difficoltà. **L'anno non si
chiede**: viene dalla classe.

Sotto i filtri, **quanti esercizi corrispondono**, aggiornato mentre si
sceglie. È l'informazione che evita l'unico errore frequente — chiederne
dieci dove ce ne sono quattro — e va mostrata *prima* del rifiuto, non al
posto suo.

Un'anteprima di cosa riceveranno gli studenti, con il player vero in
modalità locale, come già fa `anteprima/[id]`.

Quando l'assegnazione è rifiutata per capienza, il messaggio dice **quanti
ne sono stati chiesti e quanti ce n'erano**.

- [ ] **Passo 1: i test che falliscono**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: il modulo**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 6: Prova end-to-end

**Files:** `tests/e2e/docente-via-veloce.spec.ts`

Il docente apre gli esercizi, assegna alla sua classe dieci esercizi di un
argomento con una scadenza — **senza toccare raccolte né batterie** — e lo
studente li vede.

**L'asserzione che porta il task:** il percorso completo in una schermata
sola. Se richiede ancora un passaggio da una raccolta, la funzione non è
stata costruita.

Seconda asserzione: chiedere più esercizi di quanti ne esistano viene
rifiutato **con i due numeri nel messaggio**.

Come il modello in repo: porta 3100, `test.use({ locale: "it-IT" })`, nomi
unici per esecuzione, pulizia per prefisso, e deve passare due volte di fila
su un database sporco.

- [ ] **Passo 1: scrivere la prova**
- [ ] **Passo 2: eseguirla due volte**
- [ ] **Passo 3: commit**

---

## Note per il controllore

- **Il Task 1 è l'unico che può rompere ciò che funziona.** Ogni batteria
  esistente ha regole a contenitore: se cambiano comportamento, i compiti
  già assegnati non sono toccati (sono congelati) ma le batterie salvate
  smettono di funzionare.
- **L'invariante della regola va guardato nel verso permissivo**: una regola
  che passa i controlli avendo entrambe le forme, o nessuna, produce una
  pesca sbagliata in silenzio. È la stessa famiglia del difetto critico
  del sotto-progetto 4 — promettere più esercizi di quanti se ne consegnino.
- `verificaBatteria` è una stima prudente con un contratto dichiarato: un
  esito positivo garantisce che `assegna` non fallirà per capienza. Con le
  regole a filtro quel contratto va **ri-verificato**, non dato per buono.
- Il Task 4 tocca molte stringhe: il rischio non è il codice, è una chiave
  dimenticata che appare cruda sullo schermo o resta in inglese.
