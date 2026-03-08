"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function PlayQuizButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handlePlay() {
    setLoading(true);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId }),
      });
      if (!res.ok) throw new Error("Errore nella creazione della sessione");
      const session = await res.json();
      window.open(`/live/host/${session.id}`, "_blank");
      setLoading(false);
    } catch {
      setLoading(false);
      alert("Errore nell'avvio del quiz");
    }
  }

  return (
    <button
      onClick={handlePlay}
      disabled={loading}
      className="flex items-center gap-1.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:from-slate-400 disabled:to-slate-500 text-white text-sm font-bold px-4 py-1.5 rounded-lg transition-all shadow-sm hover:shadow-md active:scale-95"
    >
      <span>▶</span>
      {loading ? "Avvio..." : "Gioca"}
    </button>
  );
}
