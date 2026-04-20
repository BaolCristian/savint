import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { TestView } from "@/components/live/test-view";

export default async function TestSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { sessionId } = await params;

  const gameSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { quiz: { select: { title: true } } },
  });

  if (!gameSession) notFound();
  if (gameSession.hostId !== session.user.id) notFound();
  if (!gameSession.isTest) notFound();

  return (
    <TestView
      sessionId={gameSession.id}
      pin={gameSession.pin}
      quizTitle={gameSession.quiz.title}
    />
  );
}
