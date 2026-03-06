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
        <Link href="/dashboard/quiz/new">
          <Button>Nuovo Quiz</Button>
        </Link>
      </div>

      {quizzes.length === 0 ? (
        <p className="text-muted-foreground">
          Nessun quiz ancora. Creane uno!
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((quiz) => (
            <Link key={quiz.id} href={`/dashboard/quiz/${quiz.id}/edit`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{quiz.title}</CardTitle>
                  <CardDescription>
                    {quiz._count.questions} domande &middot; Giocato{" "}
                    {quiz._count.sessions} volte
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-1 flex-wrap">
                    {quiz.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  {quiz.authorId !== session!.user!.id && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Condiviso da {quiz.author.name}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
