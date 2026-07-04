"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  askClubName?: boolean;
  initialClubName?: string;
}

export function SetPasswordForm({ askClubName = false, initialClubName = "" }: Props) {
  const [clubName, setClubName] = useState(initialClubName);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (askClubName && !clubName.trim()) {
      setMessage("Ingresá el nombre de tu cancha.");
      return;
    }
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

    const passwordRes = await fetch("/api/auth/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (!passwordRes.ok) {
      const data = await passwordRes.json().catch(() => ({}));
      setLoading(false);
      setMessage(data.error ?? "No se pudo guardar la contraseña. Pedí que te reenvíen la invitación.");
      return;
    }

    // Recién acá creamos el perfil en DB (el usuario "existe" cuando completa su cuenta).
    try {
      if (askClubName) {
        // Admin: crea el perfil + el club con el nombre de la cancha.
        const res = await fetch("/api/auth/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clubName: clubName.trim() }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setLoading(false);
          setMessage(data.error ?? "No se pudo guardar el nombre de la cancha.");
          return;
        }
      } else {
        // Superadmin u otros: solo crea el perfil.
        const res = await fetch("/api/auth/ensure-profile", { method: "POST" });
        if (!res.ok) {
          setLoading(false);
          setMessage("No se pudo crear tu cuenta. Reintentá.");
          return;
        }
      }
    } catch {
      setLoading(false);
      setMessage("No se pudo crear tu cuenta. Reintentá.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main
      style={{
        minHeight: "100svh",
        background: "#F4F1EA",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ width: "100%", maxWidth: 420 }}>
        <div
          style={{
            fontFamily: "'Instrument Serif',Georgia,serif",
            fontSize: 34,
            color: "#221F1B",
            lineHeight: 1.1,
          }}
        >
          ¡Bienvenido a Cancha!
        </div>
        <p style={{ fontSize: 15, color: "#6B6660", margin: "8px 0 22px", lineHeight: 1.5 }}>
          {askClubName
            ? "Poné el nombre de tu cancha y creá tu contraseña para empezar a gestionar tus turnos."
            : "Creá tu contraseña para acceder al sistema."}
        </p>

        <form
          onSubmit={handleSubmit}
          style={{
            background: "#FCFBF8",
            border: "1px solid #E7E1D6",
            borderRadius: 16,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {askClubName && (
            <Field label="Nombre de tu cancha">
              <input
                type="text"
                required
                placeholder="Ej: Pádel Central"
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                style={inputStyle}
              />
            </Field>
          )}

          <Field label="Contraseña">
            <input
              type="password"
              required
              placeholder="Mínimo 8 caracteres"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </Field>

          <Field label="Confirmar contraseña">
            <input
              type="password"
              required
              placeholder="Repetí la contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              style={inputStyle}
            />
          </Field>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              background: "#C96442",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "12px 18px",
              fontWeight: 600,
              fontSize: 15,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
              fontFamily: "inherit",
              boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)",
            }}
          >
            {loading ? "Guardando…" : "Crear mi cuenta"}
          </button>

          {message ? (
            <p style={{ fontSize: 13.5, color: "#B0492E", margin: 0 }}>{message}</p>
          ) : null}
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "#6B6660" }}>{label}</span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #E0D9CC",
  background: "#fff",
  borderRadius: 10,
  padding: "11px 13px",
  fontSize: 15,
  color: "#221F1B",
  fontFamily: "inherit",
  outline: "none",
  width: "100%",
};
