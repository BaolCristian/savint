"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Share2Icon, UserRoundIcon, XIcon } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { withBasePath } from "@/lib/base-path";
import { cn } from "@/lib/utils";

/** La risorsa da condividere, con la stessa forma di `Risorsa`
 * (condivisione.ts): ripetuta qui perché quel modulo legge il database e un
 * client component non deve importarlo. */
export type RisorsaCondivisione =
  | { tipo: "esercizio"; id: string }
  | { tipo: "contenitore"; id: string }
  | { tipo: "argomento"; argomento: string };

type RuoloAssegnabile = "VISUALIZZATORE" | "COMMENTATORE" | "EDITOR";
type RuoloQualsiasi = RuoloAssegnabile | "PROPRIETARIO";

type Persona = { userId: string; nome: string; email: string; ruolo: RuoloAssegnabile };
type Docente = { id: string; nome: string; email: string };
type Indiretto = { nome: string; via: "raccolta" | "argomento"; dettaglio: string; ruolo: RuoloQualsiasi };

/** I testi già tradotti dalla pagina (vedi `testiCondivisione`). Quelli con
 * un segnaposto (`{titolo}`, `{nome}`, `{dettaglio}`) arrivano col
 * segnaposto intatto: li riempie `riempi` qui, perché a un client component
 * non si passa una funzione di traduzione. */
export interface TestiCondivisione {
  condividi: string;
  condividiArgomento: string;
  titolo: string;
  titoloArgomento: string;
  spiegazioneArgomento: string;
  spiegazioneRaccolta: string;
  caricamento: string;
  erroreCaricamento: string;
  aggiungiColleghi: string;
  cercaCollega: string;
  nessunCollega: string;
  personeConAccesso: string;
  proprietario: string;
  senzaProprietario: string;
  nessunaPersona: string;
  ruoloDi: string;
  rimuoviPersona: string;
  accessoGenerale: string;
  soloPersone: string;
  tuttaLaScuola: string;
  ruoloScuola: string;
  spiegazioneSolo: string;
  spiegazioneScuola: string;
  visualizzatore: string;
  commentatore: string;
  editor: string;
  altriAccessi: string;
  indirettoRaccolta: string;
  indirettoArgomento: string;
  indirettiSpiegazione: string;
  nuovoProprietario: string;
  nonCambiare: string;
  notaTrasferimento: string;
  notaTrasferimentoRaccolta: string;
  annulla: string;
  salva: string;
  salvataggio: string;
  erroreNonTrovato: string;
  erroreDestinatario: string;
  erroreGenerico: string;
}

function riempi(testo: string, valori: Record<string, string>): string {
  return testo.replace(/\{(\w+)\}/g, (tutto, k: string) => valori[k] ?? tutto);
}

function query(r: RisorsaCondivisione): string {
  const p = new URLSearchParams(r.tipo === "argomento" ? { tipo: r.tipo, argomento: r.argomento } : { tipo: r.tipo, id: r.id });
  return p.toString();
}

const RUOLI: RuoloAssegnabile[] = ["VISUALIZZATORE", "COMMENTATORE", "EDITOR"];

const SELECT = "h-8 rounded-md border border-input bg-background px-2 text-sm";

/** La finestra "Condividi" (spec "Interfaccia", come Google Drive): chi ha
 * accesso, col suo ruolo e "Rimuovi"; colleghi da aggiungere cercandoli per
 * nome; l'accesso generale (solo le persone aggiunte o tutta la scuola, con
 * un ruolo); per un esercizio, gli accessi che arrivano da raccolte e
 * argomento, così il proprietario capisce perché togliere la condivisione
 * diretta non basta. Niente cambia finché non si preme "Salva": allora un
 * solo PUT sostituisce tutto (e, se l'amministratore ha scelto un nuovo
 * proprietario, segue il POST del trasferimento).
 *
 * La pagina la mostra solo a chi può condividere (proprietario o ADMIN):
 * la rotta comunque risponde 404 a chiunque altro. */
