CREATE TYPE "public"."payment_mode" AS ENUM('none', 'partial', 'full');--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "payment_mode" "payment_mode" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "deposit_pct" integer DEFAULT 25 NOT NULL;--> statement-breakpoint
ALTER TABLE "courts" ADD COLUMN "price" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "clubs"
SET
  "payment_mode" = CASE
    WHEN "requires_payment" = false THEN 'none'::"payment_mode"
    WHEN EXISTS (
      SELECT 1
      FROM "club_mercadopago_credentials"
      WHERE "club_mercadopago_credentials"."club_id" = "clubs"."id"
    ) THEN 'full'::"payment_mode"
    WHEN "mercadopago_access_token" IS NOT NULL AND btrim("mercadopago_access_token") <> '' THEN 'full'::"payment_mode"
    ELSE 'none'::"payment_mode"
  END,
  "deposit_pct" = 25,
  "requires_payment" = CASE
    WHEN "requires_payment" = true AND (
      EXISTS (
        SELECT 1
        FROM "club_mercadopago_credentials"
        WHERE "club_mercadopago_credentials"."club_id" = "clubs"."id"
      )
      OR ("mercadopago_access_token" IS NOT NULL AND btrim("mercadopago_access_token") <> '')
    ) THEN true
    ELSE false
  END;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_deposit_pct_range" CHECK ("clubs"."deposit_pct" >= 1 AND "clubs"."deposit_pct" <= 100);--> statement-breakpoint
ALTER TABLE "courts" ADD CONSTRAINT "courts_price_non_negative" CHECK ("courts"."price" >= 0);
