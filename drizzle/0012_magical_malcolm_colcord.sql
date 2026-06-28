ALTER TABLE "bookings" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "customer_phone" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "booking_code" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_booking_code_unique" UNIQUE("booking_code");