ALTER TABLE "customers" ADD COLUMN "channel" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "channel_user_id" text;--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_bot_identity_unique" ON "customers" USING btree ("club_id","channel","channel_user_id") WHERE "customers"."channel" IS NOT NULL AND "customers"."channel_user_id" IS NOT NULL;