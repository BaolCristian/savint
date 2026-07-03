import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db/client";
import AffiliationActions from "./affiliation-actions";
import { InstallationActions } from "./installation-actions";
import { ConfirmDelete } from "./confirm-delete";

export const dynamic = "force-dynamic";

function Badge({ tone, children }: { tone: "green" | "slate" | "orange" | "red"; children: React.ReactNode }) {
  const cls = {
    green: "bg-brand-green-50 text-brand-green",
    slate: "bg-slate-100 text-slate-600",
    orange: "bg-brand-orange-50 text-brand-orange",
    red: "bg-red-50 text-red-600",
  }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{children}</span>;
}

export default async function Page() {
  const t = await getTranslations("adminAffiliations");
  const fmt = (d: Date | null) => (d ? d.toLocaleDateString("it-IT") : t("never"));

  const [redeemed, pending, history] = await Promise.all([
    prisma.affiliationRequest.findMany({ where: { status: "REDEEMED" }, orderBy: { redeemedAt: "desc" } }),
    prisma.affiliationRequest.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" } }),
    prisma.affiliationRequest.findMany({ where: { status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const instIds = redeemed.map((r) => r.installationId).filter((x): x is string => Boolean(x));
  const installations = await prisma.installation.findMany({ where: { id: { in: instIds } } });
  const instById = new Map(installations.map((i) => [i.id, i]));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-slate-900">{t("title")}</h1>

      {/* Scuole collegate */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("connectedTitle")} ({redeemed.length})</h2>
        {redeemed.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colStatus"), t("colLastSeen"), t("colConnectedAt"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {redeemed.map((r) => {
                  const inst = r.installationId ? instById.get(r.installationId) : undefined;
                  const active = inst?.status === "ACTIVE";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}<div className="text-xs text-slate-400">{r.contactEmail}</div></td>
                      <td className="px-4 py-3 text-slate-600">{r.province}</td>
                      <td className="px-4 py-3">{active ? <Badge tone="green">{t("statusActive")}</Badge> : <Badge tone="slate">{t("statusDisabled")}</Badge>}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(inst?.lastSeenAt ?? null)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(r.redeemedAt)}</td>
                      <td className="px-4 py-3">
                        {inst ? <InstallationActions affiliationId={r.id} installationId={inst.id} active={active} /> : <ConfirmDelete affiliationId={r.id} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Richieste in attesa */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("pendingTitle")} ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colUrl"), t("colDate"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {pending.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}<div className="text-xs text-slate-400">{r.contactEmail}</div></td>
                    <td className="px-4 py-3 text-slate-600">{r.province}</td>
                    <td className="px-4 py-3"><a href={r.installationUrl} target="_blank" rel="noopener noreferrer" className="text-brand-blue hover:underline break-all">{r.installationUrl}</a></td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(r.createdAt)}</td>
                    <td className="px-4 py-3"><AffiliationActions id={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Storico */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("historyTitle")} ({history.length})</h2>
        {history.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colStatus"), t("colDetail"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.schoolName}<div className="text-xs text-slate-400">{r.contactEmail}</div></td>
                    <td className="px-4 py-3 text-slate-600">{r.province}</td>
                    <td className="px-4 py-3">{r.status === "APPROVED" ? <Badge tone="orange">{t("statusApproved")}</Badge> : <Badge tone="red">{t("statusRejected")}</Badge>}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {r.status === "APPROVED" && r.setupCodeExpiresAt ? t("codeExpires", { date: fmt(r.setupCodeExpiresAt) })
                        : r.status === "REJECTED" && r.rejectionReason ? t("rejectedReason", { reason: r.rejectionReason }) : "—"}
                    </td>
                    <td className="px-4 py-3"><ConfirmDelete affiliationId={r.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
