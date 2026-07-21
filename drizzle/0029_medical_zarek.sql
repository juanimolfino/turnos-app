CREATE TABLE "operational_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"club_id" uuid,
	"booking_id" uuid,
	"customer_id" uuid,
	"payment_id" text,
	"request_path" text,
	"message" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "operational_incidents" ADD CONSTRAINT "operational_incidents_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_incidents" ADD CONSTRAINT "operational_incidents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_incidents" ADD CONSTRAINT "operational_incidents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operational_incidents_created_idx" ON "operational_incidents" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "operational_incidents_status_created_idx" ON "operational_incidents" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_incidents_booking_type_unique" ON "operational_incidents" USING btree ("booking_id","type");