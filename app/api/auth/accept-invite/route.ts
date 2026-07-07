import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  acceptAdminInvitation,
  AdminInvitationError,
  getValidAdminInvitationByToken,
} from "@/lib/auth/admin-invitations";
import { getUserByAuthId, getUserByEmail } from "@/lib/db/queries";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres."),
  clubName: z.string().trim().min(1).max(120).optional(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }

  const invitation = await getValidAdminInvitationByToken(parsed.data.token);
  if (!invitation) {
    return NextResponse.json(
      { error: "La invitación es inválida o expiró. Pedí que te la reenvíen." },
      { status: 400 }
    );
  }

  if (invitation.role === "admin" && !(parsed.data.clubName?.trim() || invitation.venueName)) {
    return NextResponse.json({ error: "El nombre de la cancha es requerido." }, { status: 400 });
  }

  const existingProfile = await getUserByEmail(invitation.email);
  if (existingProfile) {
    return NextResponse.json({ error: "Ese email ya tiene una cuenta activa." }, { status: 409 });
  }

  const adminClient = getSupabaseAdmin();
  const { data: list } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const existingAuth = (list?.users ?? []).find(
    (user) => (user.email ?? "").toLowerCase() === invitation.email
  );

  let authUserId: string;
  if (existingAuth) {
    const existingProfileByAuth = await getUserByAuthId(existingAuth.id);
    if (existingProfileByAuth) {
      return NextResponse.json({ error: "Ese email ya tiene una cuenta activa." }, { status: 409 });
    }

    const { data, error } = await adminClient.auth.admin.updateUserById(existingAuth.id, {
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        invited_role: invitation.role,
        ...(invitation.venueName ? { venue_name: invitation.venueName } : {}),
      },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "No se pudo crear el usuario." },
        { status: 400 }
      );
    }
    authUserId = data.user.id;
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      email: invitation.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: {
        invited_role: invitation.role,
        ...(invitation.venueName ? { venue_name: invitation.venueName } : {}),
      },
    });
    if (error || !data.user) {
      return NextResponse.json(
        { error: error?.message ?? "No se pudo crear el usuario." },
        { status: 400 }
      );
    }
    authUserId = data.user.id;
  }

  try {
    const { invitation: accepted } = await acceptAdminInvitation({
      token: parsed.data.token,
      authUserId,
      passwordEmail: invitation.email,
      clubName: parsed.data.clubName,
    });

    return NextResponse.json({
      ok: true,
      email: invitation.email,
      role: accepted.role,
      redirectTo: accepted.role === "superadmin" ? "/superadmin" : "/dashboard",
    });
  } catch (error) {
    if (error instanceof AdminInvitationError) {
      const status = error.code === "ACCOUNT_ACTIVE" ? 409 : 400;
      return NextResponse.json({ error: error.message }, { status });
    }
    const message = error instanceof Error ? error.message : "Error desconocido";
    console.error("[accept invite] error creando perfil:", message);
    return NextResponse.json({ error: "No se pudo completar la invitación." }, { status: 500 });
  }
}
