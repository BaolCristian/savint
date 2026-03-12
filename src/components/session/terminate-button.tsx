"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Square } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

export function TerminateButton({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const t = useTranslations("sessions");

  const handleTerminate = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t("terminateConfirm"))) return;

    setLoading(true);
    try {
      const res = await fetch(withBasePath(`/api/session/${sessionId}`), {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      alert(t("terminateError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleTerminate}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
    >
      <Square className="size-3.5" />
      {loading ? t("terminating") : t("terminate")}
    </button>
  );
}
