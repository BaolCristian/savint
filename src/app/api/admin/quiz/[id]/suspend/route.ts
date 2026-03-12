import { NextRequest, NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth/admin";
import { prisma } from "@/lib/db/client";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error, status } = await assertAdmin();
  if (error) return NextResponse.json({ error }, { status: status! });

  const { id } = await params;
  const { suspended } = await req.json();

  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz)
    return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  await prisma.quiz.update({
    where: { id },
    data: { suspended: !!suspended },
  });

  return NextResponse.json({ ok: true });
}
