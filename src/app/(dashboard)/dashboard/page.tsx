import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardHome() {
  const session = await auth();
  const userId = session!.user!.id!;

  const [quizCount, sessionCount, studentsResult] = await Promise.all([
    prisma.quiz.count({ where: { authorId: userId } }),
    prisma.session.count({ where: { hostId: userId } }),
    prisma.answer.findMany({
      where: { session: { hostId: userId } },
      select: { playerName: true },
      distinct: ["playerName"],
    }),
  ]);

  // Calculate correctness manually since isCorrect is boolean
  const allAnswers = await prisma.answer.findMany({
    where: { session: { hostId: userId } },
    select: { isCorrect: true },
  });
  const totalAnswers = allAnswers.length;
  const correctAnswers = allAnswers.filter((a) => a.isCorrect).length;
  const correctnessRate =
    totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

  const studentCount = studentsResult.length;

  const [recentSessions, recentQuizzes] = await Promise.all([
    prisma.session.findMany({
      where: { hostId: userId },
      include: {
        quiz: { select: { title: true } },
        _count: { select: { answers: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.quiz.findMany({
      where: { authorId: userId },
      include: { _count: { select: { questions: true } } },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  // Get distinct player counts per session
  const sessionPlayerCounts = await Promise.all(
    recentSessions.map(async (s) => {
      const players = await prisma.answer.findMany({
        where: { sessionId: s.id },
        select: { playerName: true },
        distinct: ["playerName"],
      });
      return { sessionId: s.id, count: players.length };
    })
  );
  const playerCountMap = Object.fromEntries(
    sessionPlayerCounts.map((p) => [p.sessionId, p.count])
  );

  const statusLabels: Record<string, string> = {
    LOBBY: "In attesa",
    IN_PROGRESS: "In corso",
    FINISHED: "Terminata",
  };

  const statusVariants: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    LOBBY: "outline",
    IN_PROGRESS: "default",
    FINISHED: "secondary",
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Quick Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total quiz creati
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{quizCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sessioni giocate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{sessionCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Studenti totali
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{studentCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tasso medio correttezza
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{correctnessRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Sessions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Sessioni recenti</h2>
        {recentSessions.length === 0 ? (
          <p className="text-muted-foreground">Nessuna sessione ancora.</p>
        ) : (
          <div className="grid gap-3">
            {recentSessions.map((s) => (
              <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="space-y-1">
                      <p className="font-medium">{s.quiz.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {playerCountMap[s.id] ?? 0} studenti &middot;{" "}
                        {s.createdAt.toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <Badge variant={statusVariants[s.status]}>
                      {statusLabels[s.status]}
                    </Badge>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Recent Quizzes */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quiz recenti</h2>
        {recentQuizzes.length === 0 ? (
          <p className="text-muted-foreground">Nessun quiz ancora.</p>
        ) : (
          <div className="grid gap-3">
            {recentQuizzes.map((q) => (
              <Link key={q.id} href={`/dashboard/quiz/${q.id}/edit`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="space-y-1">
                      <p className="font-medium">{q.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {q._count.questions} domande
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
