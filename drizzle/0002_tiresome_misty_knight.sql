CREATE TYPE "public"."role" AS ENUM('superadmin', 'admin');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "role";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "venue_name" text;