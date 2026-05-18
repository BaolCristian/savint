import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isHubMode } from "@/lib/config/savint-mode";
import { resetPassword } from "./actions";

export default async function HubResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  if (!isHubMode()) redirect("/login");
  const t = await getTranslations("hubAuth");
  const { token, error } = await searchParams;

  if (!token) {
    return (
      <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-6 text-center shadow-xl">
          <p className="text-sm text-red-700">{t("resetInvalidToken")}</p>
        </div>
      </div>
    );
  }

  async function action(formData: FormData) {
    "use server";
    const tokenValue = String(formData.get("token") ?? "");
    const out = await resetPassword({
      token: tokenValue,
      newPassword: String(formData.get("newPassword") ?? ""),
    });
    if (!out.ok) {
      redirect(`/hub-reset-password?token=${encodeURIComponent(tokenValue)}&error=${out.error}`);
    }
    redirect("/hub-login?reset=1");
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <form action={action} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-gray-900">{t("resetTitle")}</h1>
        <input type="hidden" name="token" value={token} />
        {error === "weak_password" && <p className="text-sm text-red-600">{t("weakPassword")}</p>}
        {error === "invalid_token" && <p className="text-sm text-red-600">{t("resetInvalidToken")}</p>}
        <label className="block text-sm">
          <span className="text-gray-700">{t("newPasswordLabel")}</span>
          <input name="newPassword" type="password" required minLength={8} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <button type="submit" className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
          {t("resetSubmit")}
        </button>
      </form>
    </div>
  );
}
