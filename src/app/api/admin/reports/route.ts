import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";

export async function GET(req: NextRequest) {
  const { error, status } = await assertAdmin();
  if (error) return NextResponse.json({ error }, { status: status! });

  const statusFilter = req.nextUrl.searchParams.get("status");

  const reports = await prisma.report.findMany({
    where: statusFilter ? { status: statusFilter as any } : undefined,
    include: {
      quiz: { select: { id: true, title: true, authorId: true, author: { select: { name: true, email: true } } } },
      reporter: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(reports);
}
