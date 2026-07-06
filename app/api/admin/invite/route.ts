import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { cleanupIncompleteInvite, getUserByAuthId, getUserByEmail } from "@/lib/db/queries";
import { sendAdminInviteEmail } from "@/lib/email/send";

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["superadmin", "admin"]),
  venueName: z.string().min(1).optional()
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile || profile.role !== "superadmin") {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const { email, role, venueName } = parsed.data;
  const normalizedEmail = email.trim().toLowerCase();

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
  const adminClient = getSupabaseAdmin();

  // "Cuenta activa" significa Auth + perfil interno. Si Auth quedó confirmado pero
  // no llegó a crear `public.users`, fue un onboarding incompleto y se puede reinvitar.
  const { data: list } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const existing = (list?.users ?? []).find(
    (u) => (u.email ?? "").toLowerCase() === normalizedEmail
  );

  if (existing) {
    const existingProfile = await getUserByEmail(normalizedEmail);
    if (existingProfile) {
      return NextResponse.json(
        { error: "Ese email ya tiene una cuenta activa." },
        { status: 409 }
      );
    }

    // Invitación pendiente o onboarding incompleto: limpiamos Auth + posibles filas huérfanas
    // para reenviar un link nuevo sin dejar clubs creados a medias.
    await cleanupIncompleteInvite(normalizedEmail, existing.user_metadata?.club_id as string | undefined);
    const { error: delErr } = await adminClient.auth.admin.deleteUser(existing.id);
    if (delErr) {
      return NextResponse.json(
        { error: `No se pudo reiniciar la invitación: ${delErr.message}` },
        { status: 400 }
      );
    }
  }

  const { data: linkData, error } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: normalizedEmail,
    options: {
      redirectTo: `${origin}/invite/callback`,
      data: {
        invited_role: role,
        ...(venueName ? { venue_name: venueName } : {}),
      },
    },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  const inviteLink = linkData.properties?.action_link;
  if (!inviteLink || !linkData.user?.id) {
    return NextResponse.json({ error: "No se pudo generar el link de invitación." }, { status: 500 });
  }

  try {
    await sendAdminInviteEmail({
      email: normalizedEmail,
      inviteLink,
      role,
      venueName,
    });
  } catch (sendErr) {
    const message = sendErr instanceof Error ? sendErr.message : "No se pudo enviar la invitación.";
    console.warn("[admin invite] no se pudo enviar email automático; devolviendo link manual", {
      email: normalizedEmail,
      error: message,
    });
    return NextResponse.json({
      ok: true,
      emailSent: false,
      inviteLink,
      warning: message,
    });
  }

  return NextResponse.json({ ok: true, emailSent: true });
}
