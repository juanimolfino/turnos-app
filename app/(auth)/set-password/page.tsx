import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SetPasswordForm } from "@/components/auth/set-password-form";

export const metadata = { title: "Crear contraseña" };

export default async function SetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center px-6">
      <h1 className="text-3xl font-semibold">Bienvenido</h1>
      <p className="mb-6 mt-2 text-muted-foreground">
        Creá tu contraseña para acceder al sistema.
      </p>
      <SetPasswordForm />
    </main>
  );
}
