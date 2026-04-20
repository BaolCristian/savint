import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "next-intl/server";

export default async function TopicsStatsPage() {
  const t = await getTranslations("stats");
  const tc = await getTranslations("common");
  const session = await auth();
  const userId = session!.user!.id!;

  // Get all quizzes with tags and their finished sessions + answers
  const quizzes = await prisma.quiz.findMany({
    where: { authorId: userId },
    select: {
      id: true,
      title: true,
      tags: true,
      sessions: {
        where: { status: "FINISHED", isTest: false },
        select: {
          id: true,
          answers: {
            select: { isCorrect: true },
          },
        },
      },
    },
  });

  // Aggregate stats by tag
  type TagStats = {
    tag: string;
    quizCount: number;
    quizTitles: string[];
    totalSessions: number;
    totalAnswers: number;
    correctAnswers: number;
  };

  const tagMap = new Map<string, TagStats>();

  for (const quiz of quizzes) {
    if (quiz.tags.length === 0) continue;

    const quizSessions = quiz.sessions.length;
    const quizAnswers = quiz.sessions.flatMap((s) => s.answers);
    const quizCorrect = quizAnswers.filter((a) => a.isCorrect).length;
    const quizTotal = quizAnswers.length;

    for (const tag of quiz.tags) {
      const entry = tagMap.get(tag);
      if (entry) {
        entry.quizCount++;
        entry.quizTitles.push(quiz.title);
        entry.totalSessions += quizSessions;
        entry.totalAnswers += quizTotal;
        entry.correctAnswers += quizCorrect;
      } else {
        tagMap.set(tag, {
          tag,
          quizCount: 1,
          quizTitles: [quiz.title],
          totalSessions: quizSessions,
          totalAnswers: quizTotal,
          correctAnswers: quizCorrect,
        });
      }
    }
  }

  const tags = [...tagMap.values()]
    .map((tg) => ({
      ...tg,
      avgCorrectPct:
        tg.totalAnswers > 0
          ? Math.round((tg.correctAnswers / tg.totalAnswers) * 100)
          : null,
    }))
    .sort((a, b) => (a.avgCorrectPct ?? 0) - (b.avgCorrectPct ?? 0));

  const quizzesWithoutTags = quizzes.filter((q) => q.tags.length === 0).length;

  function getColorClasses(pct: number | null) {
    if (pct === null) return "bg-muted text-muted-foreground";
    if (pct < 50)
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800";
    if (pct < 70)
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800";
    return "bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-800";
  }

  function getBarColor(pct: number | null) {
    if (pct === null) return "bg-muted";
    if (pct < 50) return "bg-red-500";
    if (pct < 70) return "bg-yellow-500";
    return "bg-green-500";
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard/stats"
          className="text-sm text-muted-foreground hover:underline"
        >
          {t("backToStats")}
        </Link>
        <h1 className="text-2xl font-bold mt-2">{t("topicAnalysis")}</h1>
        <p className="text-muted-foreground">
          {t("topicSubtitle")}
        </p>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-sm">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-red-500" />
          <span>{t("weak")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-yellow-500" />
          <span>{t("sufficient")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-green-500" />
          <span>{t("good")}</span>
        </div>
      </div>

      {tags.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              {t("noTags")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tags.map((tg) => (
            <Card key={tg.tag} className={`border ${getColorClasses(tg.avgCorrectPct)}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{tg.tag}</CardTitle>
                  {tg.avgCorrectPct !== null ? (
                    <Badge
                      variant={
                        tg.avgCorrectPct < 50
                          ? "destructive"
                          : tg.avgCorrectPct < 70
                            ? "secondary"
                            : "default"
                      }
                    >
                      {t("correctPercent", { count: tg.avgCorrectPct })}
                    </Badge>
                  ) : (
                    <Badge variant="outline">{tc("noData")}</Badge>
                  )}
                </div>
                <CardDescription>
                  {tg.quizCount} {tg.quizCount === 1 ? "quiz" : "quiz"} &middot;{" "}
                  {tg.totalSessions} {tg.totalSessions === 1 ? "sessione" : "sessioni"} &middot;{" "}
                  {tc("answers", { count: tg.totalAnswers })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Progress bar */}
                {tg.avgCorrectPct !== null && (
                  <div className="w-full bg-muted rounded-full h-2.5 mb-3">
                    <div
                      className={`h-2.5 rounded-full ${getBarColor(tg.avgCorrectPct)}`}
                      style={{ width: `${tg.avgCorrectPct}%` }}
                    />
                  </div>
                )}
                <div className="text-sm">
                  <span className="font-medium">{t("quizLabel", { titles: tg.quizTitles.slice(0, 3).join(", ") })}</span>
                  {tg.quizTitles.length > 3 && ` (+${tg.quizTitles.length - 3})`}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {quizzesWithoutTags > 0 && (
        <p className="text-sm text-muted-foreground">
          {t("untaggedQuizzes", { count: quizzesWithoutTags })}
        </p>
      )}
    </div>
  );
}
