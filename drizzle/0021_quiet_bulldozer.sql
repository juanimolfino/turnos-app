ALTER TABLE "bookings" ADD COLUMN "mp_refund_id" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "refund_status" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mp_refund_id_unique" UNIQUE("mp_refund_id");