"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

interface EsercizioRiga {
  id: string;
  title: string;
  subtitle: string;
  anno: number;
  argomento: string;
}

/** Gestisce sia la rimozione degli esercizi già dentro il contenitore sia
 * l'aggiunta di quelli ancora fuori: le due liste condividono lo stesso
 * `router.refresh()` dopo ogni azione, quindi vivono nello stesso
 * componente invece che in due isolati fra loro. */
export function ContenitoreDetailClient({
  contenitoreId,
  dentro,
  fuori,
  testi,
}: {
  contenitoreId: string;
  dentro: EsercizioRiga[];
  fuori: EsercizioRiga[];
  testi: {
    nessunoDentro: string;
    rimuovi: string;
    titoloAggiungi: string;
    nessunoFuori: string;
    aggiungi: string;
    erroreGenerico: string;
    /** Il link all'anteprima del docente (`/dashboard/esercizi/anteprima/[id]`),
     * su ciascun esercizio in entrambe le liste: qui è dove il docente
     * sceglie alla cieca oggi — dal solo titolo — sia per un esercizio già
     * dentro sia per uno ancora da aggiungere (vedi il brief del task). */
    anteprima: string;
    cerca: string;
    anno: string;
    argomento: string;
    tutti: string;
    nessunRisultato: string;
  };
}) {
  const tUi = useTranslations("teacherExercisesUi");
  const router = useRouter();
  const [rimuovendo, setRimuovendo] = useState<string | null>(null);
  const [erroreRimozione, setErroreRimozione] = useState<string | null>(null);
  const [selezionati, setSelezionati] = useState<Set<string>>(new Set());
  const [aggiungendo, setAggiungendo] = useState(false);
  const [erroreAggiunta, setErroreAggiunta] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [anno, setAnno] = useState("all");
  const [argomento, setArgomento] = useState("all");
  const anni = [...new Set(fuori.map((e) => e.anno))].sort((a, b) => a - b);
  const argomenti = [...new Set(fuori.map((e) => e.argomento))].sort((a, b) => a.localeCompare(b));
  const fuoriFiltrati = fuori.filter((e) =>
    (anno === "all" || e.anno === Number(anno)) &&
    (argomento === "all" || e.argomento === argomento) &&
    `${e.title} ${e.subtitle}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  async function rimuovi(esercizioId: string) {
    setRimuovendo(esercizioId);
    setErroreRimozione(null);
    const res = await fetch(`/api/esercizi/contenitori/${contenitoreId}/esercizi`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esercizioId }),
    });
    setRimuovendo(null);
    if (!res.ok) {
      setErroreRimozione(testi.erroreGenerico);
      return;
    }
    router.refresh();
  }

  function toggle(id: string) {
    setSelezionati((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function aggiungi() {
    setAggiungendo(true);
    setErroreAggiunta(null);
    const res = await fetch(`/api/esercizi/contenitori/${contenitoreId}/esercizi`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ esercizioIds: [...selezionati] }),
    });
    setAggiungendo(false);
    if (!res.ok) {
      setErroreAggiunta(testi.erroreGenerico);
      return;
    }
    setSelezionati(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        {dentro.length === 0 ? (
          <p className="text-sm text-muted-foreground">{testi.nessunoDentro}</p>
        ) : (
          <ul className="grid gap-2">
            {dentro.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-input p-3"
              >
                <div className="min-w-0">
                  <p className="break-words font-medium">{e.title}</p>
                  <p className="break-words text-sm text-muted-foreground">{e.subtitle}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/dashboard/esercizi/anteprima/${e.id}`} target="_blank" rel="noreferrer" className="text-sm text-brand-blue hover:underline">
                    {testi.anteprima}
                  </Link>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => rimuovi(e.id)}
                    disabled={rimuovendo === e.id}
                  >
                    {testi.rimuovi}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {erroreRimozione && <p className="text-sm text-destructive">{erroreRimozione}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">{testi.titoloAggiungi}</h2>
        {fuori.length === 0 ? (
          <p className="text-sm text-muted-foreground">{testi.nessunoFuori}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <input type="search" aria-label={testi.cerca} placeholder={testi.cerca} value={query} onChange={(e) => setQuery(e.target.value)} className="h-9 w-full basis-full flex-none rounded-md border border-input bg-transparent px-2 text-sm sm:min-w-48 sm:flex-1 sm:basis-auto sm:w-auto" />
              <select aria-label={testi.anno} value={anno} onChange={(e) => setAnno(e.target.value)} className="h-9 max-w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"><option value="all">{testi.anno}: {testi.tutti}</option>{anni.map((value) => <option key={value} value={value}>{value}</option>)}</select>
              <select aria-label={testi.argomento} value={argomento} onChange={(e) => setArgomento(e.target.value)} className="h-9 max-w-full min-w-0 rounded-md border border-input bg-transparent px-2 text-sm"><option value="all">{testi.argomento}: {testi.tutti}</option>{argomenti.map((value) => <option key={value} value={value}>{value}</option>)}</select>
            </div>
            {fuoriFiltrati.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{testi.nessunRisultato}</p> : <ul className="grid gap-2 pb-16">
              {fuoriFiltrati.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-input p-3 text-sm hover:bg-muted/50"
                >
                  {/* Il link all'anteprima vive FUORI dal `label`: un `<a>`
                      annidato dentro un `label` sarebbe comunque un
                      bersaglio di clic valido, ma un clic lì rischierebbe di
                      spuntare anche la casella associata (il comportamento
                      di inoltro di `label` verso il proprio controllo) prima
                      ancora che la navigazione parta — un docente che vuole
                      solo guardare l'esercizio lo selezionerebbe per sbaglio
                      per l'aggiunta. */}
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selezionati.has(e.id)}
                      onChange={() => toggle(e.id)}
                      className="h-4 w-4"
                    />
                    <span>
                      <span className="font-medium">{e.title}</span>
                      <span className="ml-2 text-muted-foreground">{e.subtitle}</span>
                    </span>
                  </label>
                  <Link href={`/dashboard/esercizi/anteprima/${e.id}`} target="_blank" rel="noreferrer" className="text-brand-blue hover:underline">
                    {testi.anteprima}
                  </Link>
                </li>
              ))}
            </ul>}
            <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background/95 p-3 shadow-sm backdrop-blur">
              <span className="text-sm text-muted-foreground">{tUi("collections.selected", { count: selezionati.size })}</span>
              <Button onClick={aggiungi} disabled={aggiungendo || selezionati.size === 0}>
                {testi.aggiungi}
              </Button>
              {erroreAggiunta && <span className="text-sm text-destructive">{erroreAggiunta}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
