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
import { TerminateButton } from "@/components/session/terminate-button";
import { DeleteSessionButton } from "@/components/session/delete-session-button";
import { getTranslations } from "next-intl/server";

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  LOBBY: "outline",
  IN_PROGRESS: "default",
  FINISHED: "secondary",
};

export default async function SessionsListPage() {
  const t = await getTranslations("sessions");
  const tc = await getTranslations("common");
  const session = await auth();

  const sessions = await prisma.session.findMany({
    where: { hostId: session!.user!.id, isTest: false },
    include: {
      quiz: { select: { title: true } },
      _count: { select: { answers: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const statusLabel: Record<string, string> = {
    LOBBY: t("lobby"),
    IN_PROGRESS: t("inProgress"),
    FINISHED: t("finished"),
  };

  return (
    <div className="max-w-6xl mx-auto">
      <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mb-6">{t("mySessions")}</h1>

      {sessions.length === 0 ? (
        <p className="text-muted-foreground">
          {t("noSessions")}
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
                    {t("pin", { pin: s.pin })} &middot;{" "}
                    {s.createdAt.toLocaleDateString("it-IT", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {tc("answers", { count: s._count.answers })}
                  </p>
                  <div className="flex items-center gap-3">
                    {(s.status === "LOBBY" || s.status === "IN_PROGRESS") && (
                      <>
                        <a
                          href={`/savint/live/host/${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                        >
                          <Play className="size-3.5" />
                          {t("rejoin")}
                        </a>
                        <TerminateButton sessionId={s.id} />
                      </>
                    )}
                    <DeleteSessionButton sessionId={s.id} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
