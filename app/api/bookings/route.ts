import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getUserByAuthId, createBooking } from "@/lib/db/queries";

const schema = z.object({
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string(),
  endTime: z.string(),
  type: z.enum(["simple", "clase", "fijo", "evento", "bloqueo"]),
  status: z.enum(["confirmado", "pendiente", "cancelado"]).optional(),
  customerId: z.string().uuid().nullable().optional(),
  professorId: z.string().uuid().nullable().optional(),
  eventId: z.string().uuid().nullable().optional(),
  price: z.number().int().nullable().optional(),
  paymentStatus: z.enum(["pagado", "senado", "impago"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const profile = await getUserByAuthId(user.id);
  if (!profile?.clubId) return NextResponse.json({ error: "Sin club asignado" }, { status: 403 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });

  const { customerName, customerPhone, ...rest } = parsed.data;

  let customerId = rest.customerId ?? null;
  if (!customerId && customerName && customerPhone) {
    const { findOrCreateCustomer } = await import("@/lib/db/queries");
    const customer = await findOrCreateCustomer(profile.clubId, customerName, customerPhone);
    customerId = customer.id;
  }

  const booking = await createBooking({ ...rest, clubId: profile.clubId, customerId });
  return NextResponse.json({ booking });
}
