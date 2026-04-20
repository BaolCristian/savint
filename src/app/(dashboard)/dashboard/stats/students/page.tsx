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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTranslations } from "next-intl/server";

export default async function StudentsStatsPage() {
  const t = await getTranslations("stats");
  const session = await auth();
  const userId = session!.user!.id!;

  // Get all finished sessions with their answers
  const finishedSessions = await prisma.session.findMany({
    where: { hostId: userId, status: "FINISHED", isTest: false },
    include: {
      quiz: { select: { title: true } },
      answers: {
        select: {
          playerName: true,
          playerEmail: true,
          isCorrect: true,
          score: true,
          sessionId: true,
        },
      },
    },
    orderBy: { endedAt: "asc" },
  });

  // Build per-student data across all sessions
  type StudentSession = {
    sessionId: string;
    quizTitle: string;
    date: Date | null;
    totalScore: number;
    totalAnswers: number;
    correctAnswers: number;
  };

  type StudentData = {
    name: string;
    email: string | null;
    sessions: StudentSession[];
  };

  const studentMap = new Map<string, StudentData>();

  for (const s of finishedSessions) {
    // Group answers by player within this session
    const playerAnswers = new Map<
      string,
      {
        email: string | null;
        totalScore: number;
        totalAnswers: number;
        correctAnswers: number;
      }
    >();

    for (const a of s.answers) {
      const entry = playerAnswers.get(a.playerName);
      if (entry) {
        entry.totalScore += a.score;
        entry.totalAnswers++;
        if (a.isCorrect) entry.correctAnswers++;
        if (!entry.email && a.playerEmail) entry.email = a.playerEmail;
      } else {
        playerAnswers.set(a.playerName, {
          email: a.playerEmail,
          totalScore: a.score,
          totalAnswers: 1,
          correctAnswers: a.isCorrect ? 1 : 0,
        });
      }
    }

    for (const [name, data] of playerAnswers) {
      const existing = studentMap.get(name);
      const sessionEntry: StudentSession = {
        sessionId: s.id,
        quizTitle: s.quiz.title,
        date: s.endedAt,
        totalScore: data.totalScore,
        totalAnswers: data.totalAnswers,
        correctAnswers: data.correctAnswers,
      };

      if (existing) {
        existing.sessions.push(sessionEntry);
        if (!existing.email && data.email) existing.email = data.email;
      } else {
        studentMap.set(name, {
          name,
          email: data.email,
          sessions: [sessionEntry],
        });
      }
    }
  }

  // Compute aggregated stats for each student
  const students = [...studentMap.values()]
    .map((student) => {
      const totalSessions = student.sessions.length;
      const totalScore = student.sessions.reduce(
        (sum, s) => sum + s.totalScore,
        0
      );
      const totalAnswers = student.sessions.reduce(
        (sum, s) => sum + s.totalAnswers,
        0
      );
      const totalCorrect = student.sessions.reduce(
        (sum, s) => sum + s.correctAnswers,
        0
      );
      const avgScore =
        totalSessions > 0 ? Math.round(totalScore / totalSessions) : 0;
      const avgCorrectPct =
        totalAnswers > 0 ? Math.round((totalCorrect / totalAnswers) * 100) : 0;

      // Trend: compare first half vs second half of sessions by avg correct %
      let trend: "improving" | "declining" | "stable" = "stable";
      if (totalSessions >= 2) {
        const sorted = [...student.sessions].sort(
          (a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)
        );
        const half = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, half);
        const secondHalf = sorted.slice(half);

        const firstPct =
          firstHalf.reduce((sum, s) => sum + s.correctAnswers, 0) /
          Math.max(
            firstHalf.reduce((sum, s) => sum + s.totalAnswers, 0),
            1
          );
        const secondPct =
          secondHalf.reduce((sum, s) => sum + s.correctAnswers, 0) /
          Math.max(
            secondHalf.reduce((sum, s) => sum + s.totalAnswers, 0),
            1
          );

        const diff = secondPct - firstPct;
        if (diff > 0.05) trend = "improving";
        else if (diff < -0.05) trend = "declining";
      }

      return {
        ...student,
        totalSessions,
        avgScore,
        avgCorrectPct,
        trend,
      };
    })
    .sort((a, b) => b.avgScore - a.avgScore);

  const trendLabel: Record<string, string> = {
    improving: t("improving"),
    declining: t("declining"),
    stable: t("stable"),
  };

  const trendVariant: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    improving: "default",
    declining: "destructive",
    stable: "outline",
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/stats"
          className="text-sm text-muted-foreground hover:underline"
        >
          {t("backToStats")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("studentPerformance")}</h1>
        <p className="text-muted-foreground">
          {t("studentSubtitle")}
        </p>
      </div>

      {students.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {t("noStudentsYet")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("studentCount", { count: students.length })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("email")}</TableHead>
                  <TableHead className="text-right">{t("sessions")}</TableHead>
                  <TableHead className="text-right">{t("avgScore")}</TableHead>
                  <TableHead className="text-right">{t("pctCorrect")}</TableHead>
                  <TableHead className="text-center">{t("trend")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((s) => (
                  <TableRow key={s.name}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {s.email ?? "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {s.totalSessions}
                    </TableCell>
                    <TableCell className="text-right">{s.avgScore}</TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          s.avgCorrectPct < 50
                            ? "text-red-600 dark:text-red-400"
                            : s.avgCorrectPct < 70
                              ? "text-yellow-600 dark:text-yellow-400"
                              : "text-green-600 dark:text-green-400"
                        }
                      >
                        {s.avgCorrectPct}%
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={trendVariant[s.trend]}>
                        {trendLabel[s.trend]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Per-student session detail (expanded view) */}
      {students.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t("studentDetail")}</h2>
          {students.map((student) => (
            <Card key={student.name}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {student.name}
                  {student.email && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({student.email})
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("quiz")}</TableHead>
                      <TableHead>{t("date")}</TableHead>
                      <TableHead className="text-right">{t("score")}</TableHead>
                      <TableHead className="text-right">{t("correctLabel")}</TableHead>
                      <TableHead className="text-right">{t("pctCorrect")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {student.sessions.map((ss) => {
                      const pct =
                        ss.totalAnswers > 0
                          ? Math.round(
                              (ss.correctAnswers / ss.totalAnswers) * 100
                            )
                          : 0;
                      return (
                        <TableRow key={ss.sessionId}>
                          <TableCell>{ss.quizTitle}</TableCell>
                          <TableCell>
                            {ss.date
                              ? ss.date.toLocaleDateString("it-IT", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })
                              : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            {ss.totalScore}
                          </TableCell>
                          <TableCell className="text-right">
                            {ss.correctAnswers}/{ss.totalAnswers}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                pct < 50
                                  ? "text-red-600 dark:text-red-400"
                                  : pct < 70
                                    ? "text-yellow-600 dark:text-yellow-400"
                                    : "text-green-600 dark:text-green-400"
                              }
                            >
                              {pct}%
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
