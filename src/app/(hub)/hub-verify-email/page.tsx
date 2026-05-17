import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { isHubMode } from "@/lib/config/savint-mode";

export default async function VerifyEmailSentPage() {
  if (!isHubMode()) redirect("/login");
  const t = await getTranslations("hubAuth");
  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("checkInboxTitle")}</h1>
        <p className="mt-3 text-sm text-gray-700">{t("checkInboxBody")}</p>
        <p className="mt-4">
          <a href="/hub-login" className="text-blue-700 underline">{t("backToLogin")}</a>
        </p>
      </div>
    </div>
  );
}
