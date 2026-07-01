import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { hasHubOAuthConfig, getHubOAuthConfig } from "@/lib/hub/oauth-config";
import Link from "next/link";
import { RevokeButton } from "./revoke-button";

export default async function HubLinkPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const t = await getTranslations("hub.link");

  const link = await prisma.hubLink.findUnique({
    where: { userId: session.user.id },
    select: { hubAccountEmail: true, revokedAt: true },
  });

  const isLinked = link && !link.revokedAt;

  let connectUrl: string | null = null;
  if (!isLinked && hasHubOAuthConfig()) {
    const cfg = getHubOAuthConfig();
    connectUrl = `${cfg.hubUrl}/api/hub/oauth/start`;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <div className="rounded-xl bg-white p-6 shadow">
        {isLinked ? (
          <div className="space-y-5">
            <p className="text-sm text-gray-700">
              {t("linkedAs", { email: link.hubAccountEmail })}
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {t("backToDashboard")}
            </Link>
            <div className="border-t border-slate-100 pt-4">
              <p className="mb-2 text-xs text-slate-500">{t("revokeHint")}</p>
              <RevokeButton
                revoke={t("revoke")}
                revoking={t("revoking")}
                revoked={t("revoked")}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">{t("notLinked")}</p>
            {connectUrl && (
              <a
                href={`/api/hub/oauth/start`}
                className="inline-block rounded bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
              >
                {t("connect")}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
