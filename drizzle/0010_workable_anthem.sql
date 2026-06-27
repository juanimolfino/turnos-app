CREATE TYPE "public"."booking_origin" AS ENUM('admin', 'bot');--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "origin" "booking_origin" DEFAULT 'admin' NOT NULL;