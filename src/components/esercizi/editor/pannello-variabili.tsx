"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CampoJme } from "./campo-jme";
import type { VariabileEditor } from "@/lib/esercizi/editor/modello";

/** Lo stesso identificatore di `src/lib/esercizi/editor/modello.ts`
 * (`identificatore`, non esportato): qui è solo un suggerimento immediato
 * mentre si scrive, non il controllo vero — quello resta il dominio, alla
 * verifica e al salvataggio. Se il dominio cambiasse questa regola, il
 * peggio che succede qui è un suggerimento leggermente disallineato, mai un
 * salvataggio che sembra andato a buon fine e non lo è: `verificaEsercizio`
 * e le rotte restano l'unica fonte autorevole. */
const IDENTIFICATORE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Le due forme dell'esempio: fuori da `\simplify{...}` il valore si mostra
// con `\var{a}`; dentro, la sostituzione è un secondo livello di graffe
// attorno al solo nome (`{a}`), senza `\var` — vedi il commento gemello in
// `src/lib/esercizi/editor/verifica.ts` (`identificatoriTesto`). Costanti,
// non stringhe tradotte: è sintassi del motore, identica in ogni lingua.
const ESEMPIO_FUORI_SIMPLIFY = "\\var{a}";
const ESEMPIO_DENTRO_SIMPLIFY = "\\simplify{{a}x + {b}}";

function erroreNome(nome: string): boolean {
  return nome.length > 0 && !IDENTIFICATORE.test(nome);
}

function erroreDefinizione(v: VariabileEditor): boolean {
  return v.nome.length > 0 && v.definizione.length === 0;
}

export interface PannelloVariabiliProps {
  variabili: VariabileEditor[];
  onChange: (variabili: VariabileEditor[]) => void;
  condizione: string;
  onChangeCondizione: (condizione: string) => void;
}

/** Il pannello delle variabili: una riga per variabile (nome, definizione,
 * descrizione), il campo condizione, e le due spiegazioni che l'aspettativa
 * naturale sbaglia — la sintassi `\var{}`/`{}` e l'indifferenza all'ordine
 * (vedi il brief del Task 6). L'errore di una riga compare accanto alla
 * riga stessa, non in un elenco a parte: è la riga sbagliata, non
 * l'esercizio intero, il posto giusto in cui guardare. */
export function PannelloVariabili({ variabili, onChange, condizione, onChangeCondizione }: PannelloVariabiliProps) {
  const t = useTranslations("esercizi.redazione.variabili");

  function aggiorna(indice: number, campo: keyof VariabileEditor, valore: string) {
    onChange(variabili.map((v, i) => (i === indice ? { ...v, [campo]: valore } : v)));
  }

  function aggiungi() {
    onChange([...variabili, { nome: "", definizione: "", descrizione: "" }]);
  }

  function rimuovi(indice: number) {
    onChange(variabili.filter((_, i) => i !== indice));
  }

  return (
    <section className="space-y-3" aria-label={t("titolo")}>
      <h2 className="text-lg font-semibold">{t("titolo")}</h2>

      <div className="space-y-2 rounded-lg bg-muted/40 p-3 text-sm">
        <p>{t("spiegazioneVar")}</p>
        <p className="font-mono text-xs">
          {t("fuoriSimplify")}: <code>{ESEMPIO_FUORI_SIMPLIFY}</code>
          {"   ·   "}
          {t("dentroSimplify")}: <code>{ESEMPIO_DENTRO_SIMPLIFY}</code>
        </p>
        <p>{t("spiegazioneOrdine")}</p>
      </div>

      {variabili.length === 0 && <p className="text-sm text-muted-foreground">{t("nessuna")}</p>}

      <ul className="space-y-3">
        {variabili.map((v, i) => {
          const idNome = `variabile-${i}-nome`;
          const idDefinizione = `variabile-${i}-definizione`;
          const idErroreDefinizione = `${idDefinizione}-errore`;
          const idDescrizione = `variabile-${i}-descrizione`;
          const nomeInvalido = erroreNome(v.nome);
          const definizioneMancante = erroreDefinizione(v);
          return (
            <li
              key={i}
              className="@container rounded-lg border p-3"
              aria-label={t("rigaAriaLabel", { numero: i + 1 })}
            >
              {/* `@xl`, non `sm`: la larghezza che conta è quella di questa
                  riga, non quella della finestra — la colonna di scrittura
                  che la contiene non è mai larga tutto lo schermo. La soglia
                  è scelta sulla colonna, non sul nome: `@xl` compila in
                  `@container (width >= 36rem)` (misurato sul CSS generato dal
                  `@tailwindcss/postcss` del repo), cioè 576px meno i 16px dei
                  due `gap-2` = ~186px per colonna, quanto basta al campo e
                  alla formula che gli sta sotto. `@sm` (24rem) darebbe
                  ~120px: la stessa strettezza che questa riga vuole togliere,
                  solo su un asse diverso. */}
              <div className="grid gap-2 @xl:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor={idNome} className="text-sm font-medium">
                    {t("nome")}
                  </label>
                  <Input
                    id={idNome}
                    value={v.nome}
                    aria-invalid={nomeInvalido}
                    onChange={(e) => aggiorna(i, "nome", e.target.value)}
                  />
                  {nomeInvalido && <p className="text-xs text-destructive">{t("erroreNome")}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  {/* `invalido`: la definizione mancante è un errore che
                      conosce solo il pannello — per l'eco un campo vuoto non
                      ha niente da dire. Senza questo il campo `definizione`
                      perderebbe il bordo rosso che il campo `nome` accanto ha
                      (`aria-invalid:border-destructive` in `input.tsx`), e la
                      stessa riga segnalerebbe i suoi due errori in due modi
                      diversi. */}
                  <CampoJme
                    id={idDefinizione}
                    etichetta={t("definizione")}
                    valore={v.definizione}
                    onChange={(valore) => aggiorna(i, "definizione", valore)}
                    invalido={definizioneMancante}
                    // Senza questo il campo è `aria-invalid` e basta: chi usa
                    // un lettore di schermo sente «non valido» e non sente il
                    // PERCHÉ, che è scritto nel paragrafo qui sotto — mentre
                    // il campo accanto, con l'eco, il perché ce l'ha. Il
                    // messaggio e il bordo rosso nascono dallo stesso
                    // `definizioneMancante`, quindi la descrizione si passa
                    // solo quando il paragrafo esiste davvero: un
                    // `aria-describedby` che punta a un nodo assente non
                    // descrive niente.
                    descrittoDa={definizioneMancante ? idErroreDefinizione : undefined}
                  />
                  {definizioneMancante && (
                    <p id={idErroreDefinizione} className="text-xs text-destructive">
                      {t("erroreDefinizione")}
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={idDescrizione} className="text-sm font-medium">
                    {t("descrizione")}
                  </label>
                  <Input
                    id={idDescrizione}
                    value={v.descrizione}
                    onChange={(e) => aggiorna(i, "descrizione", e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => rimuovi(i)}>
                  {t("rimuovi")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Button type="button" variant="outline" onClick={aggiungi}>
        {t("aggiungi")}
      </Button>

      <div className="flex flex-col gap-1 pt-2">
        <label htmlFor="redazione-condizione" className="text-sm font-medium">
          {t("condizione")}
        </label>
        <Input
          id="redazione-condizione"
          value={condizione}
          onChange={(e) => onChangeCondizione(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t("condizioneAiuto")}</p>
      </div>
    </section>
  );
}
