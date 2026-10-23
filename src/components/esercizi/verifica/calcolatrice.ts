// La calcolatrice della prova: un parser scritto qui, a discesa ricorsiva,
// che conosce solo numeri e operatori. Mai `eval` né `Function`: quello che
// lo studente scrive non diventa mai codice.
//
// Precedenze, dalla più bassa:
//   somma     := prodotto (("+" | "-") prodotto)*
//   prodotto  := unario (("*" | "/") unario)*
//   unario    := ("-" | "+") unario | potenza
//   potenza   := postfisso ("^" unario)?        (a destra: 2^3^2 = 2^9)
//   postfisso := primario "%"*                  (50% = 0,5)
//   primario  := numero | "(" somma ")" | "√" postfisso

type Token =
  | { tipo: "numero"; valore: number }
  | { tipo: "op"; op: "+" | "-" | "*" | "/" | "^" | "%" | "√" | "(" | ")" };

const SINONIMI: Record<string, "+" | "-" | "*" | "/" | "^" | "%" | "√" | "(" | ")"> = {
  "+": "+", "-": "-", "−": "-", "*": "*", "×": "*", "·": "*", "/": "/", "÷": "/", ":": "/",
  "^": "^", "%": "%", "√": "√", "(": "(", ")": ")",
};

function tokenizza(testo: string): Token[] | null {
  const token: Token[] = [];
  let i = 0;
  while (i < testo.length) {
    const c = testo[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const numero = /^(\d+([.,]\d+)?|[.,]\d+)/.exec(testo.slice(i));
    if (numero) {
      token.push({ tipo: "numero", valore: Number(numero[0].replace(",", ".")) });
      i += numero[0].length;
      continue;
    }
    const op = SINONIMI[c];
    if (!op) return null;
    token.push({ tipo: "op", op });
    i++;
  }
  return token;
}

class Parser {
  private pos = 0;
  constructor(private readonly token: Token[]) {}

  finito(): boolean {
    return this.pos >= this.token.length;
  }

  private vede(op: string): boolean {
    const t = this.token[this.pos];
    return t?.tipo === "op" && t.op === op;
  }

  private prendi(op: string): boolean {
    if (!this.vede(op)) return false;
    this.pos++;
    return true;
  }

  somma(): number {
    let v = this.prodotto();
    for (;;) {
      if (this.prendi("+")) v += this.prodotto();
      else if (this.prendi("-")) v -= this.prodotto();
      else return v;
    }
  }

  private prodotto(): number {
    let v = this.unario();
    for (;;) {
      if (this.prendi("*")) v *= this.unario();
      else if (this.prendi("/")) {
        const d = this.unario();
        if (d === 0) throw new Error("divisione per zero");
        v /= d;
      } else return v;
    }
  }

  private unario(): number {
    if (this.prendi("-")) return -this.unario();
    if (this.prendi("+")) return this.unario();
    return this.potenza();
  }

  private potenza(): number {
    const base = this.postfisso();
    if (this.prendi("^")) return base ** this.unario();
    return base;
  }

  private postfisso(): number {
    let v = this.primario();
    while (this.prendi("%")) v /= 100;
    return v;
  }

  private primario(): number {
    const t = this.token[this.pos];
    if (!t) throw new Error("espressione incompleta");
    if (t.tipo === "numero") {
      this.pos++;
      return t.valore;
    }
    if (this.prendi("(")) {
      const v = this.somma();
      if (!this.prendi(")")) throw new Error("parentesi non chiusa");
      return v;
    }
    if (this.prendi("√")) return Math.sqrt(this.postfisso());
    throw new Error("simbolo inatteso");
  }
}

/** Calcola l'espressione scritta dallo studente. Qualsiasi cosa non sia un
 * conto (lettere, simboli sconosciuti, parentesi spaiate), una divisione per
 * zero o un risultato non finito (√ di un negativo, potenze enormi) dà
 * `{ ok: false }`. */
export function valuta(espressione: string): { ok: true; valore: number } | { ok: false } {
  const token = tokenizza(espressione);
  if (!token || token.length === 0) return { ok: false };
  try {
    const parser = new Parser(token);
    const valore = parser.somma();
    if (!parser.finito() || !Number.isFinite(valore)) return { ok: false };
    // Toglie i residui della virgola mobile (0,1+0,2 = 0,3, non 0,30000000000000004).
    return { ok: true, valore: Number(valore.toPrecision(12)) };
  } catch {
    return { ok: false };
  }
}
