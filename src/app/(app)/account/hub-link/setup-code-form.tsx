"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function SetupCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const res = await fetch("/api/installation/hub/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ setupCode: code.trim() }) });
    setBusy(false);
    if (res.ok) router.refresh(); else setErr((await res.json().catch(() => ({}))).error ?? "errore");
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Incolla il codice di setup" className="w-full rounded border px-3 py-2 text-sm" required />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button type="submit" disabled={busy} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Collego…" : "Collega a savint.it"}</button>
    </form>
  );
}
