import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createManualCustomer, getUserByAuthId, listClubCustomers } from "@/lib/db/queries";

const customerSchema = z.object({
  name: z.string().min(2).max(90),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().email().max(120).nullable().optional().or(z.literal("")),
  notes: z.string().max(500).nullable().optional(),
});

function cleanText(value: string | null | undefined, maxLength: number) {
  const cleaned = value
    ?.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[<>{}\[\]`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
  return cleaned || null;
}

function cleanPhone(value: string | null | undefined) {
  const cleaned = value
    ?.replace(/<[^>]*>/g, " ")
    .replace(/[^\d+().\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
  return cleaned || null;
}

async function getAdminClubId() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "No autenticado" }, { status: 401 }) };

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return { error: NextResponse.json({ error: "Sin club asignado" }, { status: 403 }) };

  return { clubId: profile.clubId };
}

export async function GET() {
  const auth = await getAdminClubId();
  if (auth.error) return auth.error;

  const customers = await listClubCustomers(auth.clubId);
  return NextResponse.json({ customers });
}

export async function POST(request: NextRequest) {
  const auth = await getAdminClubId();
  if (auth.error) return auth.error;

  const body = await request.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });

  const customer = await createManualCustomer({
    clubId: auth.clubId,
    name: cleanText(parsed.data.name, 90) ?? "",
    phone: cleanPhone(parsed.data.phone),
    email: cleanText(parsed.data.email || null, 120)?.toLowerCase() ?? null,
    notes: cleanText(parsed.data.notes, 500),
  });

  return NextResponse.json({ customer }, { status: 201 });
}
