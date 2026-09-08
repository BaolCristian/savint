# Iscrizione con codice — piano di implementazione

> **Per chi esegue:** SOTTO-ABILITÀ RICHIESTA: usare
> superpowers:subagent-driven-development, un task alla volta.

**Obiettivo:** il docente crea una classe e ottiene un codice; lo studente lo
inserisce e risulta iscritto; la sincronizzazione dai gruppi Google continua a
funzionare accanto, senza cancellare le iscrizioni da codice.

**Specifica:** `docs/superpowers/specs/2026-09-08-classi-codice-iscrizione-design.md`

## Vincoli globali

- **La migrazione gira su un database con dati veri.** Solo aggiunte. Rendere
  `googleGroupEmail` annullabile è un allargamento, non una restrizione, e
  non può fallire su righe esistenti. Ogni riga `ClasseStudente` esistente
  proviene dai gruppi Google: la colonna nuova prende quel valore come
  predefinito, così le righe di oggi restano corrette senza doverle toccare.
- Il database di sviluppo è condiviso col committente. Mai
  `prisma migrate reset`. Mai occupare la porta 3000; Playwright usa la 3100.
  Fermare un server per porta, mai per corrispondenza sulla riga di comando.
  **Mai `npm ci`**: le dipendenze ci sono già e cancellarle ha disturbato il
  server del committente una volta.
- Ogni stringa visibile da next-intl, in **entrambi** `src/messages/it.json` e
  `src/messages/en.json`.
- Rotte del docente dietro `requireTeacher()`, pagine dietro
  `redirectUnlessTeacher()`; la rotta dello studente dietro la sua guardia.
  Chiave del tetto di frequenza propria per ogni azione.
- Test guidati dalle prove; pulizia circoscritta per prefisso, mai una
  `deleteMany()` su tabella intera.
- Commit in italiano, ciascuno chiuso da:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CdhAEMqvfL2XXpgv7bH611
  ```

---

## Task 1: Schema, migrazione, e la sincronizzazione che non cancella più

**Files:**
- Modify: `prisma/schema.prisma`, `src/lib/esercizi/classi.ts`
- Create: la migrazione
- Test: `src/lib/esercizi/__tests__/classi.test.ts` (estendere),
  `src/lib/esercizi/__tests__/schema-compiti.test.ts` (estendere)

**Schema:**

```prisma
model Classe {
  googleGroupEmail String?  @unique   // era String @unique
  codice           String?  @unique   // nuovo
  // il resto invariato
}

enum OrigineIscrizione { GRUPPO CODICE }

model ClasseStudente {
  origine OrigineIscrizione @default(GRUPPO)   // nuovo
  // il resto invariato
}
```

`googleGroupEmail` annullabile funziona con `@unique` perché Postgres ammette
più NULL in un indice unico. Verificarlo nel test, non darlo per scontato.

**`allineaClassi` cambia in due punti, ed è il cuore del task:**

1. **Non tocca più le iscrizioni da codice.** Il calcolo delle uscite si
   restringe alle iscrizioni con `origine: GRUPPO`. Senza questo, uno studente
   iscritto col codice viene disiscritto al suo accesso successivo — in
   silenzio, ed è il difetto che questa specifica esiste per evitare.
2. **Adotta una classe creata a mano** quando il nome del gruppo coincide con
   una classe che non ha ancora `googleGroupEmail`: le scrive dentro
   l'indirizzo invece di crearne una seconda. Riempie un campo mancante e
   nient'altro: non sposta studenti, non cancella iscrizioni, non tocca
   classi già legate a un gruppo.

- [ ] **Passo 1: i test che falliscono**

I due che contano:

```ts
it("un accesso Google NON disiscrive chi si era iscritto col codice", async () => {
  // studente iscritto a X con origine CODICE, poi allineaClassi con gruppi
  // che NON contengono X
  await allineaClassi(studentId, [gruppoY]);
  const ancora = await prisma.classeStudente.findUnique({
    where: { classeId_studentId: { classeId: X, studentId } },
  });
  expect(ancora).not.toBeNull();          // fallisce oggi: viene cancellata
  expect(ancora!.origine).toBe("CODICE");
});

