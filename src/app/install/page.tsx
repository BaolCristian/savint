import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Gift, Github, ShieldCheck } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

export default async function InstallPage() {
  const t = await getTranslations("install");

  const valueProps = [
    {
      icon: <Gift className="h-5 w-5 text-indigo-600" />,
      chipClass: "bg-indigo-50",
      title: t("prop1Title"),
      body: t("prop1Body"),
    },
    {
      icon: <Github className="h-5 w-5 text-violet-600" />,
      chipClass: "bg-violet-50",
      title: t("prop2Title"),
      body: t("prop2Body"),
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />,
      chipClass: "bg-emerald-50",
      title: t("prop3Title"),
      body: t("prop3Body"),
    },
  ];

  const steps = [
    { title: t("step1Title"), body: t("step1Body"), mono: null },
    {
      title: t("step2Title"),
      body: t("step2Body"),
      mono: "ghcr.io/baolcristian/savint",
    },
    { title: t("step3Title"), body: t("step3Body"), mono: null },
    { title: t("step4Title"), body: t("step4Body"), mono: null },
  ];

  return (
    <main className="min-h-dvh bg-gradient-to-b from-indigo-50/60 via-white to-white">
      <div className="max-w-4xl mx-auto px-4 py-12">

        {/* Hero */}
        <section className="text-center mb-12">
          <span className="inline-block rounded-full bg-indigo-100 px-4 py-1 text-sm font-semibold text-indigo-700 mb-5">
            {t("eyebrow")}
          </span>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 mb-4 leading-tight">
            {t("title")}
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto mb-8">
            {t("subtitle")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <a
              href="https://github.com/BaolCristian/savint"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              {t("ctaGithub")}
            </a>
            <a
              href="https://github.com/BaolCristian/savint/blob/main/docs/SETUP.md"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-indigo-300 px-6 py-3 font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
            >
              {t("ctaGuide")}
            </a>
          </div>
        </section>

        {/* Value Props */}
        <section className="grid sm:grid-cols-3 gap-4 mb-12">
          {valueProps.map((prop, i) => (
            <div
              key={i}
              className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
            >
              <span
                className={`inline-flex items-center justify-center rounded-xl ${prop.chipClass} p-2.5 mb-3`}
              >
                {prop.icon}
              </span>
              <h3 className="font-bold text-slate-900 mb-1">{prop.title}</h3>
              <p className="text-sm text-slate-600">{prop.body}</p>
            </div>
          ))}
        </section>

        {/* How to Install */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">
            {t("howTitle")}
          </h2>
          <ol className="space-y-3">
            {steps.map((step, i) => (
              <li
                key={i}
                className="flex gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm"
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-indigo-50 text-sm font-bold text-indigo-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{step.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {step.body}
                    {step.mono && (
                      <>
                        {" "}
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-indigo-700">
                          {step.mono}
                        </code>
                      </>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section>
          <div className="rounded-3xl bg-slate-900 text-white p-8 sm:p-10 text-center">
            <h2 className="text-2xl font-bold mb-2">{t("finalTitle")}</h2>
            <p className="text-slate-300 mb-6 max-w-xl mx-auto">{t("finalBody")}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="https://github.com/BaolCristian/savint"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
              >
                {t("ctaGithub")}
              </a>
              <Link
                href={withBasePath("/demo")}
                className="rounded-lg border border-white/40 px-5 py-2.5 font-semibold text-white hover:bg-white/10 transition-colors"
              >
                {t("ctaDemo")}
              </Link>
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
