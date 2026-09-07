/**
 * Callback del cancello studenti, separati da NextAuth per essere testabili.
 * - signInWithGate: usato in callbacks.signIn; ritorna true oppure l'URL di
 *   redirect (stringa) verso la pagina di login con il motivo.
 * - onUserCreated: usato in events.createUser; applica la decisione in cache.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { BASE_PATH } from "@/lib/base-path";
import { isStudentGateEnabled } from "@/lib/config/student-gate";
import { evaluateLogin, takeDecision } from "@/lib/auth/student-gate";
import { allineaClassi } from "@/lib/esercizi/classi";

function loginError(reason: "NotAllowed" | "GroupCheckFailed"): string {
  return `${BASE_PATH}/login?error=${reason}`;
}

export async function signInWithGate(args: {
  email: string | null | undefined;
  provider: string | undefined;
}): Promise<true | string> {
  if (!isStudentGateEnabled()) return true;
  if (args.provider !== "google") return true;

  const email = args.email?.trim().toLowerCase();
  if (!email) return loginError("NotAllowed");

  // findFirst + mode "insensitive": l'email arriva già in minuscolo da Google,
  // ma in DB può essere salvata con maiuscole (utenti creati prima del cancello).
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, role: true },
  });
  const decision = await evaluateLogin(email, existing?.role ?? null);
  if (!decision.allowed) return loginError(decision.reason);

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        role: decision.role,
        ...(decision.classGroups !== undefined
          ? { classGroups: decision.classGroups as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    if (decision.role === "STUDENT" && decision.classGroups !== undefined) {
      await allineaClassi(existing.id, decision.classGroups);
    }
  }
  return true;
}

export async function onUserCreated(args: { id: string; email: string | null | undefined }): Promise<void> {
  if (!isStudentGateEnabled()) return;
  const email = args.email?.trim().toLowerCase();
  if (!email) return;
  const decision = takeDecision(email);
  if (!decision || !decision.allowed) return;
  await prisma.user.update({
    where: { id: args.id },
    data: {
      role: decision.role,
      ...(decision.classGroups !== undefined
        ? { classGroups: decision.classGroups as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });
  if (decision.role === "STUDENT" && decision.classGroups !== undefined) {
    await allineaClassi(args.id, decision.classGroups);
  }
}
