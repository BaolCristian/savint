import { notFound } from "next/navigation";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { createHostToken } from "@/lib/socket/host-token";
import { TestView } from "@/components/live/test-view";

export default async function TestSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const session = await redirectUnlessTeacher();

  const { sessionId } = await params;

  const gameSession = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      quiz: {
        include: {
          questions: {
            orderBy: { order: "asc" },
          },
        },
      },
    },
  });

  if (!gameSession) notFound();
  if (gameSession.hostId !== session.user.id) notFound();
  if (!gameSession.isTest) notFound();

  return (
    <TestView
      session={{
        id: gameSession.id,
        pin: gameSession.pin,
        hostToken: createHostToken(gameSession.id),
        quiz: {
          title: gameSession.quiz.title,
          questions: gameSession.quiz.questions,
        },
      }}
    />
  );
}
