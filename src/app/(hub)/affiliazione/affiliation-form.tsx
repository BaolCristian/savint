"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PROVINCES } from "@/lib/affiliation/provinces";

interface Props {
  verified?: boolean;
}

export default function AffiliationForm({ verified }: Props) {
  const t = useTranslations("affiliation");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const data = {
      schoolName: (form.elements.namedItem("schoolName") as HTMLInputElement).value,
      province: (form.elements.namedItem("province") as HTMLSelectElement).value,
      installationUrl: (form.elements.namedItem("installationUrl") as HTMLInputElement).value,
      contactEmail: (form.elements.namedItem("contactEmail") as HTMLInputElement).value,
    };

    try {
      const res = await fetch("/api/hub/affiliation/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error("request failed");
      }

      setSubmitted(true);
    } catch {
      setError(t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm text-center space-y-2">
        <p className="text-xl font-semibold text-indigo-700">{t("successTitle")}</p>
        <p className="text-slate-600">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
      {verified && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-green-800 text-sm">
          {t("verifiedNotice")}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="schoolName" className="block text-sm font-medium text-slate-700">
            {t("schoolNameLabel")}
          </label>
          <input
            id="schoolName"
            name="schoolName"
            type="text"
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="province" className="block text-sm font-medium text-slate-700">
            {t("provinceLabel")}
          </label>
          <select
            id="province"
            name="province"
            required
            className="mt-1 w-full rounded border px-3 py-2"
          >
            <option value="">—</option>
            {PROVINCES.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="installationUrl" className="block text-sm font-medium text-slate-700">
            {t("installationUrlLabel")}
          </label>
          <input
            id="installationUrl"
            name="installationUrl"
            type="url"
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>

        <div>
          <label htmlFor="contactEmail" className="block text-sm font-medium text-slate-700">
            {t("contactEmailLabel")}
          </label>
          <input
            id="contactEmail"
            name="contactEmail"
            type="email"
            required
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 transition-colors disabled:opacity-60"
        >
          {submitting ? t("submitting") : t("submitButton")}
        </button>
      </form>
    </div>
  );
}
