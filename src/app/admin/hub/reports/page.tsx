import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
import { HubReportsClient } from "@/components/admin/hub/hub-reports-client";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Adapted spec: getHubSessionFromCookies returns the full HubAccount row or null.
  const account = await getHubSessionFromCookies();
  if (!account) redirect("/hub-login?next=/admin/hub/reports");
  if (account.role !== "HUB_ADMIN") redirect("/");

  const t = await getTranslations("hub.admin");

  const reports = await prisma.hubReport.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: {
      hubQuiz: {
        include: {
          hubAccount: { select: { id: true, name: true, email: true } },
        },
      },
      reporterAccount: { select: { id: true, name: true, email: true } },
    },
    take: 100,
  });

  const counts = await Promise.all(
    reports.map((r) =>
      prisma.hubReport.count({
        where: { hubQuizId: r.hubQuizId, NOT: { id: r.id } },
      }),
    ),
  );

  const enriched = reports.map((r, i) => ({
    id: r.id,
    reason: r.reason,
    description: r.description,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    reporter: r.reporterAccount,
    hubQuiz: {
      id: r.hubQuiz.id,
      title: r.hubQuiz.title,
      hubAccount: r.hubQuiz.hubAccount,
    },
    otherReportsCount: counts[i],
  }));

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <HubReportsClient initialReports={enriched} />
    </div>
  );
}
