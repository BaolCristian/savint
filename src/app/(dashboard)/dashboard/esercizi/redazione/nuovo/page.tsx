import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { NuovoEsercizioClient } from "./nuovo-esercizio-client";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.redazione.elenco");

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Link href="/dashboard/esercizi/redazione" className="text-sm text-brand-blue hover:underline">
        {t("torna")}
      </Link>
      <NuovoEsercizioClient />
    </div>
  );
}
