"use client";

import { signIn } from "next-auth/react";
import { useState, useEffect } from "react";
import { withBasePath } from "@/lib/base-path";

export default function LoginPage() {
  const [email, setEmail] = useState("docente@scuola.it");
  const [csrfToken, setCsrfToken] = useState("");
  const showDevLogin = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || process.env.NODE_ENV === "development";

  useEffect(() => {
    fetch(withBasePath("/api/auth/csrf"))
      .then((r) => r.json())
      .then((d) => setCsrfToken(d.csrfToken))
      .catch(() => {});
  }, []);

  return (
    <div className="flex h-dvh items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="text-center space-y-3 sm:space-y-6 w-full max-w-sm">
        <img src={withBasePath("/logo_savint.png")} alt="SAVINT" className="w-20 h-20 sm:w-32 sm:h-32 mx-auto object-contain" />
        <p className="text-blue-200 text-sm sm:text-base">Accedi con il tuo account scolastico</p>

        {/* Native form POST for Google OAuth — ensures Set-Cookie headers are processed */}
        <form method="POST" action={withBasePath("/api/auth/signin/google")}>
          <input type="hidden" name="csrfToken" value={csrfToken} />
          <input type="hidden" name="callbackUrl" value="/savint/dashboard" />
          <button
            type="submit"
            className="bg-white text-blue-800 px-6 py-2.5 sm:py-3 rounded-lg hover:bg-blue-50 transition font-semibold text-sm sm:text-base w-full"
          >
            Accedi con Google
          </button>
        </form>

        {showDevLogin && (
          <div className="border-t border-blue-400 pt-3 space-y-2 sm:space-y-3">
            <p className="text-blue-300 text-xs sm:text-sm">Demo Login</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-4 py-2 rounded-lg text-center w-full text-sm"
              placeholder="docente@scuola.it"
            />
            <button
              onClick={() => signIn("credentials", { email, callbackUrl: "/savint/dashboard" })}
              className="bg-yellow-400 text-blue-900 px-6 py-2.5 sm:py-3 rounded-lg hover:bg-yellow-300 transition font-semibold text-sm sm:text-base w-full"
            >
              Entra come docente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
