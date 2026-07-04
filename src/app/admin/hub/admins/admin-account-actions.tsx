"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/** Form: promuovi ad admin un utente esistente per email. */
export function PromoteForm() {
  const t = useTranslations("adminAccounts");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/hub/admin/accounts/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: t("promoteSuccess") });
      setEmail("");
      router.refresh();
    } else if (res.status === 404) {
      setMsg({ ok: false, text: t("promoteNotFound") });
    } else {
      setMsg({ ok: false, text: t("actionError") });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-slate-600">{t("promoteHelp")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMsg(null); }}
          placeholder={t("emailPlaceholder")}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
        <button
          type="submit"
          disabled={busy || !email.trim()}
          className="rounded-lg bg-brand-blue px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:bg-slate-300"
        >
          {t("promoteAction")}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-brand-green" : "text-red-600"}`}>{msg.text}</p>}
    </form>
  );
}

/** Form: trasferisci tutti i quiz di un docente (per email) all'account SAVINT. */
export function TransferForm() {
  const t = useTranslations("adminAccounts");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onConfirm() {
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/hub/admin/accounts/transfer-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setBusy(false);
    setOpen(false);
    if (res.ok) {
      const data = await res.json();
      setMsg({ ok: true, text: t("transferSuccess", { count: data.moved }) });
      setEmail("");
      router.refresh();
    } else if (res.status === 404) {
      setMsg({ ok: false, text: t("transferNotFound") });
    } else if (res.status === 409) {
      setMsg({ ok: false, text: t("transferSystemMissing") });
    } else {
      setMsg({ ok: false, text: t("actionError") });
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">{t("transferHelp")}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setMsg(null); }}
          placeholder={t("emailPlaceholder")}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
        />
        <button
          type="button"
          disabled={busy || !email.trim()}
          onClick={() => setOpen(true)}
          className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          {t("transferAction")}
        </button>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? "text-brand-green" : "text-red-600"}`}>{msg.text}</p>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("transferConfirmTitle")}</DialogTitle>
            <DialogDescription>{t("transferConfirmBody", { email: email.trim() })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={onConfirm} disabled={busy}>{t("transferConfirmAction")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Bottone "Rimuovi admin" per un altro amministratore. */
export function DemoteButton({ id }: { id: string }) {
  const t = useTranslations("adminAccounts");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    const res = await fetch(`/api/hub/admin/accounts/${id}/demote`, { method: "POST" });
    if (!res.ok) { setError(t("actionError")); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        onClick={onClick}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors"
      >
        {t("demoteAction")}
      </button>
    </div>
  );
}
