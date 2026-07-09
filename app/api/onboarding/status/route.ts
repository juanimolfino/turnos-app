import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, getOnboardingChecklistInput } from "@/lib/db/queries";
import { computeOnboardingDetail } from "@/lib/onboarding/checklist";

// Estado en vivo del checklist de onboarding para el club del admin autenticado.
// Lo consulta el AppShell al abrir el checklist y al volver el foco, para que se
// re-renderice apenas se completa un campo, sin recargar la página.
export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club" }, { status: 400 });

  const input = await getOnboardingChecklistInput(profile.clubId);
  return NextResponse.json(computeOnboardingDetail(input));
}
