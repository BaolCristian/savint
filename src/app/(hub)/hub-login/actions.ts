"use server";

// Reserved for server-side login workflows (e.g. resending verification).
// Credentials login is handled directly by NextAuth (signIn("hub-credentials")).
export async function noop() {
  return { ok: true } as const;
}
