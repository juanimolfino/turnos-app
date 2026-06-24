"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 8) {
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    setLoading(true);
    setMessage(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          required
          placeholder="Nueva contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        <Input
          type="password"
          required
          placeholder="Confirmar contraseña"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Guardando..." : "Establecer contraseña"}
        </Button>
      </form>
      {message ? <p className="mt-4 text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
