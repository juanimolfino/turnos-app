"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ initialMessage }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createSupabaseBrowserClient();
    setLoading(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage("Email o contraseña incorrectos.");
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm">
      <form onSubmit={signIn} className="space-y-4">
        <Input
          type="email"
          required
          placeholder="email@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Input
          type="password"
          required
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </Button>
      </form>
      {message ? <p className="mt-4 text-sm text-destructive">{message}</p> : null}
    </div>
  );
}
