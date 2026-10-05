import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { StudentHeader } from "@/components/student/student-header";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "STUDENT") redirect("/dashboard");

  return (
    <div className="min-h-dvh bg-slate-50">
      <StudentHeader name={session.user.name ?? session.user.email ?? ""} />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 md:py-10">{children}</main>
    </div>
  );
}
