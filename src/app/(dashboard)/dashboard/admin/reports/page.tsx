import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { ReportsClient } from "@/components/admin/reports-client";
import { getTranslations } from "next-intl/server";

export default async function AdminReportsPage() {
  const t = await getTranslations("admin");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("reports")}</h1>
        <p className="text-muted-foreground">
          {t("reportsDescription")}
        </p>
      </div>
      <ReportsClient />
    </div>
  );
}
