import { NextResponse, type NextRequest } from "next/server";
import { confirmBookingPayment, getBookingById } from "@/lib/db/queries";

// MercadoPago back_url redirect after successful payment
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const booking = await getBookingById(id);
  if (!booking) return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });

  if (booking.status !== "confirmado") {
    await confirmBookingPayment(id);
  }

  // Redirect to a success page (or return JSON for bot use)
  return NextResponse.redirect(
    new URL(`/booking-confirmed?id=${id}`, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000")
  );
}
