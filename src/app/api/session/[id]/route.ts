import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const gameSession = await prisma.session.findUnique({ where: { id } });
  if (!gameSession || gameSession.hostId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (gameSession.status === "FINISHED")
    return NextResponse.json({ error: "Already finished" }, { status: 400 });

  const updated = await prisma.session.update({
    where: { id },
    data: { status: "FINISHED", endedAt: new Date() },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });

  const gameSession = await prisma.session.findUnique({ where: { id } });
  if (!gameSession)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Only the host or an admin can delete
  const isOwner = gameSession.hostId === session.user.id;
  const isAdmin = user?.role === "ADMIN";
  if (!isOwner && !isAdmin)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Delete answers first, then the session
  await prisma.answer.deleteMany({ where: { sessionId: id } });
  await prisma.session.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
