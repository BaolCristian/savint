import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Play } from "lucide-react";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOBBY: "outline",
  IN_PROGRESS: "default",
  FINISHED: "secondary",
};

const statusLabel: Record<string, string> = {
  LOBBY: "Lobby",
  IN_PROGRESS: "In corso",
  FINISHED: "Terminata",
};

export default async function SessionsListPage() {
  const session = await auth();

  const sessions = await prisma.session.findMany({
    where: { hostId: session!.user!.id },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-6">Le mie sessioni</h1>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground">
          Nessuna sessione ancora. Avvia un quiz per creare una sessione!
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
            <Link key={s.id} href={`/dashboard/sessions/${s.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{s.quiz.title}</CardTitle>
                    <Badge variant={statusVariant[s.status]}>
                      {statusLabel[s.status]}
                    </Badge>
                  </div>
                  <CardDescription>
                    PIN: {s.pin} &middot;{" "}
                    {s.createdAt.toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {s._count.answers} risposte
                  </p>
                  {(s.status === "LOBBY" || s.status === "IN_PROGRESS") && (
                    <a
                      href={`/savint/live/host/${s.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                    >
                      <Play className="size-3.5" />
                      Rientra nella sessione
                    </a>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
