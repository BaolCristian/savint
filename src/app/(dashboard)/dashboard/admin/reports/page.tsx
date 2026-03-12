import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { ReportsClient } from "@/components/admin/reports-client";

export default async function AdminReportsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Segnalazioni</h1>
        <p className="text-muted-foreground">
          Gestisci le segnalazioni di contenuti da parte degli utenti.
        </p>
      </div>
      <ReportsClient />
    </div>
  );
}
