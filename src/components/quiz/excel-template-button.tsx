"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { withBasePath } from "@/lib/base-path";

export function ExcelTemplateButton() {
  const [loading, setLoading] = useState(false);
  const t = useTranslations("quiz");

  async function handleDownload() {
    setLoading(true);
    try {
      const res = await fetch(withBasePath("/api/quiz/excel-template"));
      if (!res.ok) throw new Error(t("downloadError"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "savint-template.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : t("downloadError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" onClick={handleDownload} disabled={loading}>
      {loading ? (
        <Loader2 className="size-4 mr-2 animate-spin" />
      ) : (
        <Download className="size-4 mr-2" />
      )}
      {t("templateExcel")}
    </Button>
  );
}
