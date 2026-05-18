import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isHubMode } from "@/lib/config/savint-mode";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { updateProfile, changePassword } from "./actions";

export default async function HubAccountPage() {
  if (!isHubMode()) redirect("/login");
  const session = await auth();
  if (!session?.user?.id) redirect("/hub-login");
  const t = await getTranslations("hubAccount");
  const acct = await prisma.hubAccount.findUnique({ where: { id: session.user.id } });
  if (!acct) redirect("/hub-login");

  async function profileAction(formData: FormData) {
    "use server";
    await updateProfile({
      name: String(formData.get("name") ?? ""),
      affiliation: String(formData.get("affiliation") ?? "") || null,
    });
  }
  async function passwordAction(formData: FormData) {
    "use server";
    await changePassword({
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
    });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <h1 className="text-2xl font-semibold text-gray-900">{t("title")}</h1>

      <section className="space-y-3 rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">{t("profileSection")}</h2>
        <form action={profileAction} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">{t("nameLabel")}</span>
            <input name="name" defaultValue={acct.name ?? ""} required className="mt-1 w-full rounded border px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t("affiliationLabel")}</span>
            <input
              name="affiliation"
              defaultValue={acct.affiliation ?? ""}
              maxLength={200}
              placeholder={t("affiliationPlaceholder")}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
            {t("saveProfile")}
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl bg-white p-6 shadow">
        <h2 className="text-lg font-semibold">{t("providersSection")}</h2>
        <ul className="list-inside list-disc text-sm text-gray-700">
          {acct.linkedProviders.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </section>

      {acct.authMethod === "PASSWORD" && (
        <section className="space-y-3 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-semibold">{t("passwordSection")}</h2>
          <form action={passwordAction} className="space-y-3">
            <label className="block text-sm">
              <span className="text-gray-700">{t("currentPasswordLabel")}</span>
              <input name="currentPassword" type="password" required className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700">{t("newPasswordLabel")}</span>
              <input name="newPassword" type="password" required minLength={8} className="mt-1 w-full rounded border px-3 py-2" />
            </label>
            <button type="submit" className="rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800">
              {t("changePasswordSubmit")}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
