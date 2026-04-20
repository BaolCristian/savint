import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import {
  QuizStatsCharts,
  type SessionTrendPoint,
  type QuestionStatPoint,
} from "@/components/stats/quiz-stats-charts";
import Link from "next/link";

export default async function QuizStatsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();

  const { id } = await params;

  const quiz = await prisma.quiz.findUnique({
    where: { id },
    include: {
      questions: { orderBy: { order: "asc" } },
      sessions: {
        where: { status: "FINISHED", isTest: false },
        orderBy: { endedAt: "asc" },
        include: {
          answers: true,
        },
      },
    },
  });

  if (!quiz || quiz.authorId !== session.user.id) notFound();

  // ---- Aggregate stats ----
  const totalSessions = quiz.sessions.length;

  // Per-session stats
  const sessionTrend: SessionTrendPoint[] = quiz.sessions.map((s, i) => {
    const totalAnswers = s.answers.length;
    const totalScore = s.answers.reduce((sum, a) => sum + a.score, 0);
    const uniquePlayers = new Set(s.answers.map((a) => a.playerName)).size;
    const avgScore = uniquePlayers > 0 ? totalScore / uniquePlayers : 0;

    const label = s.endedAt
      ? s.endedAt.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })
      : `#${i + 1}`;

    return { label, avgScore: Math.round(avgScore) };
  });

  // Average score across all sessions
  const overallAvgScore =
    sessionTrend.length > 0
      ? Math.round(
          sessionTrend.reduce((sum, s) => sum + s.avgScore, 0) /
            sessionTrend.length
        )
      : 0;

  // Average completion rate: what fraction of questions each player answered
  let avgCompletionRate = 0;
  if (totalSessions > 0 && quiz.questions.length > 0) {
    const rates = quiz.sessions.map((s) => {
      const uniquePlayers = new Set(s.answers.map((a) => a.playerName)).size;
      if (uniquePlayers === 0) return 0;
      const expectedAnswers = uniquePlayers * quiz.questions.length;
      return s.answers.length / expectedAnswers;
    });
    avgCompletionRate = Math.round(
      (rates.reduce((sum, r) => sum + r, 0) / rates.length) * 100
    );
  }

  // Per-question stats
  const allAnswers = quiz.sessions.flatMap((s) => s.answers);
  const questionStats: QuestionStatPoint[] = quiz.questions.map((q, i) => {
    const qAnswers = allAnswers.filter((a) => a.questionId === q.id);
    const total = qAnswers.length;
    const correct = qAnswers.filter((a) => a.isCorrect).length;
    const percentCorrect = total > 0 ? (correct / total) * 100 : 0;
    const avgTimeMs =
      total > 0
        ? Math.round(
            qAnswers.reduce((sum, a) => sum + a.responseTimeMs, 0) / total
          )
        : 0;

    return {
      label: `D${i + 1}`,
      percentCorrect: Math.round(percentCorrect * 10) / 10,
      avgTimeMs,
    };
  });

  const problematicQuestions = questionStats.filter(
    (q) => q.percentCorrect < 30 && allAnswers.some((a) => a.questionId !== undefined)
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/quiz/${id}/edit`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Torna al quiz
        </Link>
        <h1 className="text-2xl font-bold mt-2">{quiz.title}</h1>
        <p className="text-muted-foreground">
          Giocato {totalSessions} {totalSessions === 1 ? "volta" : "volte"}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sessioni totali
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalSessions}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Punteggio medio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{overallAvgScore}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Completamento medio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{avgCompletionRate}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Problematic questions warning */}
      {problematicQuestions.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <h3 className="font-semibold text-red-800 dark:text-red-200">
            Domande problematiche (&lt;30% corrette)
          </h3>
          <ul className="mt-2 text-sm text-red-700 dark:text-red-300 list-disc list-inside">
            {problematicQuestions.map((q) => {
              const idx = questionStats.indexOf(q);
              const question = quiz.questions[idx];
              return (
                <li key={q.label}>
                  {q.label}: &quot;{question.text.slice(0, 60)}
                  {question.text.length > 60 ? "..." : ""}&quot; &mdash;{" "}
                  {q.percentCorrect}% corrette, tempo medio{" "}
                  {(q.avgTimeMs / 1000).toFixed(1)}s
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Per-question response time table */}
      {questionStats.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            Tempo medio di risposta per domanda
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">Domanda</th>
                  <th className="text-right py-2 px-3">% Corrette</th>
                  <th className="text-right py-2 px-3">Tempo medio</th>
                </tr>
              </thead>
              <tbody>
                {questionStats.map((q, i) => (
                  <tr key={q.label} className="border-b last:border-0">
                    <td className="py-2 px-3">{q.label}</td>
                    <td className="py-2 px-3 max-w-xs truncate">
                      {quiz.questions[i].text}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span
                        className={
                          q.percentCorrect < 30
                            ? "text-red-600 font-medium"
                            : ""
                        }
                      >
                        {q.percentCorrect}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      {(q.avgTimeMs / 1000).toFixed(1)}s
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Charts */}
      <QuizStatsCharts
        sessionTrend={sessionTrend}
        questionStats={questionStats}
      />
    </div>
  );
}
