import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <DashboardThemeProvider>
      <TermsGuard>
        <div className="flex h-screen flex-col md:flex-row bg-slate-50 dark:bg-slate-950">
          <DashboardSidebar user={session.user} />
          <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
        </div>
      </TermsGuard>
    </DashboardThemeProvider>
  );
}
