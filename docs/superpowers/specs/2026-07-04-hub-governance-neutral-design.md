# Governance neutrale dell'hub

**Data:** 2026-07-04
**Stato:** design approvato dall'utente

## Contesto

La governance dell'hub (savint.it) dipende oggi da un unico admin con email
scolastica (`cristian.virgili@paolosarpi.edu.it`). L'utente vuole un'identità di
governo **neutra**, non legata a una scuola, e la possibilità di **preservare i
contenuti** quando un docente/scuola lascia.

Fatti dello schema (verificati):
- `HubQuiz.hubAccountId` → `HubAccount` (`onDelete: Cascade`). I quiz appartengono
  al **docente** (HubAccount), non alla scuola. L'autore mostrato deriva da
  `HubAccount.name`.
- `Installation` (la scuola) non ha relazione con `HubQuiz`: eliminarla **non**
  tocca i contenuti (per questo i 6 quiz di paolosarpi sono sopravvissuti).
- La gestione admin (promuovi/rimuovi per email) esiste già (PR #14, tab
  *Amministratori*, ora in `main`).

Decisioni prese con l'utente: (1) admin super partes = **account `savint` neutro**
(email `cvirgili@sterpo.it`, nome "SAVINT"); (2) alla partenza di un docente i
suoi quiz **passano all'account SAVINT** (non si cancellano).

## Obiettivo

Dare all'hub un proprietario/amministratore neutro e la capacità di **adottare**
i contenuti di un docente sull'account SAVINT, più una piccola messa in sicurezza
della cancellazione scuola (dopo l'incidente su paolosarpi).

## Interventi

### 1. Account SAVINT neutro (super partes + proprietario contenuti)

- Un `HubAccount`: email `cvirgili@sterpo.it`, `name` "SAVINT",
  `role` HUB_ADMIN, `authMethod` PASSWORD, `emailVerified` valorizzato.
- **Creazione (ops, non codice):** l'utente registra `cvirgili@sterpo.it` su
  `savint.it/hub-register` e la verifica → viene promossa admin dalla tab
  Amministratori. (In alternativa la si seeda con verifica già fatta e si imposta
  la password da "password dimenticata".)
- **Identificazione in codice:** l'account di sistema è risolto per email da un
  env `SAVINT_SYSTEM_ACCOUNT_EMAIL` (default `cvirgili@sterpo.it`). Helper
  `getSystemHubAccount()` → ritorna l'HubAccount o `null` se non configurato.

### 2. Adozione contenuti → "Trasferisci i quiz a SAVINT"

- **Backend:** `POST /api/hub/admin/accounts/transfer-content` body `{ email }`
  (gated HUB_ADMIN):
  - risolve l'account SAVINT (`getSystemHubAccount`); se assente → 409
    `system_account_missing`.
  - trova l'HubAccount del docente per email; 404 se assente.
  - se l'email è quella dell'account SAVINT → 400 `cannot_transfer_self`.
  - in transazione: `hubQuiz.updateMany({ where: { hubAccountId: teacher.id },
    data: { hubAccountId: savint.id } })`. Ritorna `{ ok: true, moved: <count> }`.
    (L'autore mostrato diventa "SAVINT" perché deriva da `HubAccount.name`.)
- **Frontend:** nella tab *Amministratori* (`/admin/hub/admins`), nuova sezione
  "Trasferisci contenuti a SAVINT": input email del docente → pulsante →
  **dialog di conferma** che nomina l'email e avverte che *tutti* i suoi quiz
  passeranno a SAVINT → alla conferma mostra "N quiz trasferiti".
- i18n: chiavi nel namespace `adminAccounts` (titolo sezione, help, azione,
  conferma, esito con `{count}`, errori).

### 3. Sicurezza della cancellazione scuola

- Il dialog `ConfirmDelete` della console affiliazioni **nomina la voce** che si
  sta eliminando (es. «IIS Paolo Sarpi») nel titolo/corpo, così "Elimina" non si
  confonde con "Disattiva". Passare un `label` opzionale a `ConfirmDelete` e
  usarlo nel testo di conferma. Nessuna modifica di comportamento.

## Vincoli / fuori scope

- Nessuna modifica allo schema Prisma (nessuna migrazione): il trasferimento usa
  `updateMany` su `hubAccountId`; l'account SAVINT è un normale HubAccount.
- Il trasferimento è **per-docente** (per email), non per-scuola: sull'hub non
  esiste un legame docente→scuola. Nessun bulk multi-account, nessuna UI di
  elenco docenti (si opera per email, come la promozione).
- La creazione dell'account SAVINT è un passo operativo (registrazione+promozione
  o seed), non una feature.
- Non si implementa un "elimina docente": resta il ban (che preserva i contenuti).

## Verifica

- Test backend: transfer sposta i quiz del docente sull'account SAVINT e ritorna
  il conteggio; 409 se SAVINT non configurato; 400 self; 404 email ignota;
  401/403 senza admin.
- `tsc` pulito, `build` ✓, parità i18n IT/EN.
- A schermo: sezione "Trasferisci a SAVINT" con conferma; dialog di eliminazione
  scuola che nomina la scuola.

## Seguito (fuori da questo spec)

Dopo il deploy: recupero di paolosarpi (ricreare la riga `Installation` con le
credenziali esistenti) e riconnessione OAuth — tracciato separatamente.
