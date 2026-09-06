import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { contenutoContenitore } from "@/lib/esercizi/contenitori";
import { prisma } from "@/lib/db/client";
import { ContenitoreDetailClient } from "./contenitore-detail-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.contenitori");
  const tBase = await getTranslations("esercizi");

  const { id } = await params;
  const contenitore = await contenutoContenitore(id);
  if (!contenitore) notFound();

  const dentroIds = contenitore.esercizi.map((e) => e.id);
  // Chi può ancora entrare: tutti gli esercizi del bacino, tranne chi c'è già.
  const disponibili = await prisma.esercizio.findMany({
    where: dentroIds.length > 0 ? { id: { notIn: dentroIds } } : undefined,
    orderBy: [{ yearLevel: "asc" }, { title: "asc" }],
  });

  const sottotitolo = (e: { yearLevel: number; topic: string; difficulty: number }) =>
    `${tBase("annoArgomento", { anno: e.yearLevel, argomento: e.topic })} · ${tBase("difficolta", { livello: e.difficulty })}`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/esercizi/contenitori" className="text-sm text-brand-blue hover:underline">
          {t("torna")}
        </Link>
        <h1 className="text-2xl font-semibold">{contenitore.name}</h1>
        {contenitore.description && (
          <p className="text-sm text-muted-foreground">{contenitore.description}</p>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{t("eserciziNelContenitore")}</h2>
      </div>

      <ContenitoreDetailClient
        contenitoreId={id}
        dentro={contenitore.esercizi.map((e) => ({ id: e.id, title: e.title, subtitle: sottotitolo(e) }))}
        fuori={disponibili.map((e) => ({ id: e.id, title: e.title, subtitle: sottotitolo(e) }))}
        testi={{
          nessunoDentro: t("nessunEsercizioNelContenitore"),
          rimuovi: t("rimuovi"),
          titoloAggiungi: t("aggiungiEsercizi"),
          nessunoFuori: t("nessunEsercizioDaAggiungere"),
          aggiungi: t("aggiungi"),
          erroreGenerico: t("erroreGenerico"),
        }}
      />
    </div>
  );
}
