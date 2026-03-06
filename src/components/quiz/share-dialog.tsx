"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2Icon, Trash2Icon } from "lucide-react";

type Permission = "VIEW" | "DUPLICATE" | "EDIT";

interface ShareEntry {
  id: string;
  permission: Permission;
  sharedWith: { id: string; name: string | null; email: string };
}

const permissionLabel: Record<Permission, string> = {
  VIEW: "Visualizza",
  DUPLICATE: "Duplica",
  EDIT: "Modifica",
};

export function ShareDialog({ quizId }: { quizId: string }) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<Permission>("VIEW");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchShares = useCallback(async () => {
    const res = await fetch(`/api/quiz/${quizId}/share`);
    if (res.ok) {
      setShares(await res.json());
    }
  }, [quizId]);

  useEffect(() => {
    if (open) {
      fetchShares();
    }
  }, [open, fetchShares]);

  const handleAdd = async () => {
    setError(null);
    if (!email.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/quiz/${quizId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), permission }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Errore");
        return;
      }
      setEmail("");
      setPermission("VIEW");
      await fetchShares();
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (shareId: string) => {
    await fetch(`/api/quiz/${quizId}/share`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareId }),
    });
    await fetchShares();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Share2Icon className="size-4 mr-1" />
            Condividi
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Condividi Quiz</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Add form */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Email
              </label>
              <Input
                type="email"
                placeholder="docente@scuola.it"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Permesso
              </label>
              <Select
                value={permission}
                onValueChange={(val) => setPermission(val as Permission)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="VIEW">Visualizza</SelectItem>
                  <SelectItem value="DUPLICATE">Duplica</SelectItem>
                  <SelectItem value="EDIT">Modifica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAdd} disabled={loading} size="sm">
              Aggiungi
            </Button>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {/* Current shares */}
          {shares.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Condiviso con
              </p>
              <ul className="space-y-1">
                {shares.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-medium truncate block">
                        {s.sharedWith.name ?? s.sharedWith.email}
                      </span>
                      {s.sharedWith.name && (
                        <span className="text-xs text-muted-foreground truncate block">
                          {s.sharedWith.email}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      <span className="text-xs text-muted-foreground">
                        {permissionLabel[s.permission]}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRemove(s.id)}
                      >
                        <Trash2Icon className="size-3.5 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
