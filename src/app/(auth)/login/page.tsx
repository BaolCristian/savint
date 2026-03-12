"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { useTranslations } from "next-intl";

export default function LoginPage() {
  const t = useTranslations("login");
  const [email, setEmail] = useState("docente@scuola.it");
  const showDevLogin = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.NODE_ENV === "development";

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="text-center space-y-3 sm:space-y-6 w-full max-w-sm">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-20 h-20 sm:w-32 sm:h-32 mx-auto object-contain" />
        <p className="text-blue-200 text-sm sm:text-base">{t("loginWithSchoolAccount")}</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/savint/dashboard" })}
          className="bg-white text-blue-800 px-6 py-2.5 sm:py-3 rounded-lg hover:bg-blue-50 transition font-semibold text-sm sm:text-base w-full"
        >
          {t("loginWithGoogle")}
        </button>

        {showDevLogin && (
          <div className="border-t border-blue-400 pt-3 space-y-2 sm:space-y-3">
            <p className="text-blue-300 text-xs sm:text-sm">{t("demoLogin")}</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-4 py-2 rounded-lg text-center w-full text-sm"
              placeholder={t("emailPlaceholder")}
            />
            <button
              onClick={() => signIn("credentials", { email, callbackUrl: "/savint/dashboard" })}
              className="bg-yellow-400 text-blue-900 px-6 py-2.5 sm:py-3 rounded-lg hover:bg-yellow-300 transition font-semibold text-sm sm:text-base w-full"
            >
              {t("enterAsTeacher")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
