import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchHubQuizDetail } from "@/lib/hub/hub-client";
import { CloneButton } from "@/components/hub/clone-button";
import { ArrowLeft, ExternalLink, Globe } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HubDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const th = await getTranslations("hub");
  const tc = await getTranslations("common");

  // Public quiz page on savint.it (where you can preview/try it before cloning).
  const hubUrl = process.env.SAVINT_HUB_URL;
  const hubQuizUrl = hubUrl ? `${hubUrl.replace(/\/$/, "")}/q/${id}` : null;

  let quiz: Record<string, unknown>;
  try {
    quiz = await fetchHubQuizDetail(id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("404") || msg.includes("hub_http_404")) notFound();
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <p className="text-red-600 dark:text-red-400">{th("hubUnreachable")}</p>
        <Link href="/dashboard/hub" className="mt-4 inline-block text-indigo-600 hover:underline">
          {th("backToCatalog")}
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

  const pill =
    "rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Link
        href="/dashboard/hub"
        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> {th("backToCatalog")}
      </Link>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 shadow-sm">
        <span className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
          <Globe className="h-3.5 w-3.5" />
          savint.it
        </span>

        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{title}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {th("by", { author })} · {th("version", { n: String(version) })}
        </p>

        {description && (
          <p className="mt-4 text-slate-700 dark:text-slate-300">{description}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className={pill}>{tc("questions", { count: questionCount })}</span>
          <span className={pill}>{th("downloads", { count: downloadsCount })}</span>
          <span className={pill}>{th("plays", { count: playsCount })}</span>
          {schoolLevel && <span className={pill}>{schoolLevel}</span>}
          {subject && <span className={pill}>{subject}</span>}
          {language && <span className={pill}>{language.toUpperCase()}</span>}
        </div>

        {license && (
          <p className="mt-3 text-xs text-slate-400">{th("license", { license })}</p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          {hubQuizUrl && (
            <a
              href={hubQuizUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 transition-colors hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900"
            >
              <ExternalLink className="h-4 w-4" />
              {th("viewOnSavint")}
            </a>
          )}
          <CloneButton hubQuizId={id} />
        </div>
      </div>
    </div>
  );
}
