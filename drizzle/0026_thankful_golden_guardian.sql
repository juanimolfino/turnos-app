CREATE TYPE "public"."admin_notification_kind" AS ENUM('nueva_reserva');--> statement-breakpoint
CREATE TABLE "admin_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"booking_id" uuid NOT NULL,
	"kind" "admin_notification_kind" DEFAULT 'nueva_reserva' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_notifications" ADD CONSTRAINT "admin_notifications_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_notifications_club_created_idx" ON "admin_notifications" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_notifications_booking_kind_unique" ON "admin_notifications" USING btree ("booking_id","kind");--> statement-breakpoint
-- SEGURIDAD: deny-by-default como el resto de las tablas (ver lib/db/rls.sql).
-- La app lee/escribe esta tabla solo server-side (Drizzle/owner, bypassea RLS);
-- la anon key nunca la toca. Activar RLS sin políticas + revocar grants públicos.
ALTER TABLE "admin_notifications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON "admin_notifications" FROM anon, authenticated;