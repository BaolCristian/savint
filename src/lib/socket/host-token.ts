import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Gettone del docente per una sessione live.
 *
 * La pagina del docente (già protetta dal login e dal controllo che la
 * sessione sia sua) lo calcola e lo passa al client; il server dei socket
 * accetta il nome speciale `__host__` e i comandi del docente solo con un
 * gettone valido. È un HMAC dell'id di sessione con il segreto di NextAuth:
 * niente da salvare nel database.
 */
function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET / NEXTAUTH_SECRET mancante: impossibile firmare il gettone del docente");
  return s;
}

export function createHostToken(sessionId: string): string {
  return createHmac("sha256", secret()).update(`live-host:${sessionId}`).digest("hex");
}

export function verifyHostToken(sessionId: string, token: unknown): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  let expected: string;
  try {
    expected = createHostToken(sessionId);
  } catch (err) {
    console.error(err);
    return false;
  }
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