export function CondividiDialog({
  risorsa,
  titolo,
  testi,
  admin = false,
  compatto = false,
}: {
  risorsa: RisorsaCondivisione;
  titolo: string;
  testi: TestiCondivisione;
  /** L'amministratore può anche passare la proprietà a un altro docente
   * (solo esercizi e raccolte). */
  admin?: boolean;
  /** Il pulsante come link di testo, per le righe del catalogo. */
  compatto?: boolean;
}) {
  const router = useRouter();
  // Id unici per finestra: due finestre Condividi sulla stessa pagina non
  // si rubano le etichette.
  const idBase = useId();
  const idCerca = `${idBase}-cerca`;
  const idGenerale = `${idBase}-generale`;
  const idProprietario = `${idBase}-proprietario`;
  const [aperta, setAperta] = useState(false);
  const [caricata, setCaricata] = useState(false);
  const [erroreCaricamento, setErroreCaricamento] = useState(false);
  const [persone, setPersone] = useState<Persona[]>([]);
  const [scuola, setScuola] = useState<RuoloAssegnabile | null>(null);
  const [indiretti, setIndiretti] = useState<Indiretto[]>([]);
  const [proprietarioNome, setProprietarioNome] = useState<string | null>(null);
  const [docenti, setDocenti] = useState<Docente[]>([]);
  const [cerca, setCerca] = useState("");
  const [nuovoProprietario, setNuovoProprietario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const trasferibile = admin && risorsa.tipo !== "argomento";
  const q = query(risorsa);

  // A ogni apertura si rilegge lo stato dal server: niente modifiche
  // lasciate a metà da un'apertura precedente.
  useEffect(() => {
    if (!aperta) return;
    let annullato = false;
    setCaricata(false);
    setErroreCaricamento(false);
    setErrore(null);
    setCerca("");
    setNuovoProprietario("");
    (async () => {
      try {
        const [rs, rd] = await Promise.all([
          fetch(withBasePath(`/api/esercizi/condivisione?${q}`)),
          fetch(withBasePath("/api/esercizi/docenti")),
        ]);
        if (!rs.ok || !rd.ok) throw new Error("caricamento");
        const stato = await rs.json();
        const { docenti } = await rd.json();
        if (annullato) return;
        setPersone(stato.persone);
        setScuola(stato.scuola);
        setIndiretti(stato.indiretti ?? []);
        setProprietarioNome(stato.proprietarioNome);
        setDocenti(docenti);
        setCaricata(true);
      } catch {
        if (!annullato) setErroreCaricamento(true);
      }
    })();
    return () => {
      annullato = true;
    };
  }, [aperta, q]);

  const nomeRuolo: Record<RuoloQualsiasi, string> = {
    VISUALIZZATORE: testi.visualizzatore,
    COMMENTATORE: testi.commentatore,
    EDITOR: testi.editor,
    PROPRIETARIO: testi.proprietario,
  };

  const suggeriti = useMemo(() => {
    const cercato = cerca.trim().toLocaleLowerCase();
    if (!cercato) return [];
    const presenti = new Set(persone.map((p) => p.userId));
    return docenti
      .filter((d) => !presenti.has(d.id))
      .filter((d) => `${d.nome} ${d.email}`.toLocaleLowerCase().includes(cercato))
      .slice(0, 6);
  }, [cerca, docenti, persone]);

  const aggiungi = (d: Docente) => {
    setPersone((ora) => [...ora, { userId: d.id, nome: d.nome, email: d.email, ruolo: "VISUALIZZATORE" }]);
    setCerca("");
  };
  const cambiaRuolo = (userId: string, ruolo: RuoloAssegnabile) =>
    setPersone((ora) => ora.map((p) => (p.userId === userId ? { ...p, ruolo } : p)));
  const togli = (userId: string) => setPersone((ora) => ora.filter((p) => p.userId !== userId));

  const salva = async () => {
    setSalvando(true);
    setErrore(null);
    try {
      const res = await fetch(withBasePath("/api/esercizi/condivisione"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ risorsa, persone: persone.map(({ userId, ruolo }) => ({ userId, ruolo })), scuola }),
      });
      if (!res.ok) {
        setErrore(res.status === 404 ? testi.erroreNonTrovato : res.status === 422 ? testi.erroreDestinatario : testi.erroreGenerico);
        return;
      }
      // Il trasferimento dopo la condivisione: l'amministratore resta
      // abilitato a condividere anche dopo aver passato la proprietà.
      if (trasferibile && nuovoProprietario) {
        const tr = await fetch(withBasePath("/api/esercizi/condivisione/proprietario"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ risorsa, nuovoProprietarioId: nuovoProprietario }),
        });
        if (!tr.ok) {
          setErrore(tr.status === 422 ? testi.erroreDestinatario : testi.erroreGenerico);
          router.refresh();
          return;
        }
      }
      setAperta(false);
      router.refresh();
    } catch {
      setErrore(testi.erroreGenerico);
    } finally {
      setSalvando(false);
    }
  };

  const titoloFinestra = riempi(risorsa.tipo === "argomento" ? testi.titoloArgomento : testi.titolo, { titolo });
  const spiegazione =
    risorsa.tipo === "argomento" ? testi.spiegazioneArgomento : risorsa.tipo === "contenitore" ? testi.spiegazioneRaccolta : null;

  return (
    <Dialog open={aperta} onOpenChange={setAperta}>
      <DialogTrigger
        render={
          compatto ? (
            <button type="button" className="inline-flex items-center gap-1 text-sm text-brand-blue hover:underline" />
          ) : (
            <Button type="button" variant="outline" size="sm" />
          )
        }
      >
        <Share2Icon className="size-3.5" aria-hidden />
        {risorsa.tipo === "argomento" ? testi.condividiArgomento : testi.condividi}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg leading-snug break-words">{titoloFinestra}</DialogTitle>
          {spiegazione && <DialogDescription>{spiegazione}</DialogDescription>}
        </DialogHeader>

        {erroreCaricamento ? (
          <p role="alert" className="text-sm text-destructive">{testi.erroreCaricamento}</p>
        ) : !caricata ? (
          <p className="text-sm text-muted-foreground">{testi.caricamento}</p>
        ) : (
          <div className="space-y-5">
            {/* Aggiungi colleghi: si cerca, si clicca, entra come
                visualizzatore; il ruolo si sceglie poi nell'elenco. */}
            <div className="space-y-1.5">
              <label htmlFor={idCerca} className="text-sm font-medium">{testi.aggiungiColleghi}</label>
              <Input
                id={idCerca}
                type="search"
                placeholder={testi.cercaCollega}
                value={cerca}
                autoComplete="off"
                onChange={(e) => setCerca(e.target.value)}
              />
              {cerca.trim() !== "" && (
                suggeriti.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{testi.nessunCollega}</p>
                ) : (
                  <ul className="overflow-hidden rounded-md border border-border">
                    {suggeriti.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => aggiungi(d)}
                          className="flex w-full min-w-0 flex-col items-start px-3 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                        >
                          <span className="truncate font-medium">{d.nome}</span>
                          <span className="truncate text-xs text-muted-foreground">{d.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

            <div className="space-y-1.5">
              <h3 className="text-sm font-medium">{testi.personeConAccesso}</h3>
              <ul className="divide-y divide-border">
                <li className="flex items-center gap-3 py-2">
                  <Avatar />
                  <span className="min-w-0 flex-1 truncate font-medium">{proprietarioNome ?? testi.senzaProprietario}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{testi.proprietario}</span>
                </li>
                {persone.map((p) => (
                  <li key={p.userId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                    <Avatar />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.nome}</p>
                      {p.email !== p.nome && <p className="truncate text-xs text-muted-foreground">{p.email}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <select
                        aria-label={riempi(testi.ruoloDi, { nome: p.nome })}
                        value={p.ruolo}
                        onChange={(e) => cambiaRuolo(p.userId, e.target.value as RuoloAssegnabile)}
                        className={SELECT}
                      >
                        {RUOLI.map((r) => <option key={r} value={r}>{nomeRuolo[r]}</option>)}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={riempi(testi.rimuoviPersona, { nome: p.nome })}
                        title={riempi(testi.rimuoviPersona, { nome: p.nome })}
                        onClick={() => togli(p.userId)}
                      >
                        <XIcon aria-hidden />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
              {persone.length === 0 && <p className="text-xs text-muted-foreground">{testi.nessunaPersona}</p>}
            </div>

            <div className="space-y-1.5">
              <label htmlFor={idGenerale} className="text-sm font-medium">{testi.accessoGenerale}</label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id={idGenerale}
                  value={scuola ? "scuola" : "solo"}
                  onChange={(e) => setScuola(e.target.value === "scuola" ? (scuola ?? "VISUALIZZATORE") : null)}
                  className={cn(SELECT, "min-w-0 flex-1")}
                >
                  <option value="solo">{testi.soloPersone}</option>
                  <option value="scuola">{testi.tuttaLaScuola}</option>
                </select>
                {scuola && (
                  <select
                    aria-label={testi.ruoloScuola}
                    value={scuola}
                    onChange={(e) => setScuola(e.target.value as RuoloAssegnabile)}
                    className={SELECT}
                  >
                    {RUOLI.map((r) => <option key={r} value={r}>{nomeRuolo[r]}</option>)}
                  </select>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{scuola ? testi.spiegazioneScuola : testi.spiegazioneSolo}</p>
            </div>

            {indiretti.length > 0 && (
              <div className="space-y-1.5 rounded-md bg-muted/50 p-3">
                <h3 className="text-sm font-medium">{testi.altriAccessi}</h3>
                <ul className="space-y-1">
                  {indiretti.map((i) => (
                    <li key={`${i.via}-${i.dettaglio}-${i.nome}`} className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                      <span>{riempi(i.via === "raccolta" ? testi.indirettoRaccolta : testi.indirettoArgomento, { nome: i.nome, dettaglio: i.dettaglio })}</span>
                      <span className="text-xs text-muted-foreground">{nomeRuolo[i.ruolo]}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">{testi.indirettiSpiegazione}</p>
              </div>
            )}

            {trasferibile && (
              <div className="space-y-1.5">
                <label htmlFor={idProprietario} className="text-sm font-medium">{testi.nuovoProprietario}</label>
                <select
                  id={idProprietario}
                  value={nuovoProprietario}
                  onChange={(e) => setNuovoProprietario(e.target.value)}
                  className={cn(SELECT, "w-full")}
                >
                  <option value="">{testi.nonCambiare}</option>
                  {docenti.map((d) => <option key={d.id} value={d.id}>{d.nome} ({d.email})</option>)}
                </select>
                {nuovoProprietario && (
                  <p className="rounded-md border border-brand-orange/40 bg-brand-orange/5 px-3 py-2 text-xs">
                    {risorsa.tipo === "contenitore" ? testi.notaTrasferimentoRaccolta : testi.notaTrasferimento}
                  </p>
                )}
              </div>
            )}

            {errore && <p role="alert" className="text-sm text-destructive">{errore}</p>}
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>{testi.annulla}</DialogClose>
          <Button type="button" onClick={salva} disabled={!caricata || salvando}>
            {salvando ? testi.salvataggio : testi.salva}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Avatar() {
  return (
    <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue">
      <UserRoundIcon className="size-4" />
    </span>
  );
}
