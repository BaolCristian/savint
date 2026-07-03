import { redirect } from "next/navigation";
import { getHubSessionFromCookies } from "@/lib/auth/hub-session";
import { AdminTabs } from "./admin-tabs";

export const dynamic = "force-dynamic";

export default async function AdminHubLayout({ children }: { children: React.ReactNode }) {
  const account = await getHubSessionFromCookies();
  if (!account) redirect("/hub-login?next=/admin/hub/affiliations");
  if (account.role !== "HUB_ADMIN") redirect("/");

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6">
      <AdminTabs />
      {children}
    </div>
  );
}
