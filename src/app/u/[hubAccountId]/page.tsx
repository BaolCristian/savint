import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ hubAccountId: string }> }) {
  const { hubAccountId } = await params;
  const a = await prisma.hubAccount.findUnique({
    where: { id: hubAccountId },
    include: {
      quizzes: {
        where: { suspended: false, unpublishedAt: null },
        orderBy: { publishedAt: "desc" },
      },
    },
  });
  if (!a || a.bannedAt) notFound();

  const displayName = a.name ?? a.email.split("@")[0];

  return (
    <div className="min-h-dvh bg-gradient-to-br from-indigo-50 via-white to-violet-50">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900">{displayName}</h1>
          {a.affiliation && <p className="text-slate-600">{a.affiliation}</p>}
        </header>
        <section>
          <h2 className="text-lg font-bold mb-3">Published quizzes ({a.quizzes.length})</h2>
          <ul className="space-y-2">
            {a.quizzes.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/q/${q.id}`}
                  className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-indigo-300"
                >
                  <p className="font-bold text-slate-900">{q.title}</p>
                  <p className="text-sm text-slate-600 line-clamp-2">{q.description}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
