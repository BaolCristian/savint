import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (quiz.authorId !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { email, permission } = body as {
    email: string;
    permission: "VIEW" | "DUPLICATE" | "EDIT";
  };

  if (!email || !permission) {
    return NextResponse.json(
      { error: "email and permission are required" },
      { status: 400 },
    );
  }

  if (!["VIEW", "DUPLICATE", "EDIT"].includes(permission)) {
    return NextResponse.json(
      { error: "Invalid permission" },
      { status: 400 },
    );
  }

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (!targetUser) {
    return NextResponse.json(
      { error: "Utente non trovato" },
      { status: 404 },
    );
  }

  if (targetUser.id === session.user.id) {
    return NextResponse.json(
      { error: "Non puoi condividere con te stesso" },
      { status: 400 },
    );
  }

  const share = await prisma.quizShare.upsert({
    where: {
      quizId_sharedWithId: { quizId: id, sharedWithId: targetUser.id },
    },
    update: { permission },
    create: {
      quizId: id,
      sharedWithId: targetUser.id,
      permission,
    },
    include: {
      sharedWith: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(share, { status: 201 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (quiz.authorId !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const shares = await prisma.quizShare.findMany({
    where: { quizId: id },
    include: {
      sharedWith: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(shares);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const quiz = await prisma.quiz.findUnique({ where: { id } });
  if (!quiz) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (quiz.authorId !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { shareId } = body as { shareId: string };

  if (!shareId) {
    return NextResponse.json(
      { error: "shareId is required" },
      { status: 400 },
    );
  }

  const share = await prisma.quizShare.findUnique({ where: { id: shareId } });
  if (!share || share.quizId !== id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.quizShare.delete({ where: { id: shareId } });
  return NextResponse.json({ ok: true });
}
