import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchHubQuizDetail } from "@/lib/hub/hub-client";
import { CloneButton } from "@/components/hub/clone-button";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HubDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const th = await getTranslations("hub");

  let quiz: Record<string, unknown>;
  try {
    quiz = await fetchHubQuizDetail(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404") || msg.includes("hub_http_404")) notFound();
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-red-600 dark:text-red-400">
          Hub not reachable. Please try again later.
        </p>
        <Link href="/dashboard/hub" className="mt-4 inline-block text-indigo-600 hover:underline">
          Back to catalog
        </Link>
      </div>
    );
  }

  const title = String(quiz.title ?? "");
  const description = quiz.description ? String(quiz.description) : null;
  const author = String(quiz.author ?? "");
  const questionCount = Number(quiz.questionCount ?? 0);
  const downloadsCount = Number(quiz.downloadsCount ?? 0);
  const playsCount = Number(quiz.playsCount ?? 0);
  const version = Number(quiz.version ?? 1);
  const license = String(quiz.license ?? "");
  const subject = quiz.subject ? String(quiz.subject) : null;
  const language = quiz.language ? String(quiz.language) : null;
  const schoolLevel = quiz.schoolLevel ? String(quiz.schoolLevel) : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/dashboard/hub"
        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        ← Back to catalog
      </Link>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {th("by", { author })} · {th("version", { n: String(version) })}
            </p>
          </div>
        </div>

        {description && (
          <p className="mt-4 text-slate-700 dark:text-slate-300">{description}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>{questionCount} questions</span>
          <span>·</span>
          <span>{downloadsCount} clones</span>
          <span>·</span>
          <span>{playsCount} plays</span>
          {license && <span>· {th("license", { license })}</span>}
          {schoolLevel && <span>· {schoolLevel}</span>}
          {subject && <span>· {subject}</span>}
          {language && <span>· {language.toUpperCase()}</span>}
        </div>

        <div className="mt-6">
          <CloneButton hubQuizId={id} />
        </div>
      </div>
    </div>
  );
}
