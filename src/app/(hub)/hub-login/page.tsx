"use client";

import { signIn, getProviders } from "next-auth/react";
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";

export default function HubLoginPage() {
  const t = useTranslations("hubAuth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  useEffect(() => {
    getProviders().then((p) => setGoogleEnabled(Boolean(p?.google)));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signIn("hub-credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: withBasePath("/hub-account"),
    });
    setSubmitting(false);
    if (res?.error) {
      setError(t("invalidCredentials"));
      return;
    }
    if (res?.url) window.location.href = res.url;
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-br from-brand-blue to-brand-magenta p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="mx-auto h-20 w-20 object-contain" />
        {googleEnabled && (
          <>
            <button
              onClick={() => signIn("google", { callbackUrl: withBasePath("/hub-account") })}
              className="w-full rounded bg-white px-4 py-2 font-semibold text-brand-blue ring-1 ring-brand-blue/30 hover:bg-brand-blue-50"
              type="button"
            >
              {t("loginWithGoogle")}
            </button>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="h-px flex-1 bg-gray-200" />
              <span>{t("or")}</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
          </>
        )}
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">{t("emailLabel")}</span>
            <input
              aria-label="Email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t("passwordLabel")}</span>
            <input
              aria-label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-brand-blue px-4 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("loginSubmit")}
          </button>
        </form>
        <div className="flex justify-between text-sm">
          <a href="/hub-forgot-password" className="text-brand-blue underline">{t("forgotPasswordLink")}</a>
          <a href="/hub-register" className="text-brand-blue underline">{t("registerLink")}</a>
        </div>
      </div>
    </div>
  );
}
