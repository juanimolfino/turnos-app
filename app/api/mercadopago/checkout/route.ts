import { NextResponse } from "next/server";
import { ensureUserProfile } from "@/lib/db/queries";
import { getMercadoPagoPreference } from "@/lib/mercadopago/client";
import { getCreditPack, getMercadoPagoCreditPackPrice } from "@/lib/stripe/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);

  const form = await request.formData();
  const pack = getCreditPack(String(form.get("packId") ?? "credits_10"));
  if (!pack) return NextResponse.json({ error: "Invalid credit pack" }, { status: 400 });

  const profile = await ensureUserProfile(user);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const currency = process.env.MERCADOPAGO_CURRENCY ?? "ARS";
  const unitPrice = getMercadoPagoCreditPackPrice(pack);
  const externalReference = `credits:${profile.id}:${pack.id}`;
  const isTestCredential = process.env.MERCADOPAGO_ACCESS_TOKEN?.startsWith("TEST-") ?? false;

  const preference = await getMercadoPagoPreference().create({
    body: {
      items: [
        {
          id: pack.id,
          title: `${pack.credits} credits`,
          quantity: 1,
          currency_id: currency,
          unit_price: unitPrice
        }
      ],
      back_urls: {
        success: `${appUrl}/dashboard?checkout=success&provider=mercadopago`,
        pending: `${appUrl}/dashboard?checkout=pending&provider=mercadopago`,
        failure: `${appUrl}/pricing?checkout=failure&provider=mercadopago`
      },
      auto_return: "approved",
      external_reference: externalReference,
      metadata: {
        provider: "mercadopago",
        kind: "credits",
        user_id: profile.id,
        pack_id: pack.id,
        credits: pack.credits
      },
      notification_url: `${appUrl}/api/mercadopago/webhook?source_news=webhooks`
    }
  });

  const redirectUrl = isTestCredential
    ? preference.sandbox_init_point ?? preference.init_point
    : preference.init_point ?? preference.sandbox_init_point;
  if (!redirectUrl) return NextResponse.json({ error: "Mercado Pago did not return a checkout URL" }, { status: 502 });

  return NextResponse.redirect(redirectUrl, 303);
}
