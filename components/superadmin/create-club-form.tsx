"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateClubForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/superadmin/clubs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) { setError(data.error ?? "Error al crear el club"); return; }
    router.refresh();
    onClose();
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(34,31,27,.25)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50
    }} onClick={onClose}>
      <div
        style={{
          background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 18,
          padding: 28, width: 420, boxShadow: "0 24px 56px -16px rgba(0,0,0,.25)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 22, marginBottom: 6, color: "#221F1B" }}>
          Nuevo club
        </div>
        <div style={{ fontSize: 13.5, color: "#6B6660", marginBottom: 22 }}>
          Creá un club para luego asignarle un admin y sus canchas.
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#54504A", marginBottom: 7 }}>
              Nombre del club
            </label>
            <input
              type="text"
              required
              placeholder="ej. Pádel Norte"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                width: "100%", border: "1px solid #E0DACE", background: "#fff",
                borderRadius: 10, padding: "11px 14px", fontSize: 14.5,
                color: "#221F1B", outline: "none", fontFamily: "inherit", boxSizing: "border-box"
              }}
            />
          </div>
          {error && <p style={{ fontSize: 13, color: "#B23A28" }}>{error}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              type="button" onClick={onClose}
              style={{
                border: "1px solid #E0DACE", background: "#fff", color: "#6B6660",
                borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14,
                cursor: "pointer", fontFamily: "inherit"
              }}
            >
              Cancelar
            </button>
            <button
              type="submit" disabled={loading}
              style={{
                background: loading ? "#D9876B" : "#C96442", color: "#fff", border: "none",
                borderRadius: 10, padding: "10px 20px", fontWeight: 600, fontSize: 14,
                cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit",
                boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)"
              }}
            >
              {loading ? "Creando..." : "Crear club"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
