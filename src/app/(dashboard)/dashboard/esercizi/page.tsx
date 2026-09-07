import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Users, FolderOpen, Layers, ClipboardCheck, Pencil } from "lucide-react";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { prisma } from "@/lib/db/client";
import { Card } from "@/components/ui/card";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi");

  const esercizi = await prisma.esercizio.findMany({
    orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });

  const sezioni = [
    { href: "/dashboard/esercizi/classi", label: t("navClassi"), icon: Users },
    { href: "/dashboard/esercizi/contenitori", label: t("navContenitori"), icon: FolderOpen },
    { href: "/dashboard/esercizi/batterie", label: t("navBatterie"), icon: Layers },
    { href: "/dashboard/esercizi/compiti", label: t("navCompiti"), icon: ClipboardCheck },
    { href: "/dashboard/esercizi/redazione", label: t("navRedazione"), icon: Pencil },
  ];

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{t("titoloDocente")}</h1>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sezioni.map((s) => (
          <li key={s.href}>
            <Link href={s.href}>
              <Card className="items-center gap-2 p-4 text-center transition hover:bg-muted/50">
                <s.icon className="mx-auto h-5 w-5 text-brand-blue" />
                <p className="font-medium">{s.label}</p>
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      {esercizi.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nessunEsercizio")}</p>
      ) : (
        <ul className="grid gap-3">
          {esercizi.map((e) => (
            <li key={e.id}>
              {/* `Card` fissa `flex flex-col`: senza `flex-row` la classe
                  `items-center justify-between` passata qui sopravvive alla
                  fusione ma agisce sull'asse sbagliato, e ogni riga finisce
                  centrata con i bordi sinistri sfrangiati. */}
              <Card className="flex-row items-center justify-between p-4">
                <div>
                  <p className="font-medium">{e.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("annoArgomento", { anno: e.yearLevel, argomento: e.topic })}
                    {" · "}
                    {t("difficolta", { livello: e.difficulty })}
                    {" · "}
                    {t("versione", { numero: e.versions[0]?.version ?? 0 })}
                  </p>
                </div>
                <code className="rounded bg-muted px-2 py-1 text-sm">/studente/esercizio/{e.id}</code>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
