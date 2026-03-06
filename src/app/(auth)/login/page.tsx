"use client";

import { signIn } from "next-auth/react";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-blue-600 to-blue-800">
      <div className="text-center space-y-6">
        <h1 className="text-5xl font-bold text-white">Quiz Live</h1>
        <p className="text-blue-200">Accedi con il tuo account scolastico</p>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="bg-white text-blue-800 px-6 py-3 rounded-lg hover:bg-blue-50 transition font-semibold"
        >
          Accedi con Google
        </button>
      </div>
    </div>
  );
}
