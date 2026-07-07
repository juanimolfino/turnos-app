import { getValidAdminInvitationByToken } from "@/lib/auth/admin-invitations";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata = { title: "Aceptar invitación" };

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const invitation = token ? await getValidAdminInvitationByToken(token) : null;

  if (!token || !invitation) {
    return <InvalidInvite />;
  }

  return (
    <SetPasswordForm
      askClubName={invitation.role === "admin"}
      initialClubName={invitation.venueName ?? ""}
      inviteToken={token}
      inviteEmail={invitation.email}
    />
  );
}

function InvalidInvite() {
  return (
    <div style={{
      minHeight: "100vh", background: "#F4F1EA",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24
    }}>
      <div style={{
        background: "#FCFBF8", border: "1px solid #E7E1D6", borderRadius: 16,
        padding: "32px 28px", maxWidth: 420, width: "100%", textAlign: "center"
      }}>
        <div style={{ fontSize: 36, marginBottom: 14 }}>!</div>
        <div style={{ fontFamily: "'Instrument Serif',Georgia,serif", fontSize: 22, color: "#221F1B", marginBottom: 8 }}>
          Enlace inválido
        </div>
        <div style={{ fontSize: 14, color: "#6B6660", lineHeight: 1.6, marginBottom: 22 }}>
          La invitación es inválida o expiró. Pedile al administrador que te reenvíe una nueva.
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
