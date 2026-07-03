import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
import { PromoteForm, DemoteButton } from "./admin-account-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const t = await getTranslations("adminAccounts");
  // The admin layout already guarantees a HUB_ADMIN session; used here to hide
  // the "remove admin" action on the current user's own row.
  const me = await getHubSessionFromCookies();
  const admins = await prisma.hubAccount.findMany({
    where: { role: "HUB_ADMIN" },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true },
  });

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-slate-900">{t("title")}</h1>

      {/* Promuovi */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("promoteTitle")}</h2>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm max-w-xl">
          <PromoteForm />
        </div>
      </section>

      {/* Amministratori attuali */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("currentAdminsTitle")} ({admins.length})</h2>
        {admins.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colName"), t("colEmail"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {admins.map((a) => {
                  const isSelf = a.id === me?.id;
                  return (
                    <tr key={a.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {a.name ?? "—"}
                        {isSelf && <span className="ml-1.5 text-xs font-normal text-brand-blue">{t("you")}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{a.email}</td>
                      <td className="px-4 py-3">
                        {isSelf ? <span className="text-xs text-slate-400">—</span> : <DemoteButton id={a.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
