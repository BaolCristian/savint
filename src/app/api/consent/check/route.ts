import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  const version = req.nextUrl.searchParams.get("version");

  if (!type || !version)
    return NextResponse.json({ error: "type and version required" }, { status: 400 });

  const consent = await prisma.consent.findFirst({
    where: {
      userId: session.user.id,
      type: type as any,
      version,
    },
  });

  return NextResponse.json({ accepted: !!consent });
}
