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
import { DeleteSessionButton } from "@/components/session/delete-session-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTranslations } from "next-intl/server";
import { SessionStatsCharts } from "@/components/stats/session-stats-charts";

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

  const answeredStats = questionStats.filter((q) => q.totalAnswers > 0);
  const hardest = answeredStats.length > 0
    ? answeredStats.reduce((a, b) => (a.pctCorrect < b.pctCorrect ? a : b))
    : null;
  const easiest = answeredStats.length > 0
    ? answeredStats.reduce((a, b) => (a.pctCorrect > b.pctCorrect ? a : b))
    : null;

  // Leaderboard
  const playerMap = new Map<string, { score: number; correct: number; total: number }>();
  for (const a of answers) {
    const entry = playerMap.get(a.playerName) ?? { score: 0, correct: 0, total: 0 };
    entry.score += a.score;
    entry.total += 1;
    if (a.isCorrect) entry.correct += 1;
    playerMap.set(a.playerName, entry);
  }
  const leaderboard = [...playerMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.score - a.score);

  const bestStudent = leaderboard.length > 0 ? leaderboard[0] : null;
  const worstStudent = leaderboard.length > 1 ? leaderboard[leaderboard.length - 1] : null;

  const classAvgScore = leaderboard.length > 0
    ? Math.round(leaderboard.reduce((sum, p) => sum + p.score, 0) / leaderboard.length)
    : 0;
  const classAvgCorrectPct = leaderboard.length > 0
    ? Math.round(
        (leaderboard.reduce((sum, p) => sum + (p.total > 0 ? p.correct / p.total : 0), 0) /
          leaderboard.length) * 100,
      )
    : 0;
  const medianScore = (() => {
    if (leaderboard.length === 0) return 0;
    const sorted = leaderboard.map((p) => p.score).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  })();

  // Score distribution
  const scoreDistribution = (() => {
    if (leaderboard.length === 0) return [];
    const scores = leaderboard.map((p) => p.score);
    const maxScore = Math.max(...scores);
    const bucketCount = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(leaderboard.length))));
    const bucketSize = maxScore > 0 ? Math.ceil(maxScore / bucketCount) : 1;
    const buckets: { label: string; count: number }[] = [];
    for (let i = 0; i < bucketCount; i++) {
      const lo = i * bucketSize;
      const hi = lo + bucketSize;
      buckets.push({
        label: `${lo.toLocaleString()}-${hi.toLocaleString()}`,
        count: scores.filter((s) => s >= lo && (i === bucketCount - 1 ? s <= hi : s < hi)).length,
      });
    }
    return buckets;
  })();

  const questionsByError = answeredStats
    .map((q) => ({
      label: `D${q.number}`,
      pctWrong: 100 - q.pctCorrect,
      pctCorrect: q.pctCorrect,
    }))
    .sort((a, b) => b.pctWrong - a.pctWrong);

  function pctColor(pct: number) {
    if (pct < 30) return "text-red-600 dark:text-red-400";
    if (pct > 70) return "text-green-600 dark:text-green-400";
    return "text-amber-600 dark:text-amber-400";
  }

  function pctBg(pct: number) {
    if (pct < 30) return "bg-red-100 dark:bg-red-950/40";
    if (pct > 70) return "bg-green-100 dark:bg-green-950/40";
    return "bg-amber-100 dark:bg-amber-950/40";
  }

  const questionTypeLabel: Record<string, string> = {
    MULTIPLE_CHOICE: tq("multipleChoice"),
    TRUE_FALSE: tq("trueFalse"),
    OPEN_ANSWER: tq("openAnswer"),
    ORDERING: tq("ordering"),
    MATCHING: tq("matching"),
    NUMERIC_ESTIMATION: tq("numericEstimation"),
    SPOT_ERROR: tq("spotError"),
    IMAGE_HOTSPOT: tq("imageHotspot"),
  };

  const statusColors: Record<string, string> = {
    LOBBY: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    IN_PROGRESS: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    FINISHED: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  };

  const statusLabel: Record<string, string> = {
    LOBBY: t("lobby"),
    IN_PROGRESS: t("inProgress"),
    FINISHED: t("finished"),
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* ================================================================ */}
      {/*  HEADER                                                          */}
      {/* ================================================================ */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {session.quiz.title}
            </h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[session.status] ?? ""}`}>
              {statusLabel[session.status] ?? session.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            PIN {session.pin} &middot; {session.createdAt.toLocaleDateString("it-IT", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
            {session.endedAt && (
              <> &middot; {t("duration")}: {Math.round((session.endedAt.getTime() - session.createdAt.getTime()) / 60000)} min</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {(session.status === "LOBBY" || session.status === "IN_PROGRESS") && (
            <>
              <Link
                href={`/live/host/${session.id}`}
                target="_blank"
                className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2 rounded-lg transition-all text-sm"
              >
                {t("rejoin")}
              </Link>
              <TerminateButton sessionId={session.id} />
            </>
          )}
          <ExportButtons sessionId={id} />
          <DeleteSessionButton sessionId={session.id} redirectToList />
        </div>
      </div>

      {/* ================================================================ */}
      {/*  KPI CARDS                                                       */}
      {/* ================================================================ */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-6">
        {/* Participants */}
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t("participants")}</p>
            <p className="text-3xl font-extrabold tabular-nums">{totalPlayers}</p>
          </CardContent>
        </Card>

        {/* Questions */}
        <Card className="border-l-4 border-l-slate-400">
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t("question")}</p>
            <p className="text-3xl font-extrabold tabular-nums">{totalQuestions}</p>
          </CardContent>
        </Card>

        {/* Average Score */}
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t("classAvgScore")}</p>
            <p className="text-3xl font-extrabold tabular-nums">{classAvgScore.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("median")}: {medianScore.toLocaleString()}</p>
          </CardContent>
        </Card>

        {/* Correct % */}
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t("classAvgCorrectShort")}</p>
            <p className={`text-3xl font-extrabold tabular-nums ${pctColor(classAvgCorrectPct)}`}>
              {classAvgCorrectPct}%
            </p>
          </CardContent>
        </Card>

        {/* Best */}
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t("bestStudent")}</p>
            {bestStudent ? (
              <>
                <p className="text-lg font-bold truncate">{bestStudent.name}</p>
                <p className="text-xs text-muted-foreground">{bestStudent.score.toLocaleString()} pts &middot; {bestStudent.correct}/{bestStudent.total}</p>
              </>
            ) : <p className="text-muted-foreground text-sm">N/A</p>}
          </CardContent>
        </Card>

        {/* Worst */}
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-5 pb-4 px-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{t("worstStudent")}</p>
            {worstStudent ? (
              <>
                <p className="text-lg font-bold truncate">{worstStudent.name}</p>
                <p className="text-xs text-muted-foreground">{worstStudent.score.toLocaleString()} pts &middot; {worstStudent.correct}/{worstStudent.total}</p>
              </>
            ) : <p className="text-muted-foreground text-sm">N/A</p>}
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/*  CHARTS                                                          */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("scoreDistribution")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionStatsCharts
              scoreDistribution={scoreDistribution}
              questionsByError={[]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("questionsByError")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SessionStatsCharts
              scoreDistribution={[]}
              questionsByError={questionsByError}
            />
          </CardContent>
        </Card>
      </div>

      {/* ================================================================ */}
      {/*  HARDEST / EASIEST HIGHLIGHT                                     */}
      {/* ================================================================ */}
      {(hardest || easiest) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {hardest && (
            <div className="flex items-start gap-4 rounded-xl border bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/50 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 text-xl font-black">
                {hardest.pctCorrect.toFixed(0)}%
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-600 dark:text-red-400 mb-0.5">{t("hardest")}</p>
                <p className="text-sm font-medium truncate">D{hardest.number}: {hardest.text}</p>
                <p className="text-xs text-muted-foreground">{questionTypeLabel[hardest.type] ?? hardest.type}</p>
              </div>
            </div>
          )}
          {easiest && (
            <div className="flex items-start gap-4 rounded-xl border bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900/50 p-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 text-xl font-black">
                {easiest.pctCorrect.toFixed(0)}%
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400 mb-0.5">{t("easiest")}</p>
                <p className="text-sm font-medium truncate">D{easiest.number}: {easiest.text}</p>
                <p className="text-xs text-muted-foreground">{questionTypeLabel[easiest.type] ?? easiest.type}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ================================================================ */}
      {/*  LEADERBOARD + QUESTION DETAIL SIDE BY SIDE                      */}
      {/* ================================================================ */}
      <div className="grid gap-6 lg:grid-cols-5">
        {/* Leaderboard — narrower */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("leaderboard")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {leaderboard.length === 0 ? (
              <p className="text-muted-foreground text-sm p-4">{t("noParticipants")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 pl-4">#</TableHead>
                    <TableHead>{t("player")}</TableHead>
                    <TableHead className="text-right">{t("score")}</TableHead>
                    <TableHead className="text-right pr-4">{t("pctCorrect")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboard.map((player, idx) => {
                    const playerPct = player.total > 0 ? Math.round((player.correct / player.total) * 100) : 0;
                    return (
                      <TableRow key={player.name}>
                        <TableCell className="pl-4 font-semibold text-muted-foreground">
                          {idx < 3 ? ["🥇", "🥈", "🥉"][idx] : idx + 1}
                        </TableCell>
                        <TableCell className="font-medium">{player.name}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">
                          {player.score.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pctBg(playerPct)} ${pctColor(playerPct)}`}>
                            {playerPct}%
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Question detail — wider */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("questionDetail")}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 pl-4">#</TableHead>
                  <TableHead>{t("question")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("type")}</TableHead>
                  <TableHead className="text-right">{t("pctCorrect")}</TableHead>
                  <TableHead className="text-right pr-4">{t("avgTime")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {questionStats.map((q) => (
                  <TableRow key={q.number}>
                    <TableCell className="pl-4 font-semibold text-muted-foreground">{q.number}</TableCell>
                    <TableCell className="max-w-[200px] lg:max-w-xs truncate" title={q.text}>{q.text}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-xs">
                        {questionTypeLabel[q.type] ?? q.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {q.totalAnswers > 0 ? (
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${pctBg(q.pctCorrect)} ${pctColor(q.pctCorrect)}`}>
                          {q.pctCorrect.toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">N/A</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right pr-4 tabular-nums text-sm">
                      {q.totalAnswers > 0
                        ? `${(q.avgTimeMs / 1000).toFixed(1)}s`
                        : <span className="text-muted-foreground">N/A</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
