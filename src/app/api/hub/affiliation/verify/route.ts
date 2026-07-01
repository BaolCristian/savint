import { NextRequest, NextResponse } from "next/server";
import { verifyEmail } from "@/lib/hub/affiliation";
import { publicOrigin } from "@/lib/request-origin";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const res = await verifyEmail(token);
  const dest = res.ok ? "/affiliazione?verified=1" : "/affiliazione?error=invalid";
  return NextResponse.redirect(`${publicOrigin(req)}${dest}`);
}
