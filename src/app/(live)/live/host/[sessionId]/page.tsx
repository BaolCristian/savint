import { notFound } from "next/navigation";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { createHostToken } from "@/lib/socket/host-token";
import { HostView } from "@/components/live/host-view";

export default async function HostPage({
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

  if (!gameSession || gameSession.hostId !== session.user.id) {
    notFound();
  }

  return (
    <HostView
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