it("un gruppo che ha lo stesso nome di una classe creata a mano la adotta", async () => {
  const aMano = await creaClasse(docenteId, { nome: "2A", anno: 2 });
  await allineaClassi(studentId, [{ email: "allievi.2a@x.it", name: "2A", yearLevel: 2 }]);
  const classi = await prisma.classe.findMany({ where: { name: "2A" } });
  expect(classi).toHaveLength(1);          // non due
  expect(classi[0]!.id).toBe(aMano.id);
  expect(classi[0]!.googleGroupEmail).toBe("allievi.2a@x.it");
});

it("le iscrizioni da gruppo continuano a essere tolte quando il gruppo sparisce", () => { /* la regressione da non introdurre */ });
```

- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: schema, migrazione, codice**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: `npx prisma migrate status` e ispezionare il SQL generato** —
      deve contenere solo `ALTER ... DROP NOT NULL`, `ADD COLUMN` e
      `CREATE TYPE`. Nessun `DROP` di tabella o colonna.
- [ ] **Passo 6: commit**

---

## Task 2: Il dominio del codice

**Files:**
- Modify: `src/lib/esercizi/classi.ts`
- Test: `src/lib/esercizi/__tests__/classi.test.ts`

**Interfaces — produce:**

```ts
export function generaCodice(): string;   // 6 caratteri, alfabeto senza ambiguità
export function creaClasse(teacherId: string, input: { nome: string; anno: number | null }):
  Promise<{ ok: true; classe: { id: string; nome: string; codice: string } }
        | { ok: false; motivo: "nome_gia_usato" }>;
export function rigeneraCodice(classeId: string, teacherId: string):
  Promise<{ ok: true; codice: string } | { ok: false; motivo: "non_trovata" | "non_insegni_questa_classe" }>;
export function iscrivitiConCodice(studentId: string, codice: string):
  Promise<{ ok: true; classe: { id: string; nome: string } }
        | { ok: false; motivo: "codice_sconosciuto" | "gia_iscritto" }>;
export function iscrittiDellaClasse(classeId: string, teacherId: string):
  Promise<{ ok: true; righe: { studentId: string; nome: string | null; origine: "GRUPPO" | "CODICE"; dal: Date }[] }
        | { ok: false; motivo: "non_trovata" | "non_insegni_questa_classe" }>;
