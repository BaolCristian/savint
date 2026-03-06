import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";

function generatePin(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function uniquePin(): Promise<string> {
  let pin: string;
  let exists: boolean;
  do {
    pin = generatePin();
    const found = await prisma.session.findFirst({
      where: { pin, status: { not: "FINISHED" } },
    });
    exists = !!found;
  } while (exists);
  return pin;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { quizId } = await req.json();
  if (!quizId) return NextResponse.json({ error: "quizId required" }, { status: 400 });

  const quiz = await prisma.quiz.findUnique({ where: { id: quizId } });
  if (!quiz) return NextResponse.json({ error: "Quiz not found" }, { status: 404 });

  const pin = await uniquePin();

  const gameSession = await prisma.session.create({
    data: {
      quizId,
      hostId: session.user.id,
      pin,
    },
  });

  return NextResponse.json(gameSession, { status: 201 });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { hostId: session.user.id },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(sessions);
}
