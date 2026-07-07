import { getAllAdmins, getAllClubs, getAdminInvitations } from "@/lib/db/queries";
import { AdminsClient } from "@/components/superadmin/admins-client";

export const metadata = { title: "Admins · Super Admin" };

export default async function AdminsPage() {
  const [admins, clubs, invitationRows] = await Promise.all([
    getAllAdmins(),
    getAllClubs(),
    getAdminInvitations(),
  ]);

  const invitations = invitationRows.map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    venueName: inv.venueName,
    invitedByEmail: inv.invitedBy?.email ?? null,
    createdAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    acceptedAt: inv.acceptedAt,
    revokedAt: inv.revokedAt,
  }));

  return <AdminsClient admins={admins} clubs={clubs} invitations={invitations} />;
}
