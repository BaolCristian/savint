"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function StartSessionButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    setLoading(true);
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quizId }),
    });
    const session = await res.json();
    router.push(`/live/host/${session.id}`);
  }

  return (
    <Button onClick={handleStart} disabled={loading} variant="default" size="sm">
      {loading ? "Avvio..." : "Gioca"}
    </Button>
  );
}
