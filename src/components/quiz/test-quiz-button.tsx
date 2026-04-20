"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { withBasePath } from "@/lib/base-path";
import { FlaskConical } from "lucide-react";

export function TestQuizButton({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleTest() {
    setLoading(true);
    try {
      const res = await fetch(withBasePath("/api/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quizId, isTest: true }),
      });
      if (!res.ok) throw new Error("Failed to start test session");
      const session = await res.json();
      router.push(`/live/test/${session.id}`);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleTest}
      disabled={loading}
      variant="outline"
      size="sm"
      title="Gioca da solo per verificare il quiz"
    >
      <FlaskConical className="w-4 h-4 mr-1" />
      {loading ? "Avvio..." : "Prova"}
    </Button>
  );
}
