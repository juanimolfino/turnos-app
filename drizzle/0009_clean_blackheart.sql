ALTER TABLE "bookings" ALTER COLUMN "type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."booking_type";--> statement-breakpoint
CREATE TYPE "public"."booking_type" AS ENUM('simple', 'clase', 'fijo', 'evento', 'americano', 'torneo', 'bloqueo');--> statement-breakpoint
ALTER TABLE "bookings" ALTER COLUMN "type" SET DATA TYPE "public"."booking_type" USING "type"::"public"."booking_type";