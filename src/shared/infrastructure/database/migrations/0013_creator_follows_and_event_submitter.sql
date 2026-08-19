ALTER TABLE "events"
ADD COLUMN "submitted_by_is_organizer" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE "creator_follows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"follower_keycloak_sub" text NOT NULL,
	"followee_keycloak_sub" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creator_follows_not_self_check" CHECK ("creator_follows"."follower_keycloak_sub" <> "creator_follows"."followee_keycloak_sub")
);
--> statement-breakpoint
ALTER TABLE "creator_follows"
ADD CONSTRAINT "creator_follows_follower_keycloak_sub_profiles_keycloak_sub_fk"
FOREIGN KEY ("follower_keycloak_sub") REFERENCES "public"."profiles"("keycloak_sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "creator_follows"
ADD CONSTRAINT "creator_follows_followee_keycloak_sub_profiles_keycloak_sub_fk"
FOREIGN KEY ("followee_keycloak_sub") REFERENCES "public"."profiles"("keycloak_sub") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "creator_follows_pair_uidx" ON "creator_follows" USING btree ("follower_keycloak_sub", "followee_keycloak_sub");
--> statement-breakpoint
CREATE INDEX "creator_follows_follower_created_idx" ON "creator_follows" USING btree ("follower_keycloak_sub", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "creator_follows_followee_created_idx" ON "creator_follows" USING btree ("followee_keycloak_sub", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
