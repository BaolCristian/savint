import { createHash, randomBytes } from "crypto";

/** 32 bytes ~= 256 bits encoded base64url (43 chars, no padding). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
