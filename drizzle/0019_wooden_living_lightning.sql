ALTER TABLE "bookings" ADD COLUMN "mp_payment_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "payment_review_reason" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mp_payment_id_unique" UNIQUE("mp_payment_id");