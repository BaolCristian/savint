import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";

export const dynamic = "force-dynamic";

export default async function AdminHubLayout({ children }: { children: React.ReactNode }) {
  const account = await getHubSessionFromCookies();
  if (!account) redirect("/hub-login?next=/admin/hub/affiliations");
  if (account.role !== "HUB_ADMIN") redirect("/");
  const t = await getTranslations("hub.adminNav");

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <nav className="mb-6 flex gap-2">
        <Link href="/admin/hub/affiliations" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-brand-blue-50 hover:text-brand-blue">
          {t("affiliations")}
        </Link>
        <Link href="/admin/hub/reports" className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-brand-blue-50 hover:text-brand-blue">
          {t("reports")}
        </Link>
      </nav>
      {children}
    </div>
  );
}
