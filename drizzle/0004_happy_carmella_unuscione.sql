ALTER TABLE "clubs" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "neighborhood" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "requires_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "payment_deadline_hours" integer DEFAULT 24 NOT NULL;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "mercadopago_access_token" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD COLUMN "api_key" text;--> statement-breakpoint
ALTER TABLE "clubs" ADD CONSTRAINT "clubs_api_key_unique" UNIQUE("api_key");