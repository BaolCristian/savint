import { auth } from "@/lib/auth/config";
import { prisma } from "@/lib/db/client";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { approveAuthorization } from "./action";

type SP = {
  client_id?: string;
  redirect_uri?: string;
  scope?: string;
  state?: string;
  code_challenge?: string;
  code_challenge_method?: string;
};

export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("hub.oauth");
  const session = await auth();
  if (!session?.user?.id) {
    const back = encodeURIComponent(
      `/oauth/authorize?${new URLSearchParams(sp as Record<string, string>).toString()}`,
    );
    redirect(`/hub-login?callbackUrl=${back}`);
  }

  if (!sp.client_id || !sp.redirect_uri || !sp.code_challenge) {
    return <p>Missing parameters</p>;
  }

  const installation = await prisma.installation.findUnique({
    where: { clientId: sp.client_id },
  });
  if (!installation || installation.status !== "ACTIVE") {
    return <p>{t("invalidClient")}</p>;
  }

  const scopeList = (sp.scope ?? "").split(/[\s,]+/).filter(Boolean);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-semibold">
        {t("title", { installation: installation.name })}
      </h1>
      <p className="mt-2 text-sm text-gray-600">
        {t("subtitle", { installation: installation.name })}
      </p>
      <ul className="mt-4 list-disc pl-6 text-sm">
        {scopeList.includes("publish") && <li>{t("scopes.publish")}</li>}
        {scopeList.includes("clone") && <li>{t("scopes.clone")}</li>}
      </ul>
      <form action={approveAuthorization} className="mt-6 flex gap-2">
        <input type="hidden" name="client_id" value={sp.client_id} />
        <input type="hidden" name="redirect_uri" value={sp.redirect_uri} />
        <input type="hidden" name="scope" value={sp.scope ?? ""} />
        <input type="hidden" name="state" value={sp.state ?? ""} />
        <input type="hidden" name="code_challenge" value={sp.code_challenge} />
        <input
          type="hidden"
          name="code_challenge_method"
          value={sp.code_challenge_method ?? "S256"}
        />
        <button
          type="submit"
          className="rounded bg-emerald-600 px-4 py-2 text-white"
        >
          {t("accept")}
        </button>
        <a href={sp.redirect_uri} className="rounded border px-4 py-2">
          {t("deny")}
        </a>
      </form>
    </main>
  );
}
