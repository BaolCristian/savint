import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DashboardSidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="flex h-screen">
      <DashboardSidebar user={session.user} />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  );
}
