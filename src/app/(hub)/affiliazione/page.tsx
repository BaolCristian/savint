import { getTranslations } from "next-intl/server";
import AffiliationForm from "./affiliation-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ verified?: string; error?: string }>;
}) {
  const t = await getTranslations("affiliation");
  const sp = await searchParams;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 via-white to-white">
      <div className="mx-auto max-w-2xl px-4 py-16 space-y-8">
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold text-slate-900">{t("pageTitle")}</h1>
          <p className="text-slate-600">{t("pageSubtitle")}</p>
        </div>

        <AffiliationForm verified={sp.verified === "1"} />
      </div>
    </div>
  );
}
