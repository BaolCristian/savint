"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type ReportReason = "COPYRIGHT" | "PERSONAL_DATA" | "OFFENSIVE" | "OTHER";

type Props = {
  hubQuizId: string;
};

export function ReportQuizButton({ hubQuizId }: Props) {
  const t = useTranslations("hub.reportModal");
  const tHub = useTranslations("hub");

  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>("OTHER");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "alreadyReported" | "error"
  >("idle");

  const reasons: ReportReason[] = [
    "COPYRIGHT",
    "PERSONAL_DATA",
    "OFFENSIVE",
    "OTHER",
  ];

  function handleOpen() {
    setStatus("idle");
    setReason("OTHER");
    setDescription("");
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    try {
      const res = await fetch("/api/hub/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hubQuizId, reason, description: description || undefined }),
      });
      if (res.status === 201) {
        setStatus("success");
      } else if (res.status === 409) {
        setStatus("alreadyReported");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  const isTerminal = status === "success" || status === "alreadyReported";

  return (
    <>
      <button
        onClick={handleOpen}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        type="button"
      >
        {tHub("report")}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("title")}</DialogTitle>
          </DialogHeader>

          {isTerminal ? (
            <p className="text-sm py-4">
              {status === "success" ? t("success") : t("alreadyReported")}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="report-reason" className="text-sm font-medium">
                  {t("reason")}
                </label>
                <select
                  id="report-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value as ReportReason)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  {reasons.map((r) => (
                    <option key={r} value={r}>
                      {t(`reasons.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="report-description"
                  className="text-sm font-medium"
                >
                  {t("description")}
                </label>
                <Textarea
                  id="report-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>

              {status === "error" && (
                <p className="text-sm text-destructive">{t("error")}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={status === "submitting"}>
                  {t("submit")}
                </Button>
              </DialogFooter>
            </form>
          )}

          {isTerminal && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
