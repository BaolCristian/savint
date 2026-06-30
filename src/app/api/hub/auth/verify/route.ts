import { NextResponse } from "next/server";
import { consumeVerificationToken } from "@/lib/auth/verification-token";
import { prisma } from "@/lib/db/client";
import { withBasePath } from "@/lib/base-path";
import { publicOrigin } from "@/lib/request-origin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const base = publicOrigin(req);
  if (!token) {
    return NextResponse.redirect(`${base}${withBasePath("/hub-login")}?verified=0`);
  }
  const result = await consumeVerificationToken(token, "VERIFY_EMAIL");
  if (!result) {
    return NextResponse.redirect(`${base}${withBasePath("/hub-login")}?verified=0`);
  }
  await prisma.hubAccount.update({
    where: { id: result.hubAccountId },
    data: { emailVerified: new Date() },
  });
  return NextResponse.redirect(`${base}${withBasePath("/hub-login")}?verified=1`);
}
