import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { PlayQuizButton } from "@/components/quiz/play-button";
import { ImportQuizButton } from "@/components/quiz/import-button";

const CARD_STYLES = [
  { bg: "bg-blue-50", accent: "bg-blue-600", tag: "bg-blue-100 text-blue-700" },
  { bg: "bg-purple-50", accent: "bg-purple-600", tag: "bg-purple-100 text-purple-700" },
  { bg: "bg-teal-50", accent: "bg-teal-600", tag: "bg-teal-100 text-teal-700" },
  { bg: "bg-rose-50", accent: "bg-rose-600", tag: "bg-rose-100 text-rose-700" },
  { bg: "bg-amber-50", accent: "bg-amber-600", tag: "bg-amber-100 text-amber-700" },
  { bg: "bg-emerald-50", accent: "bg-emerald-600", tag: "bg-emerald-100 text-emerald-700" },
  { bg: "bg-orange-50", accent: "bg-orange-600", tag: "bg-orange-100 text-orange-700" },
  { bg: "bg-cyan-50", accent: "bg-cyan-600", tag: "bg-cyan-100 text-cyan-700" },
];

export default async function QuizListPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const quizzes = await prisma.quiz.findMany({
    where: {
      OR: [
        { authorId: userId },
        { shares: { some: { sharedWithId: userId } } },
      ],
    },
    include: {
      _count: { select: { questions: true, sessions: true } },
      author: { select: { name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const myQuizzes = quizzes.filter((q) => q.authorId === userId);
  const sharedQuizzes = quizzes.filter((q) => q.authorId !== userId);

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">I miei Quiz</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{quizzes.length} quiz in libreria</p>
        </div>
        <div className="flex gap-3">
          <ImportQuizButton />
          <Link href="/dashboard/quiz/new">
            <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-full transition-all shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300 active:scale-[0.97]">
              <span className="text-lg leading-none">+</span>
              Nuovo Quiz
            </button>
          </Link>
        </div>
      </div>

      {quizzes.length === 0 ? (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-16 text-center">
          <span className="text-7xl block mb-4">📚</span>
          <h2 className="text-2xl font-bold text-slate-700 mb-2">La libreria è vuota</h2>
          <p className="text-slate-500 mb-8 max-w-md mx-auto">Crea il tuo primo quiz interattivo o importa un file .qlz da un collega</p>
          <div className="flex justify-center gap-3">
            <ImportQuizButton />
            <Link href="/dashboard/quiz/new">
              <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-full transition-colors shadow-md shadow-indigo-200">
                Crea Quiz
              </button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {myQuizzes.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Creati da me</h2>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{myQuizzes.length}</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {myQuizzes.map((quiz, i) => (
                  <QuizCard key={quiz.id} quiz={quiz} style={CARD_STYLES[i % CARD_STYLES.length]} isOwner />
                ))}
              </div>
            </section>
          )}

          {sharedQuizzes.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200">Condivisi con me</h2>
                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full">{sharedQuizzes.length}</span>
              </div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {sharedQuizzes.map((quiz, i) => (
                  <QuizCard key={quiz.id} quiz={quiz} style={CARD_STYLES[(i + 3) % CARD_STYLES.length]} isOwner={false} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function QuizCard({
  quiz,
  style,
  isOwner,
}: {
  quiz: {
    id: string;
    title: string;
    tags: string[];
    authorId: string;
    _count: { questions: number; sessions: number };
    author: { name: string | null };
  };
  style: { bg: string; accent: string; tag: string };
  isOwner: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-sm hover:shadow-lg border border-slate-100 dark:border-slate-700 transition-all overflow-hidden group">
      {/* Colored top band */}
      <div className={`${style.bg} dark:opacity-90 px-6 pt-5 pb-4`}>
        <Link href={`/dashboard/quiz/${quiz.id}/edit`}>
          <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-700 transition-colors line-clamp-2 leading-snug">
            {quiz.title}
          </h3>
        </Link>
        {!isOwner && (
          <p className="text-xs text-slate-500 mt-1.5">di {quiz.author.name}</p>
        )}
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Stats chips */}
        <div className="flex gap-3">
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
            <span className={`w-2 h-2 rounded-full ${style.accent}`} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{quiz._count.questions} domande</span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 rounded-full px-3 py-1">
            <span className={`w-2 h-2 rounded-full ${style.accent}`} />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{quiz._count.sessions}x giocato</span>
          </div>
        </div>

        {/* Tags */}
        {quiz.tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {quiz.tags.map((tag) => (
              <span key={tag} className={`${style.tag} text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
          <PlayQuizButton quizId={quiz.id} />

          <Link
            href={`/dashboard/quiz/${quiz.id}/edit`}
            className="text-sm font-semibold text-slate-500 hover:text-slate-800 px-3 py-1.5 rounded-full hover:bg-slate-100 transition-colors"
          >
            Modifica
          </Link>

          {quiz._count.sessions > 0 && (
            <Link
              href={`/dashboard/quiz/${quiz.id}/stats`}
              className="text-sm font-semibold text-slate-500 hover:text-amber-700 px-3 py-1.5 rounded-full hover:bg-amber-50 transition-colors"
            >
              Stats
            </Link>
          )}

          <a
            href={`/api/quiz/${quiz.id}/export`}
            download
            className="ml-auto text-slate-400 hover:text-indigo-600 p-2 rounded-full hover:bg-indigo-50 transition-colors"
            title="Esporta .qlz"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>
      </div>
    </div>
  );
}
