import type { NextRequest } from "next/server";
import type { HubAccount } from "@prisma/client";
import { auth } from "./config";
import { prisma } from "@/lib/db/client";

/**
 * Returns the currently authenticated HubAccount from a NextRequest (App Router route handler).
 * Returns null when no session, when not in hub mode, or when the session's user.id is not a HubAccount.
 */
export async function getHubSession(_req: NextRequest): Promise<HubAccount | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.hubAccount.findUnique({ where: { id } });
}

/**
 * Same as getHubSession but for server components / server actions where you don't have a request.
 */
export async function getHubSessionFromCookies(): Promise<HubAccount | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return prisma.hubAccount.findUnique({ where: { id } });
}
