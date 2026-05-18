import { createHash, randomBytes } from "crypto";

export type PkcePair = { verifier: string; challenge: string; method: "S256" };

export function generatePkcePair(): PkcePair {
  const verifier = randomBytes(48).toString("base64url"); // 64 chars
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}

export function verifyPkce(
  verifier: string,
  challenge: string,
  method: "S256" = "S256",
): boolean {
  if (method !== "S256") return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return computed === challenge;
}
