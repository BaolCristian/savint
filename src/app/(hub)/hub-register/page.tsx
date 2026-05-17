import { redirect } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { registerHubAccount } from "./actions";
import { isHubMode } from "@/lib/config/savint-mode";

export default async function HubRegisterPage() {
  if (!isHubMode()) {
    redirect("/login");
  }
  const t = await getTranslations("hubAuth");

  async function action(formData: FormData) {
    "use server";
    const locale = (await getLocale()) as "it" | "en";
    const out = await registerHubAccount({
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      name: String(formData.get("name") ?? ""),
      locale: locale === "en" ? "en" : "it",
    });
    if (!out.ok) {
      redirect(`/hub-register?error=${out.error}`);
    }
    redirect("/hub-verify-email");
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <form action={action} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("registerTitle")}</h1>
        <label className="block text-sm">
          <span className="text-gray-700">{t("nameLabel")}</span>
          <input name="name" required minLength={1} maxLength={120} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t("emailLabel")}</span>
          <input name="email" type="email" required className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t("passwordLabel")}</span>
          <input name="password" type="password" required minLength={8} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          {t("registerSubmit")}
        </button>
        <p className="pt-2 text-center text-sm text-gray-600">
          <a href="/hub-login" className="text-blue-700 underline">{t("hasAccountLogin")}</a>
        </p>
      </form>
    </div>
  );
}
