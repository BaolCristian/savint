import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { redirect } from "next/navigation";
import { ExportButtons } from "@/components/session/export-buttons";
import Link from "next/link";
import { TerminateButton } from "@/components/session/terminate-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTranslations } from "next-intl/server";

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("sessions");
  const tc = await getTranslations("common");
  const tq = await getTranslations("questionEditor");
  const authSession = await auth();
  if (!authSession?.user?.id) redirect("/api/auth/signin");

  const session = await prisma.session.findUnique({
    where: { id, hostId: authSession.user.id },
    include: {
      quiz: {
        include: {
          questions: { orderBy: { order: "asc" } },
        },
      },
      answers: true,
    },
  });

  if (!session) notFound();

  // --- Compute stats ---
  const answers = session.answers;
  const questions = session.quiz.questions;

  // Unique players
  const playerNames = [...new Set(answers.map((a) => a.playerName))];
  const totalPlayers = playerNames.length;
  const totalQuestions = questions.length;

  // Per-question stats
  const questionStats = questions.map((q, idx) => {
    const qAnswers = answers.filter((a) => a.questionId === q.id);
    const correctCount = qAnswers.filter((a) => a.isCorrect).length;
    const totalAnswers = qAnswers.length;
    const pctCorrect = totalAnswers > 0 ? (correctCount / totalAnswers) * 100 : 0;
    const avgTime =
      totalAnswers > 0
        ? qAnswers.reduce((sum, a) => sum + a.responseTimeMs, 0) / totalAnswers
        : 0;

    return {
      number: idx + 1,
      text: q.text,
      type: q.type,
      pctCorrect,
      avgTimeMs: avgTime,
      totalAnswers,
    };
  });

  // Hardest / easiest (only questions with answers)
  const answeredStats = questionStats.filter((q) => q.totalAnswers > 0);
  const hardest = answeredStats.length > 0
    ? answeredStats.reduce((a, b) => (a.pctCorrect < b.pctCorrect ? a : b))
    : null;
  const easiest = answeredStats.length > 0
    ? answeredStats.reduce((a, b) => (a.pctCorrect > b.pctCorrect ? a : b))
    : null;

  // Leaderboard
  const playerMap = new Map<
    string,
    { score: number; correct: number; total: number }
  >();
  for (const a of answers) {
    const entry = playerMap.get(a.playerName) ?? {
      score: 0,
      correct: 0,
      total: 0,
    };
    entry.score += a.score;
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    playerMap.set(a.playerName, entry);
  }
  const leaderboard = [...playerMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.score - a.score);

  function pctColor(pct: number) {
    if (pct < 30) return "text-red-600";
    if (pct > 70) return "text-green-600";
    return "";
  }

  const questionTypeLabel: Record<string, string> = {
    MULTIPLE_CHOICE: tq("multipleChoice"),
    TRUE_FALSE: tq("trueFalse"),
    OPEN_ANSWER: tq("openAnswer"),
    ORDERING: tq("ordering"),
    MATCHING: tq("matching"),
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{session.quiz.title}</h1>
          <p className="text-muted-foreground">
            {t("pin", { pin: session.pin })} &middot; {t("sessionDate", {
              date: session.createdAt.toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }),
            })}
          </p>
        </div>
        <div className="flex gap-3 items-center">
          {(session.status === "LOBBY" || session.status === "IN_PROGRESS") && (
            <>
              <Link
                href={`/live/host/${session.id}`}
                target="_blank"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-full transition-all shadow-md"
              >
                {t("rejoin")}
              </Link>
              <TerminateButton sessionId={session.id} />
            </>
          )}
          <ExportButtons sessionId={id} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("participants")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalPlayers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("question")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalQuestions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("hardest")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {hardest ? (
              <>
                <p className="text-3xl font-bold text-red-600">
                  {hardest.pctCorrect.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  D{hardest.number}: {hardest.text}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">N/A</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("easiest")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {easiest ? (
              <>
                <p className="text-3xl font-bold text-green-600">
                  {easiest.pctCorrect.toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  D{easiest.number}: {easiest.text}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">N/A</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Classifica */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t("leaderboard")}</h2>
        {leaderboard.length === 0 ? (
          <p className="text-muted-foreground">{t("noParticipants")}</p>
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>{t("player")}</TableHead>
                  <TableHead className="text-right">{t("score")}</TableHead>
                  <TableHead className="text-right">{t("correct")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leaderboard.map((player, idx) => (
                  <TableRow key={player.name}>
                    <TableCell className="font-medium">{idx + 1}</TableCell>
                    <TableCell>{player.name}</TableCell>
                    <TableCell className="text-right">
                      {player.score.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {player.correct}/{player.total}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {/* Dettaglio domande */}
      <div>
        <h2 className="text-xl font-semibold mb-4">{t("questionDetail")}</h2>
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>{t("question")}</TableHead>
                <TableHead>{t("type")}</TableHead>
                <TableHead className="text-right">{t("pctCorrect")}</TableHead>
                <TableHead className="text-right">{t("avgTime")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questionStats.map((q) => (
                <TableRow key={q.number}>
                  <TableCell className="font-medium">{q.number}</TableCell>
                  <TableCell className="max-w-xs truncate">{q.text}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {questionTypeLabel[q.type] ?? q.type}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={`text-right font-semibold ${pctColor(q.pctCorrect)}`}
                  >
                    {q.totalAnswers > 0 ? `${q.pctCorrect.toFixed(0)}%` : "N/A"}
                  </TableCell>
                  <TableCell className="text-right">
                    {q.totalAnswers > 0
                      ? `${(q.avgTimeMs / 1000).toFixed(1)}s`
                      : "N/A"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
