import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardThemeProvider } from "@/components/dashboard/theme-provider";
import { TermsGuard } from "@/components/legal/terms-guard";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await redirectUnlessTeacher();

  return (
    <DashboardThemeProvider>
      <TermsGuard>
        {/* `text-foreground` qui, non solo lo sfondo. La classe `dark` la mette
            DashboardThemeProvider su un div DENTRO il body, e il body ha gia'
            calcolato il proprio colore dalla variabile in tema chiaro: tutto
            cio' che sta dentro eredita quel valore calcolato, non la
            variabile. Risultato, in tema scuro: sfondo nero e testo nero, e
            ogni etichetta senza un colore esplicito diventava invisibile.
            Dichiararlo qui lo fa risolvere di nuovo nel contesto scuro, per
            tutte le pagine del cruscotto insieme. */}
        <div className="flex h-screen flex-col md:flex-row bg-slate-50 text-foreground dark:bg-slate-950">
          <DashboardSidebar user={session.user} hubEnabled={Boolean(process.env.SAVINT_HUB_URL)} />
          <main className="flex-1 overflow-auto p-4 md:p-8">{children}</main>
        </div>
      </TermsGuard>
    </DashboardThemeProvider>
  );
}
