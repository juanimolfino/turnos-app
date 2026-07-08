CREATE TABLE "player_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"channel_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customers" ADD COLUMN "player_identity_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "player_identities_channel_identity_unique" ON "player_identities" USING btree ("channel","channel_user_id");--> statement-breakpoint
INSERT INTO "player_identities" ("channel", "channel_user_id")
SELECT DISTINCT "channel", "channel_user_id"
FROM "customers"
WHERE "channel" IS NOT NULL AND "channel_user_id" IS NOT NULL
ON CONFLICT ("channel", "channel_user_id") DO NOTHING;--> statement-breakpoint
UPDATE "customers"
SET "player_identity_id" = "player_identities"."id",
	"updated_at" = now()
FROM "player_identities"
WHERE "customers"."channel" = "player_identities"."channel"
	AND "customers"."channel_user_id" = "player_identities"."channel_user_id"
	AND "customers"."player_identity_id" IS NULL;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_player_identity_id_player_identities_id_fk" FOREIGN KEY ("player_identity_id") REFERENCES "public"."player_identities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customers_player_identity_id_idx" ON "customers" USING btree ("player_identity_id"); 
