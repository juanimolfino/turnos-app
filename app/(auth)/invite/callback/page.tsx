"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

export default function InviteCallbackPage() {
  const [failed, setFailed] = useState(false);
  const [failMsg, setFailMsg] = useState("");
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function handle() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const code       = searchParams.get("code");
      const tokenHash  = searchParams.get("token_hash");
      const type       = searchParams.get("type");
      const errorParam = searchParams.get("error_description") ?? searchParams.get("error");

      // Hash fragment tokens — only visible client-side (implicit flow)
      const hashStr = window.location.hash.slice(1);
      const hp      = new URLSearchParams(hashStr);
      const accessToken  = hp.get("access_token");
      const refreshToken = hp.get("refresh_token");

      if (errorParam) {
        setFailed(true);
        setFailMsg(errorParam);
        return;
      }

      let authError: { message: string } | null = null;

      if (code) {
        // PKCE flow
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        authError = error;
      } else if (tokenHash) {
        // OTP flow — what Supabase sends for server-created invites
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          type: (type ?? "invite") as any,
        });
        authError = error;
      } else if (accessToken && refreshToken) {
        // Implicit flow — hash fragment
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = error;
      } else {
        setFailed(true);
        setFailMsg("Enlace inválido o expirado. Pedile al administrador que te reenvíe la invitación.");
        return;
      }

      if (authError) {
        setFailed(true);
        setFailMsg(authError.message);
        return;
      }

      // Create DB profile (session is now in cookies from the browser client)
      try {
        await fetch("/api/auth/ensure-profile", { method: "POST" });
      } catch {
        // Non-fatal — the redirect or dashboard will handle it
      }

      router.replace("/set-password");
    }

    handle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (failed) {
    return (
      <div style={{
        minHeight: "100vh", background: "#F4F1EA",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24
      }}>
        <div style={{
          background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16,
          padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center"
        }}>
          <div style={{ fontSize: 36, marginBottom: 14 }}>⚠️</div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 22, color: "#221F1B", marginBottom: 8 }}>
            Enlace inválido
          </div>
          <div style={{ fontSize: 14, color: "#6B6660", lineHeight: 1.6, marginBottom: 22 }}>
            {failMsg}
          </div>
          <a href="/login" style={{
            display: "inline-block", background: "#C96442", color: "#fff",
            borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 14,
            textDecoration: "none"
          }}>
            Ir al login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#F4F1EA",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      <div style={{ textAlign: "center" }}>
        <div style={{
          width: 36, height: 36, borderRadius: "50%",
          border: "3px solid #E7E1D6", borderTopColor: "#C96442",
          margin: "0 auto 16px",
          animation: "spin 0.8s linear infinite"
        }} />
        <div style={{ fontSize: 15, color: "#6B6660" }}>Verificando invitación…</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}
