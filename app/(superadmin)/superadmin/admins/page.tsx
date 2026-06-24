import { getAllAdmins, getAllClubs } from "@/lib/db/queries";
import { AdminsClient } from "@/components/superadmin/admins-client";

export const metadata = { title: "Admins · Super Admin" };

export default async function AdminsPage() {
  const [admins, clubs] = await Promise.all([getAllAdmins(), getAllClubs()]);
  return <AdminsClient admins={admins} clubs={clubs} />;
}
