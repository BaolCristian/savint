import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
import AffiliationActions from "./affiliation-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const account = await getHubSessionFromCookies();
  if (!account) redirect("/hub-login?next=/admin/hub/affiliations");
  if (account.role !== "HUB_ADMIN") redirect("/");

  const t = await getTranslations("affiliation");

  const requests = await prisma.affiliationRequest.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">{t("adminTitle")}</h1>

      {requests.length === 0 ? (
        <p className="text-slate-500">{t("adminNoRequests")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t("adminSchoolName")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t("adminProvince")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t("adminUrl")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t("adminEmail")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t("adminDate")}</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">{t("adminActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {requests.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}</td>
                  <td className="px-4 py-3 text-slate-600">{r.province}</td>
                  <td className="px-4 py-3">
                    <a
                      href={r.installationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:underline break-all"
                    >
                      {r.installationUrl}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.contactEmail}</td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {r.createdAt.toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-4 py-3">
                    <AffiliationActions id={r.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