```

**Regole che i test devono fissare:**

- `generaCodice` non produce mai `O`, `0`, `I`, `1`, `S`, `5`. Alfabeto
  dichiarato come costante, e un test che lo verifica su molte estrazioni.
- `creaClasse` iscrive anche il docente come insegnante di quella classe:
  chi la crea la insegna, altrimenti la crea e non la vede.
- La collisione di codice è possibile e va gestita: riprovare su violazione di
  unicità, non sperare. Un test che forza la collisione.
- `iscrivitiConCodice` confronta **senza distinzione di cassa** e ignora gli
  spazi ai bordi: il codice viene digitato a mano da un ragazzo.
- L'iscrizione creata ha `origine: CODICE`. È ciò che la protegge dalla
  sincronizzazione: un test lo asserisce esplicitamente.
- `rigeneraCodice` **non tocca gli iscritti**: test che li conta prima e dopo.

- [ ] **Passo 1: i test che falliscono**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: il dominio**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 3: Le rotte

**Files:**
- Create: `src/app/api/esercizi/classi/route.ts` (POST crea),
  `src/app/api/esercizi/classi/[id]/codice/route.ts` (POST rigenera),
  `src/app/api/esercizi/classi/iscrizione/route.ts` (POST studente)
- Modify: `src/app/api/__tests__/teacher-only-routes.test.ts`
- Test: `src/app/api/esercizi/__tests__/classi-codice-route.test.ts`

Modello: `src/app/api/esercizi/compiti/route.ts`. Cancello, tetto, scafo,
dominio in fondo, rifiuti mappati su codici di stato **col motivo nel corpo**.

`nome_gia_usato` → 409, `non_trovata` → 404, `non_insegni_questa_classe` →
404 (non 403: confermerebbe che quella classe esiste), `codice_sconosciuto` →
404, `gia_iscritto` → 409.

**La rotta dello studente non è una rotta da docente**: va dietro la guardia
dello studente, e va aggiunta al registro con l'aspettativa giusta.

- [ ] **Passo 1: i test che falliscono**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: le rotte**
- [ ] **Passo 4: estendere il registro**
- [ ] **Passo 5: eseguirli e vederli passare**
- [ ] **Passo 6: commit**

---

## Task 4: Le due interfacce

**Files:**
- Modify: `src/app/(dashboard)/dashboard/esercizi/classi/page.tsx` e il suo
  client; l'area studente
- Modify: `src/messages/it.json`, `src/messages/en.json`
- Test: uno per lato

**Docente:** creare una classe (nome, anno); il codice mostrato **in grande e
leggibile**, perché verrà dettato ad alta voce o scritto alla lavagna;
rigenerarlo, con una conferma che dica che il vecchio smette di funzionare e
che **gli iscritti restano** — è la paura che frena chi rigenera; l'elenco
degli iscritti con la provenienza di ciascuno.

**Studente:** un campo per il codice, e cosa succede quando è sbagliato.
Il messaggio non deve distinguere «codice inesistente» da «codice di
un'altra scuola»: dice che non è valido.

- [ ] **Passo 1: i test che falliscono**
- [ ] **Passo 2: eseguirli e vederli fallire**
- [ ] **Passo 3: le interfacce**
- [ ] **Passo 4: eseguirli e vederli passare**
- [ ] **Passo 5: commit**

---

## Task 5: Prova end-to-end

**Files:** Create: `tests/e2e/classi-codice.spec.ts`

Il docente crea una classe, legge il codice, gli assegna un compito. Lo
studente inserisce il codice e vede quel compito.

**L'asserzione che porta il task**, e che nessun test unitario può dare:
dopo che lo studente si è iscritto col codice, **un nuovo accesso non lo
disiscrive**. È il difetto che l'intera specifica esiste per evitare, e la
prova end-to-end è l'unico posto in cui il ciclo di accesso è quello vero.

Come il modello già in repo (`tests/e2e/esercizi-compiti.spec.ts`): porta
3100, `test.use({ locale: "it-IT" })`, nomi unici per esecuzione, pulizia per
prefisso, e deve passare due volte di fila su un database sporco.

- [ ] **Passo 1: scrivere la prova**
- [ ] **Passo 2: eseguirla due volte**
- [ ] **Passo 3: commit**

---

## Note per il controllore

- **Il Task 1 è l'unico che può distruggere dati**, in due modi: la migrazione
  su un database popolato, e la sincronizzazione che cancella iscrizioni. Il
  secondo è già successo una volta in questo programma — `dichiaraInsegnamento`
  era una sostituzione integrale e con due schede aperte perdeva classi.
- L'adozione per nome va guardata **nel verso permissivo**: adottare una
  classe sbagliata unisce due gruppi di ragazzi che dovevano restare distinti.
  Deve toccare solo classi senza `googleGroupEmail`.
- Ogni riga `ClasseStudente` che esiste oggi viene dai gruppi: se il valore
  predefinito della colonna nuova non fosse `GRUPPO`, la prima
  sincronizzazione dopo la migrazione smetterebbe di ripulire le iscrizioni
  vecchie, e nessun test lo vedrebbe perché tutti creano righe nuove.
