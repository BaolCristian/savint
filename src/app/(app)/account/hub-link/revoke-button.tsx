"use client";

import { useState } from "react";

interface Props {
  revoking: string;
  revoke: string;
  revoked: string;
}

export function RevokeButton({ revoking, revoke, revoked }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");

  async function handleRevoke() {
    setStatus("loading");
    try {
      await fetch("/api/hub/oauth/link", { method: "DELETE" });
      setStatus("done");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "done") {
    return <p className="text-sm text-green-700">{revoked}</p>;
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={status === "loading"}
      className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
    >
      {status === "loading" ? revoking : revoke}
    </button>
  );
}
