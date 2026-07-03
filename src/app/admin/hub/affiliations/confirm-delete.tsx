"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Bottone "Elimina" che apre un dialog di conferma e fa DELETE su `deleteUrl`
 *  (una richiesta di affiliazione o direttamente un'installazione). */
export function ConfirmDelete({ deleteUrl }: { deleteUrl: string }) {
  const t = useTranslations("adminAffiliations");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onConfirm() {
    setBusy(true);
    setError(null);
    const res = await fetch(deleteUrl, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) { setError(t("actionError")); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
      >
        {t("delete")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmDeleteTitle")}</DialogTitle>
            <DialogDescription>{t("confirmDeleteBody")}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={onConfirm} disabled={busy}>{t("confirmDeleteAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
