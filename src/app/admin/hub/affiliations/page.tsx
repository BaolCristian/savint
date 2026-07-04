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

  // "Scuole collegate" = le installazioni reali. Alcune scuole sono collegate via
  // script (senza AffiliationRequest), quindi la lista è guidata da Installation;
  // la richiesta collegata, quando c'è, fornisce la provincia.
  const [installations, pending, history] = await Promise.all([
    prisma.installation.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.affiliationRequest.findMany({ where: { status: "PENDING_REVIEW" }, orderBy: { createdAt: "asc" } }),
    prisma.affiliationRequest.findMany({ where: { status: { in: ["APPROVED", "REJECTED"] } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const linkedReqs = await prisma.affiliationRequest.findMany({
    where: { installationId: { in: installations.map((i) => i.id) } },
  });
  const reqByInst = new Map(linkedReqs.filter((r) => r.installationId).map((r) => [r.installationId as string, r]));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-black text-slate-900">{t("title")}</h1>

      {/* Scuole collegate */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-slate-900">{t("connectedTitle")} ({installations.length})</h2>
        {installations.length === 0 ? <p className="text-slate-500">{t("none")}</p> : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t("colSchool"), t("colProvince"), t("colStatus"), t("colLastSeen"), t("colConnectedAt"), t("colActions")].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-slate-600">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {installations.map((inst) => {
                  const active = inst.status === "ACTIVE";
                  const rq = reqByInst.get(inst.id);
                  return (
                    <tr key={inst.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800">{inst.name}<div className="text-xs text-slate-400">{inst.contactEmail}</div></td>
                      <td className="px-4 py-3 text-slate-600">{rq?.province ?? "—"}</td>
                      <td className="px-4 py-3">{active ? <Badge tone="green">{t("statusActive")}</Badge> : <Badge tone="slate">{t("statusDisabled")}</Badge>}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(inst.lastSeenAt)}</td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{fmt(inst.createdAt)}</td>
                      <td className="px-4 py-3"><InstallationActions installationId={inst.id} active={active} schoolName={inst.name} /></td>
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
                    <td className="px-4 py-3"><AffiliationActions id={r.id} schoolName={r.schoolName} /></td>
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
                    <td className="px-4 py-3"><ConfirmDelete deleteUrl={`/api/hub/admin/affiliations/${r.id}`} label={r.schoolName} /></td>
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
