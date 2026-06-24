"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Admin {
  id: string;
  email: string;
  role: string | null;
  venueName: string | null;
  clubId: string | null;
  createdAt: Date;
}

interface Club {
  id: string;
  name: string;
}

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin" };
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  superadmin: { bg: "#F1EAF7", color: "#6B4E9E" },
  admin: { bg: "#EAF0F8", color: "#3D5C93" },
};

export function AdminsClient({ admins, clubs }: { admins: Admin[]; clubs: Club[] }) {
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  return (
    <div style={{ padding: "24px 28px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 28, color: "#221F1B" }}>Admins</div>
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            {admins.length} usuario{admins.length !== 1 ? "s" : ""} en el sistema
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: "#C96442", color: "#fff", border: "none",
            borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14,
            cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)"
          }}
        >
          + Invitar admin
        </button>
      </div>

      {/* Invite form */}
      {showForm && (
        <InviteForm clubs={clubs} onSuccess={() => { setShowForm(false); router.refresh(); }} />
      )}

      {/* Tabla */}
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#F7F4EE" }}>
              {["Usuario", "Rol", "Club / Cancha", "Registrado"].map((h) => (
                <th key={h} style={{ padding: "11px 20px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map((admin) => {
              const st = ROLE_STYLE[admin.role ?? "admin"];
              const initial = admin.email[0].toUpperCase();
              return (
                <tr key={admin.id} style={{ borderTop: "1px solid #EFEAE0" }}>
                  <td style={{ padding: "13px 20px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%", background: "#EDE7DB",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontWeight: 700, color: "#6B6660", fontSize: 13, flexShrink: 0
                      }}>
                        {initial}
                      </div>
                      <span style={{ fontSize: 14, color: "#221F1B", fontWeight: 500 }}>{admin.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: "13px 20px" }}>
                    <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: "4px 11px", fontSize: 12, fontWeight: 700 }}>
                      {ROLE_LABEL[admin.role ?? "admin"]}
                    </span>
                  </td>
                  <td style={{ padding: "13px 20px", fontSize: 13.5, color: "#6B6660" }}>
                    {admin.venueName ?? "—"}
                  </td>
                  <td style={{ padding: "13px 20px", fontSize: 13, color: "#928B7E" }}>
                    {new Date(admin.createdAt).toLocaleDateString("es-AR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InviteForm({ clubs, onSuccess }: { clubs: Club[]; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role, venueName: role === "admin" ? venueName : undefined }),
    });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setMessage({ text: `Invitación enviada a ${email}`, ok: true });
      setEmail(""); setVenueName("");
      setTimeout(onSuccess, 1200);
    } else {
      setMessage({ text: data.error ?? "Error al enviar invitación", ok: false });
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16,
      padding: 22, display: "flex", flexDirection: "column", gap: 16
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>Invitar nuevo usuario</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#54504A", marginBottom: 7 }}>Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@ejemplo.com"
            style={{
              width: "100%", border: "1px solid #E0DACE", background: "#fff",
              borderRadius: 10, padding: "10px 13px", fontSize: 14, color: "#221F1B",
              outline: "none", fontFamily: "inherit", boxSizing: "border-box"
            }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#54504A", marginBottom: 7 }}>Rol</label>
          <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
            {(["admin", "superadmin"] as const).map((r) => (
              <label key={r} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 14, color: "#221F1B" }}>
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} />
                {r === "admin" ? "Admin" : "Super Admin"}
              </label>
            ))}
          </div>
        </div>
      </div>

      {role === "admin" && (
        <div>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#54504A", marginBottom: 7 }}>
            Nombre de la cancha / club
          </label>
          <input
            type="text" required value={venueName} onChange={(e) => setVenueName(e.target.value)}
            placeholder="ej. Pádel Norte"
            style={{
              width: "100%", border: "1px solid #E0DACE", background: "#fff",
              borderRadius: 10, padding: "10px 13px", fontSize: 14, color: "#221F1B",
              outline: "none", fontFamily: "inherit", boxSizing: "border-box"
            }}
          />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F1EA", borderRadius: 10, padding: "10px 14px", flex: 1, marginRight: 14 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#3E9B63", flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, color: "#6B6660" }}>El usuario recibirá un email para crear su contraseña.</span>
        </div>
        <button
          type="submit" disabled={loading}
          style={{
            background: loading ? "#D9876B" : "#C96442", color: "#fff", border: "none",
            borderRadius: 10, padding: "11px 22px", fontWeight: 600, fontSize: 14,
            cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap"
          }}
        >
          {loading ? "Enviando..." : "Enviar invitación"}
        </button>
      </div>

      {message && (
        <p style={{ fontSize: 13.5, color: message.ok ? "#2F7D4E" : "#B23A28", margin: 0 }}>{message.text}</p>
      )}
    </form>
  );
}
