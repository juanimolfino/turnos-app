import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getClubByApiKey, findOrCreateCustomer, createBooking } from "@/lib/db/queries";

const schema = z.object({
  courtId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string(),
  endTime: z.string(),
  customerName: z.string().min(1),
  customerPhone: z.string().min(6),
  notes: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key") ?? new URL(request.url).searchParams.get("api_key");
  if (!apiKey) return NextResponse.json({ error: "x-api-key requerido" }, { status: 401 });

  const club = await getClubByApiKey(apiKey);
  if (!club) return NextResponse.json({ error: "API key inválida" }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos", detail: parsed.error.flatten() }, { status: 400 });

  const { customerName, customerPhone, courtId, date, startTime, endTime, notes } = parsed.data;

  const customer = await findOrCreateCustomer(club.id, customerName, customerPhone);

  // If club requires payment, create as pending; otherwise confirm directly
  const status = club.requiresPayment ? "pendiente" : "confirmado";

  const booking = await createBooking({
    clubId: club.id,
    courtId,
    date,
    startTime,
    endTime,
    type: "simple",
    status,
    customerId: customer.id,
    notes: notes ?? null,
  });

  let paymentUrl: string | null = null;
  if (club.requiresPayment && club.mercadopagoAccessToken) {
    try {
      const { MercadoPagoConfig, Preference } = await import("mercadopago");
      const mpClient = new MercadoPagoConfig({ accessToken: club.mercadopagoAccessToken });
      const preference = new Preference(mpClient);
      const pref = await preference.create({
        body: {
          items: [{
            id: booking.id,
            title: `Turno ${date} ${startTime}-${endTime} en ${club.name}`,
            quantity: 1,
            unit_price: booking.price ?? 1,
            currency_id: "ARS",
          }],
          external_reference: `booking:${booking.id}`,
          notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/public/bookings/webhook`,
          back_urls: {
            success: `${process.env.NEXT_PUBLIC_APP_URL}/api/public/bookings/${booking.id}/confirm`,
            failure: `${process.env.NEXT_PUBLIC_APP_URL}/booking-cancelled`,
          },
          auto_return: "approved",
        }
      });
      paymentUrl = pref.init_point ?? null;
    } catch {
      // If MP fails, booking is still created as pending
    }
  }

  return NextResponse.json({ booking, customer, paymentUrl, requiresPayment: club.requiresPayment });
}
