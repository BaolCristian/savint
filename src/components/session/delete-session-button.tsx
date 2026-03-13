"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

interface Props {
  sessionId: string;
  /** If true, redirect to session list after delete */
  redirectToList?: boolean;
}

export function DeleteSessionButton({ sessionId, redirectToList }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const t = useTranslations("sessions");

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t("deleteConfirm"))) return;

    setLoading(true);
    try {
      const res = await fetch(withBasePath(`/api/session/${sessionId}`), {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      if (redirectToList) {
        router.push("/dashboard/sessions");
      }
      router.refresh();
    } catch {
      alert(t("deleteError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
    >
      <Trash2 className="size-3.5" />
      {loading ? t("deleting") : t("deleteSession")}
    </button>
  );
}
