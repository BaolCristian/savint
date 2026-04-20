import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { Badge } from "@/components/ui/badge";
import { getTranslations } from "next-intl/server";

export default async function DashboardHome() {
  const t = await getTranslations("dashboard");
  const tc = await getTranslations("common");
  const session = await auth();
  const userId = session!.user!.id!;

  const [quizCount, sessionCount, studentsResult] = await Promise.all([
    prisma.quiz.count({ where: { authorId: userId } }),
    prisma.session.count({ where: { hostId: userId, isTest: false } }),
    prisma.answer.findMany({
      where: { session: { hostId: userId, isTest: false } },
      select: { playerName: true },
      distinct: ["playerName"],
    }),
  ]);

  const allAnswers = await prisma.answer.findMany({
    where: { session: { hostId: userId, isTest: false } },
    select: { isCorrect: true },
  });
  const totalAnswers = allAnswers.length;
  const correctAnswers = allAnswers.filter((a) => a.isCorrect).length;
  const correctnessRate =
    totalAnswers > 0 ? Math.round((correctAnswers / totalAnswers) * 100) : 0;

  const studentCount = studentsResult.length;

  const [recentSessions, recentQuizzes] = await Promise.all([
    prisma.session.findMany({
      where: { hostId: userId, isTest: false },
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
    LOBBY: t("lobby"),
    IN_PROGRESS: t("inProgress"),
    FINISHED: t("finished"),
  };

  const statusColors: Record<string, string> = {
    LOBBY: "bg-amber-100 text-amber-700 border-amber-200",
    IN_PROGRESS: "bg-blue-100 text-blue-700 border-blue-200",
    FINISHED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  const stats = [
    { label: t("quizzesCreated"), value: quizCount, icon: "\u{1F4DD}", color: "from-indigo-500 to-purple-600", bg: "bg-indigo-50 border-indigo-100 dark:bg-indigo-950 dark:border-indigo-800" },
    { label: t("sessionsPlayed"), value: sessionCount, icon: "\u{1F3AE}", color: "from-emerald-500 to-teal-600", bg: "bg-emerald-50 border-emerald-100 dark:bg-emerald-950 dark:border-emerald-800" },
    { label: t("totalStudents"), value: studentCount, icon: "\u{1F465}", color: "from-amber-500 to-orange-600", bg: "bg-amber-50 border-amber-100 dark:bg-amber-950 dark:border-amber-800" },
    { label: t("avgCorrectness"), value: `${correctnessRate}%`, icon: "\u{1F3AF}", color: "from-rose-500 to-pink-600", bg: "bg-rose-50 border-rose-100 dark:bg-rose-950 dark:border-rose-800" },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">{t("title")}</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">{t("welcome", { name: session!.user!.name || "Docente" })}</p>
      </div>

      {/* Quick Stats */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className={`${stat.bg} border rounded-2xl p-5 transition-shadow hover:shadow-md`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{stat.label}</span>
              <span className="text-2xl">{stat.icon}</span>
            </div>
            <p className="text-4xl font-black text-slate-900 dark:text-white">{stat.value}</p>
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Sessions */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">{"\u{1F3AE}"}</span>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{t("recentSessions")}</h2>
            </div>
            <Link href="/dashboard/sessions" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
              {t("viewAll")}
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {recentSessions.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="text-4xl block mb-2">{"\u{1F3B2}"}</span>
                <p className="text-slate-500">{t("noSessionsYet")}</p>
                <p className="text-sm text-slate-400 mt-1">{t("startFirstQuiz")}</p>
              </div>
            ) : (
              recentSessions.map((s) => (
                <Link key={s.id} href={`/dashboard/sessions/${s.id}`} className="block">
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{s.quiz.title}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t("students", { count: playerCountMap[s.id] ?? 0 })} · {s.createdAt.toLocaleDateString("it-IT", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${statusColors[s.status]}`}>
                      {statusLabels[s.status]}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* Recent Quizzes */}
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xl">{"\u{1F4DD}"}</span>
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200">{t("recentQuizzes")}</h2>
            </div>
            <Link href="/dashboard/quiz" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
              {t("viewAllQuizzes")}
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {recentQuizzes.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <span className="text-4xl block mb-2">{"\u{1F4DA}"}</span>
                <p className="text-slate-500">{t("noQuizzesYet")}</p>
                <Link href="/dashboard/quiz/new" className="text-sm text-indigo-600 font-semibold hover:underline mt-1 block">
                  {t("createFirstQuiz")}
                </Link>
              </div>
            ) : (
              recentQuizzes.map((q) => (
                <Link key={q.id} href={`/dashboard/quiz/${q.id}/edit`} className="block">
                  <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    <div className="space-y-0.5">
                      <p className="font-semibold text-slate-800 dark:text-slate-200">{q.title}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {tc("questions", { count: q._count.questions })}
                      </p>
                    </div>
                    <span className="text-slate-400 text-sm">{"\u2192"}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
