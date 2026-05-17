"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { withBasePath } from "@/lib/base-path";

export default function HubLoginPage() {
  const t = useTranslations("hubAuth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await signIn("hub-credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/savint/hub-account",
    });
    setSubmitting(false);
    if (res?.error) {
      setError(t("invalidCredentials"));
      return;
    }
    if (res?.url) window.location.href = res.url;
  }

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="mx-auto h-16 w-16 object-contain" />
        <button
          onClick={() => signIn("google", { callbackUrl: "/savint/hub-account" })}
          className="w-full rounded bg-white px-4 py-2 font-semibold text-blue-800 ring-1 ring-blue-300 hover:bg-blue-50"
          type="button"
        >
          {t("loginWithGoogle")}
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div className="h-px flex-1 bg-gray-200" />
          <span>{t("or")}</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>
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
            className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? t("submitting") : t("loginSubmit")}
          </button>
        </form>
        <div className="flex justify-between text-sm">
          <a href="/hub-forgot-password" className="text-blue-700 underline">{t("forgotPasswordLink")}</a>
          <a href="/hub-register" className="text-blue-700 underline">{t("registerLink")}</a>
        </div>
      </div>
    </div>
  );
}
