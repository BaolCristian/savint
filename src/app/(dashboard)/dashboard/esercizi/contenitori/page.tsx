import { getTranslations } from "next-intl/server";
import { redirectUnlessTeacher } from "@/lib/auth/require-role";
import { elencoContenitori } from "@/lib/esercizi/contenitori";
import { ContenitoriClient } from "./contenitori-client";

export default async function Page() {
  await redirectUnlessTeacher();
  const t = await getTranslations("esercizi.contenitori");

  const contenitori = await elencoContenitori();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{t("titolo")}</h1>
      <p className="text-sm text-muted-foreground">{t("descrizione")}</p>

      <ContenitoriClient
        contenitori={contenitori.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          eserciziLabel: t("eserciziCount", { n: c.esercizi }),
        }))}
        testi={{
          nome: t("nome"),
          descrizioneCampo: t("descrizioneCampo"),
          crea: t("crea"),
          elimina: t("elimina"),
          erroreInUso: t("erroreInUso"),
          erroreGenerico: t("erroreGenerico"),
        }}
      />
      {contenitori.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("nessunContenitore")}</p>
      )}
    </div>
  );
}
