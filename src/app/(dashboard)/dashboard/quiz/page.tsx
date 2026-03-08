import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlayQuizButton } from "@/components/quiz/play-button";
import { ImportQuizButton } from "@/components/quiz/import-button";

export default async function QuizListPage() {
  const session = await auth();

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: session!.user!.id },
        { shares: { some: { sharedWithId: session!.user!.id } } },
      ],
    },
    include: {
      _count: { select: { questions: true, sessions: true } },
      author: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">I miei Quiz</h1>
        <div className="flex gap-2">
          <ImportQuizButton />
          <Link href="/dashboard/quiz/new">
            <Button>Nuovo Quiz</Button>
          </Link>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <p className="text-muted-foreground">
          Nessun quiz ancora. Creane uno!
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <Card key={quiz.id} className="hover:shadow-md transition-shadow">
              <Link href={`/dashboard/quiz/${quiz.id}/edit`}>
                <CardHeader className="cursor-pointer">
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                  <CardDescription>
                    {quiz._count.questions} domande &middot; Giocato{" "}
                    {quiz._count.sessions} volte
                  </CardDescription>
                </CardHeader>
              </Link>
              <CardContent>
                <div className="flex gap-1 flex-wrap">
                  {quiz.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <PlayQuizButton quizId={quiz.id} />
                <a
                  href={`/api/quiz/${quiz.id}/export`}
                  download
                  className="inline-block mt-2 ml-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  Esporta .qlz
                </a>
                {quiz.authorId !== session!.user!.id && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Condiviso da {quiz.author.name}
                  </p>
                )}
                {quiz._count.sessions > 0 && (
                  <Link
                    href={`/dashboard/quiz/${quiz.id}/stats`}
                    className="inline-block mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Vedi statistiche
                  </Link>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
