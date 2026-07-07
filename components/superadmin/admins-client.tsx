"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { deriveInvitationStatus, type InvitationStatus } from "@/lib/auth/invitation-status";

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

interface Invitation {
  id: string;
  email: string;
  role: string;
  venueName: string | null;
  invitedByEmail: string | null;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

const ROLE_LABEL: Record<string, string> = { superadmin: "Super Admin", admin: "Admin" };
const ROLE_STYLE: Record<string, { bg: string; color: string }> = {
  superadmin: { bg: "#F1EAF7", color: "#6B4E9E" },
  admin: { bg: "#EAF0F8", color: "#3D5C93" },
};

const INVITATION_STATUS_LABEL: Record<InvitationStatus, string> = {
  pendiente: "Pendiente",
  expirada: "Expirada",
  aceptada: "Aceptada",
  reemplazada: "Reemplazada",
};
const INVITATION_STATUS_STYLE: Record<InvitationStatus, { bg: string; color: string }> = {
  pendiente: { bg: "#FBF3D9", color: "#8A6D1D" },
  expirada: { bg: "#FBEBE2", color: "#B0572C" },
  aceptada: { bg: "#E9F3EA", color: "#2F7D4E" },
  reemplazada: { bg: "#F4F1EA", color: "#928B7E" },
};

export function AdminsClient({ admins, clubs, invitations }: { admins: Admin[]; clubs: Club[]; invitations: Invitation[] }) {
  const [showForm, setShowForm] = useState(false);
  const isMobile = useIsMobile();
  const router = useRouter();

  return (
    <div style={{ padding: isMobile ? "12px 14px 40px" : "24px 28px 48px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "flex-end", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: isMobile ? 24 : 28, color: "#221F1B" }}>Admins</div>
          <div style={{ fontSize: 14, color: "#6B6660", marginTop: 4 }}>
            {admins.length} usuario{admins.length !== 1 ? "s" : ""} en el sistema
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: "#C96442", color: "#fff", border: "none",
            borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14,
            cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 8px -2px rgba(201,100,66,.5)",
            width: isMobile ? "100%" : "auto"
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
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 480 : "auto" }}>
            <thead>
              <tr style={{ background: "#F7F4EE" }}>
                {["Usuario", "Rol", "Club / Cancha", "Registrado"].map((h) => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F", whiteSpace: "nowrap" }}>
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
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: "50%", background: "#EDE7DB",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontWeight: 700, color: "#6B6660", fontSize: 12, flexShrink: 0
                        }}>
                          {initial}
                        </div>
                        <span style={{ fontSize: 13.5, color: "#221F1B", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>{admin.email}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: st.bg, color: st.color, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {ROLE_LABEL[admin.role ?? "admin"]}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "#6B6660", whiteSpace: "nowrap" }}>
                      {admin.venueName ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#928B7E", whiteSpace: "nowrap" }}>
                      {new Date(admin.createdAt).toLocaleDateString("es-AR")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <InvitationsTable invitations={invitations} onChanged={() => router.refresh()} />
    </div>
  );
}

function InvitationsTable({ invitations, onChanged }: { invitations: Invitation[]; onChanged: () => void }) {
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B", marginTop: 4 }}>
        Invitaciones
      </div>
      <div style={{ background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" as React.CSSProperties["WebkitOverflowScrolling"] }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: isMobile ? 620 : "auto" }}>
            <thead>
              <tr style={{ background: "#F7F4EE" }}>
                {["Email", "Rol", "Club / Cancha", "Estado", "Invitada", "Invitó", ""].map((h) => (
                  <th key={h} style={{ padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "#A39C8F", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invitations.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: "18px 16px", fontSize: 13.5, color: "#928B7E" }}>
                    Todavía no se envió ninguna invitación.
                  </td>
                </tr>
              )}
              {invitations.map((inv) => {
                const status = deriveInvitationStatus(inv);
                const statusSt = INVITATION_STATUS_STYLE[status];
                const roleSt = ROLE_STYLE[inv.role] ?? ROLE_STYLE.admin;
                const canResend = status === "pendiente" || status === "expirada";
                return (
                  <tr key={inv.id} style={{ borderTop: "1px solid #EFEAE0" }}>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "#221F1B", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {inv.email}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: roleSt.bg, color: roleSt.color, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {ROLE_LABEL[inv.role] ?? inv.role}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13.5, color: "#6B6660", whiteSpace: "nowrap" }}>
                      {inv.venueName ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ background: statusSt.bg, color: statusSt.color, borderRadius: 999, padding: "4px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                        {INVITATION_STATUS_LABEL[status]}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#928B7E", whiteSpace: "nowrap" }}>
                      {new Date(inv.createdAt).toLocaleDateString("es-AR")}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: 13, color: "#928B7E", whiteSpace: "nowrap" }}>
                      {inv.invitedByEmail ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                      {canResend && (
                        <ResendInviteButton
                          email={inv.email}
                          role={inv.role as "admin" | "superadmin"}
                          venueName={inv.venueName}
                          onDone={onChanged}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ResendInviteButton({ email, role, venueName, onDone }: {
  email: string; role: "admin" | "superadmin"; venueName: string | null; onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function resend() {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/admin/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role, venueName: venueName ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "No se pudo reenviar"); return; }
      onDone();
    } catch { setError("Error de conexión"); }
    finally { setLoading(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        onClick={resend}
        disabled={loading}
        style={{
          border: "1px solid #E0DACE", background: "#fff", color: "#54504A",
          borderRadius: 8, padding: "6px 12px", fontSize: 12.5, fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
        }}
      >
        {loading ? "Reenviando..." : "Reenviar"}
      </button>
      {error && <span style={{ fontSize: 11.5, color: "#B23A28" }}>{error}</span>}
    </div>
  );
}

function InviteForm({ clubs, onSuccess }: { clubs: Club[]; onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "superadmin">("admin");
  const [venueName, setVenueName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean; inviteLink?: string } | null>(null);
  const isMobile = useIsMobile();

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
      if (data.emailSent === false && data.inviteLink) {
        setMessage({
          text: "La invitación se creó, pero no pudimos enviar el email automático. Copiá este link y mandáselo al usuario.",
          ok: true,
          inviteLink: data.inviteLink,
        });
        return;
      }
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
      padding: isMobile ? 16 : 22, display: "flex", flexDirection: "column", gap: 14
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#221F1B" }}>Invitar nuevo usuario</div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
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
          <div style={{ display: "flex", gap: 16, paddingTop: 4 }}>
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

      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", flexDirection: isMobile ? "column" : "row", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F4F1EA", borderRadius: 10, padding: "10px 14px", flex: 1 }}>
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
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ fontSize: 13.5, color: message.ok ? "#2F7D4E" : "#B23A28", margin: 0 }}>{message.text}</p>
          {message.inviteLink && (
            <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
              <input
                readOnly
                value={message.inviteLink}
                onFocus={(event) => event.currentTarget.select()}
                style={{
                  width: "100%",
                  minWidth: 0,
                  border: "1px solid #CFE6D2",
                  background: "#F7FBF7",
                  borderRadius: 9,
                  padding: "9px 11px",
                  fontSize: 12,
                  color: "#2F7D4E",
                  fontFamily: "monospace",
                  boxSizing: "border-box",
                }}
              />
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(message.inviteLink ?? "")}
                style={{
                  border: "1px solid #CFE6D2",
                  background: "#FFFFFF",
                  color: "#2F7D4E",
                  borderRadius: 9,
                  padding: "0 12px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Copiar
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
