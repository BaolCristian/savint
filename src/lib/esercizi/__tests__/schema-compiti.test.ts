import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
const model = (nome: string) => schema.match(new RegExp(`model ${nome} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";
const enumBlock = (nome: string) => schema.match(new RegExp(`enum ${nome} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? "";

describe("schema di classi, contenitori, batterie e compiti", () => {
  it.each(["Classe", "ClasseStudente", "ClasseDocente", "Contenitore", "ContenitoreEsercizio", "Batteria", "BatteriaRegola", "Compito"])(
    "dichiara il modello %s", (nome) => {
      expect(model(nome)).not.toBe("");
    },
  );

  it("la classe puo' nascere senza un gruppo Google, ma l'indirizzo resta unico quando c'e'", () => {
    expect(model("Classe")).toMatch(/googleGroupEmail\s+String\?\s+@unique/);
  });

  it("la classe ha un codice d'iscrizione unico, anch'esso opzionale", () => {
    expect(model("Classe")).toMatch(/codice\s+String\?\s+@unique/);
  });

  it("ogni iscrizione porta la sua origine, e di default viene da un gruppo", () => {
    expect(model("ClasseStudente")).toMatch(/origine\s+OrigineIscrizione\s+@default\(GRUPPO\)/);
  });

  it("l'origine di un'iscrizione e' o un gruppo o un codice", () => {
    const e = enumBlock("OrigineIscrizione");
    expect(e).toMatch(/GRUPPO/);
    expect(e).toMatch(/CODICE/);
  });

  it("un esercizio puo' stare in piu' contenitori", () => {
    expect(model("ContenitoreEsercizio")).toMatch(/@@id\(\[contenitoreId, esercizioId\]\)/);
  });

  it("un contenitore usato da una regola non si cancella", () => {
    expect(model("BatteriaRegola")).toMatch(/contenitore\s+Contenitore\s+@relation\([^)]*onDelete:\s*Restrict/);
  });

  it("una batteria con compiti non si cancella", () => {
    expect(model("Compito")).toMatch(/batteria\s+Batteria\s+@relation\([^)]*onDelete:\s*Restrict/);
  });

  it("il compito fissa la pesca", () => {
    expect(model("Compito")).toMatch(/drawSeed\s+String/);
    expect(model("Compito")).toMatch(/drawnVersionIds\s+String\[\]/);
  });

  it("il tentativo punta al compito e resta senza per gli esercizi liberi", () => {
    expect(model("Tentativo")).toMatch(/compitoId\s+String\?/);
    expect(model("Tentativo")).toMatch(/compito\s+Compito\?\s+@relation/);
  });

  it("cancellare un compito non distrugge i tentativi già fatti", () => {
    expect(model("Tentativo")).toMatch(/compito\s+Compito\?\s+@relation\([^)]*onDelete:\s*SetNull/);
  });

  it("un esercizio ha il lato inverso verso i suoi contenitori", () => {
    expect(model("Esercizio")).toMatch(/contenitori\s+ContenitoreEsercizio\[\]/);
  });

  it("User ha i lati inversi delle nuove relazioni", () => {
    const u = model("User");
    for (const r of ["classi", "classiInsegnate", "contenitoriCreati", "batterieCreate", "compitiAssegnati"]) {
      expect(u, `manca ${r}`).toMatch(new RegExp(`${r}\\s+\\w+\\[\\]`));
    }
  });
});
