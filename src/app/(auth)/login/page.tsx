"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("docente@scuola.it");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-white">SAVINT</h1>
        <p className="text-blue-200">Accedi con il tuo account scolastico</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="bg-white text-blue-800 px-6 py-3 rounded-lg hover:bg-blue-50 transition font-semibold"
        >
          Accedi con Google
        </button>

        {process.env.NODE_ENV === "development" && (
          <div className="border-t border-blue-400 pt-4 space-y-3">
            <p className="text-blue-300 text-sm">Dev Login</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="px-4 py-2 rounded-lg text-center w-64"
              placeholder="docente@scuola.it"
            />
            <br />
            <button
              onClick={() => signIn("credentials", { email, callbackUrl: "/dashboard" })}
              className="bg-yellow-400 text-blue-900 px-6 py-3 rounded-lg hover:bg-yellow-300 transition font-semibold"
            >
              Entra come docente
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
