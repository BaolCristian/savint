/** Le pagine da stampare: niente menu, foglio bianco largo come un A4. */
export default function StampaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-slate-100 text-slate-900 print:bg-white">
      <style>{"@page { size: A4; margin: 15mm; } @media print { html, body { background: white !important; } }"}</style>
      <main className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">{children}</main>
    </div>
  );
}
