CREATE TABLE "admin_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" "role" NOT NULL,
	"venue_name" text,
	"token_hash" text NOT NULL,
	"invited_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "admin_invitations" ADD CONSTRAINT "admin_invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_invitations_email_idx" ON "admin_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "admin_invitations_pending_email_idx" ON "admin_invitations" USING btree ("email") WHERE "admin_invitations"."accepted_at" IS NULL AND "admin_invitations"."revoked_at" IS NULL;