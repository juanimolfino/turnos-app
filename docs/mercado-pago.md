# Mercado Pago

This template supports Mercado Pago Checkout Pro for one-time credit pack purchases.

## Environment

Set these variables per product:

- `MERCADOPAGO_ACCESS_TOKEN`: Mercado Pago private access token.
- `MERCADOPAGO_WEBHOOK_SECRET`: secret signature generated in Mercado Pago Webhooks settings.
- `MERCADOPAGO_CURRENCY`: checkout currency, for example `ARS`, `BRL`, `MXN`, `CLP`, `COP`, `PEN`, or `UYU`.
- `NEXT_PUBLIC_APP_URL`: public HTTPS app URL. Mercado Pago cannot deliver webhooks to `localhost`.

Use only one environment at a time:

- Sandbox/test: `MERCADOPAGO_ACCESS_TOKEN` starts with `TEST-`.
- Production: `MERCADOPAGO_ACCESS_TOKEN` starts with `APP_USR-`.

Do not mix test credentials with real Mercado Pago accounts or production credentials with test buyers/cards.

## Mercado Pago Dashboard

1. Create or select an application in Mercado Pago Developers.
2. Configure Webhooks for the Payments event.
3. Use `https://your-domain.com/api/mercadopago/webhook` as the webhook URL.
4. Copy the generated secret signature to `MERCADOPAGO_WEBHOOK_SECRET`.
5. Use test credentials first, then switch to production credentials for launch.

## Checkout Behavior

Checkout Pro is created from `app/api/mercadopago/checkout/route.ts`.

- Test credentials redirect to `sandbox_init_point` when Mercado Pago returns one.
- Production credentials redirect to `init_point`.
- The preference does not set `payer.email`. Let Mercado Pago identify the buyer in its own checkout. Pre-filling the payer can block real payments when the logged-in app user matches the seller account.
- Do not pay with the same Mercado Pago account that owns the seller credentials.

## Pricing Notes

Mercado Pago may reject card payments for very small amounts. In Argentina, `ARS 1` did not enable card payment during production testing.

Credit packs keep the Stripe demo prices in `price`, and use `mercadoPagoPrice` for Checkout Pro:

- `credits_10`: Stripe demo price `1`, Mercado Pago price `100`.
- `credits_50`: Stripe demo price `2`, Mercado Pago price `200`.

Update both visible pricing and `lib/stripe/pricing.ts` when adapting the template to a real product.

## Testing Checklist

For sandbox:

1. Use a `TEST-` access token in Vercel.
2. Create a buyer test account in Mercado Pago Developers.
3. Open the deployed app in an incognito browser.
4. Start a fresh checkout from `/pricing`; do not reuse old Mercado Pago links.
5. Log in to Mercado Pago with the buyer test account and use test cards.

For production:

1. Use an `APP_USR-` access token in Vercel.
2. Configure `NEXT_PUBLIC_APP_URL` with the deployed domain, for example `https://your-domain.com`.
3. Configure the webhook URL as `https://your-domain.com/api/mercadopago/webhook`.
4. Redeploy after changing Vercel environment variables.
5. Start a fresh checkout from `/pricing`.
6. Pay with a real buyer account and real card that are not the seller account.

After an approved payment, confirm:

- The Mercado Pago payment is approved.
- The webhook reaches `/api/mercadopago/webhook`.
- The user's credit balance increases.
- A transaction is created with `metadata.provider = "mercadopago"`.
- Replayed webhooks do not duplicate credits because the idempotency key is `mp_payment:<payment_id>`.

## Code Paths

- `app/api/mercadopago/checkout/route.ts`: creates Checkout Pro preferences for credit packs.
- `app/api/mercadopago/webhook/route.ts`: validates webhook signatures, fetches approved payments, and grants credits idempotently.
- `lib/mercadopago/client.ts`: lazy SDK clients.
- `app/(marketing)/pricing/page.tsx`: Stripe and Mercado Pago credit pack buttons.

## Reuse In Other Repos

Apply these changes to each project, then adapt:

- Credit pack prices in `lib/stripe/pricing.ts`.
- Currency in `MERCADOPAGO_CURRENCY`.
- Webhook URL in the Mercado Pago app settings.
- Product-specific `NEXT_PUBLIC_APP_URL`.
- Production payments require a real buyer account different from the seller account.
