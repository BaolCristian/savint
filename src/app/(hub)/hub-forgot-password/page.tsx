import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { isHubMode } from "@/lib/config/savint-mode";
import { requestPasswordReset } from "./actions";

export default async function HubForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  if (!isHubMode()) redirect("/login");
  const t = await getTranslations("hubAuth");
  const { sent } = await searchParams;

  async function action(formData: FormData) {
    "use server";
    const locale = (await getLocale()) as "it" | "en";
    await requestPasswordReset({
      email: String(formData.get("email") ?? ""),
      locale: locale === "en" ? "en" : "it",
    });
    redirect("/hub-forgot-password?sent=1");
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <form action={action} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("forgotTitle")}</h1>
        <p className="text-sm text-gray-700">{t("forgotIntro")}</p>
        {sent === "1" && <p className="rounded bg-green-50 p-2 text-sm text-green-800">{t("forgotSent")}</p>}
        <label className="block text-sm">
          <span className="text-gray-700">{t("emailLabel")}</span>
          <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          {t("forgotSubmit")}
        </button>
      </form>
    </div>
  );
}
