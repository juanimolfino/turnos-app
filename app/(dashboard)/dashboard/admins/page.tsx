import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getAllAdmins } from "@/lib/db/queries";
import { AdminInviteForm } from "@/components/dashboard/admin-invite-form";

export const metadata = { title: "Gestión de admins" };

export default async function AdminsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getUserByAuthId(user.id);
  if (!profile || profile.role !== "superadmin") redirect("/dashboard");

  const admins = await getAllAdmins();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-6 text-3xl font-semibold">Gestión de admins</h1>
      <AdminInviteForm />
      <h2 className="mb-4 mt-10 text-xl font-semibold">Usuarios registrados</h2>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-left font-medium">Rol</th>
              <th className="px-4 py-3 text-left font-medium">Cancha</th>
              <th className="px-4 py-3 text-left font-medium">Registrado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {admins.map((admin) => (
              <tr key={admin.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">{admin.email}</td>
                <td className="px-4 py-3 capitalize">{admin.role}</td>
                <td className="px-4 py-3">{admin.venueName ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(admin.createdAt).toLocaleDateString("es-AR")}
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  No hay usuarios registrados aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
