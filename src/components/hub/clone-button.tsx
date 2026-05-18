"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface CloneButtonProps {
  hubQuizId: string;
}

export function CloneButton({ hubQuizId }: CloneButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClone() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/hub/clone", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hubQuizId }),
      });
      if (res.status === 409) {
        const body = (await res.json()) as { localQuizId?: string };
        const localId = body.localQuizId;
        if (localId) {
          const open = window.confirm(
            "This quiz is already in your library. Open it now?",
          );
          if (open) router.push(`/dashboard/quiz/${localId}/edit`);
        } else {
          setError("Already in your library.");
        }
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Clone failed. Please try again.");
        return;
      }
      const body = (await res.json()) as { localQuizId: string };
      router.push(`/dashboard/quiz/${body.localQuizId}/edit`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={handleClone}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-colors disabled:opacity-60"
      >
        {loading ? "Cloning…" : "Clone to my library"}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
