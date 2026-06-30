import { NextResponse, type NextRequest } from "next/server";
import { expireBotHolds } from "@/lib/bookings/expire-holds";
import { secretMatches } from "@/lib/bot/verify";

function bearerToken(header: string | null) {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function POST(request: NextRequest) {
  const secret = process.env.EXPIRE_HOLDS_SECRET;
  const got = request.headers.get("x-expire-holds-secret") ?? bearerToken(request.headers.get("authorization"));

  if (!secret || !secretMatches(secret, got)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await expireBotHolds();
  return NextResponse.json({ ok: true, released: result.released, bookingIds: result.bookingIds });
}
