ALTER TABLE "clubs" ADD COLUMN "refund_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "refund_cutoff_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_refund_cutoff_hours_range" CHECK ("clubs"."refund_cutoff_hours" >= 1 AND "clubs"."refund_cutoff_hours" <= 720);