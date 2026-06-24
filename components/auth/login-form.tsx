"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ initialMessage }: { initialMessage?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(initialMessage ?? null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
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
    <div style={{ width: "100%", maxWidth: 392 }}>
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 18, padding: 30, boxShadow: "0 18px 44px -28px rgba(0,0,0,.3)" }}>
        <div style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 26, lineHeight: 1.1, color: "#221F1B" }}>
          Ingresá a tu panel
        </div>
        <div style={{ fontSize: 14, color: "#6B6660", margin: "6px 0 24px" }}>
          Gestioná los turnos de tu club.
        </div>

        <form onSubmit={signIn}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#54504A", marginBottom: 7 }}>
            Usuario
          </label>
          <input
            type="email"
            required
            placeholder="admin@tuclub.ar"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            style={{
              width: "100%", border: "1px solid #E0DACE", background: "#fff",
              borderRadius: 10, padding: "12px 14px", fontSize: 14.5,
              color: "#221F1B", marginBottom: 16, outline: "none", fontFamily: "inherit",
              boxSizing: "border-box"
            }}
          />

          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#54504A", marginBottom: 7 }}>
            Contraseña
          </label>
          <input
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{
              width: "100%", border: "1px solid #E0DACE", background: "#fff",
              borderRadius: 10, padding: "12px 14px", fontSize: 14.5,
              color: "#221F1B", marginBottom: 8, outline: "none", fontFamily: "inherit",
              boxSizing: "border-box"
            }}
          />

          <div style={{ textAlign: "right", marginBottom: 18 }}>
            <span style={{ fontSize: 13, color: "#C96442", cursor: "pointer" }}>¿Olvidaste tu contraseña?</span>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%", background: loading ? "#D9876B" : "#C96442",
              color: "#fff", border: "none", borderRadius: 11, padding: 13,
              fontWeight: 600, fontSize: 15, cursor: loading ? "not-allowed" : "pointer",
              boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)", fontFamily: "inherit"
            }}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>
        </form>

        {message && (
          <p style={{ marginTop: 14, fontSize: 13.5, color: "#B23A28", textAlign: "center" }}>{message}</p>
        )}
      </div>
    </div>
  );
}
