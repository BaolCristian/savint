import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { HubAccount } from "@prisma/client";
import { getHubSession } from "@/lib/auth/hub-session";

export type RequireHubAdminResult =
  | { ok: true; account: HubAccount }
  | { ok: false; response: Response };

/**
 * Ensures the request is made by an authenticated HubAccount with role HUB_ADMIN.
 * Returns 401 when there is no session, 403 when the session belongs to a non-admin.
 */
export async function requireHubAdmin(req: NextRequest): Promise<RequireHubAdminResult> {
  const session = await getHubSession(req);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  if (session.role !== "HUB_ADMIN") {
    return {
      ok: false,
      response: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, account: session };
}
