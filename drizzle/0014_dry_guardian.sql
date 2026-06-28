CREATE TABLE "club_mercadopago_credentials" (
	"club_id" uuid PRIMARY KEY NOT NULL,
	"mercadopago_user_id" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"public_key" text,
	"scope" text,
	"live_mode" boolean,
	"expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "club_mercadopago_credentials" ADD CONSTRAINT "club_mercadopago_credentials_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;