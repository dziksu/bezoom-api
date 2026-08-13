ALTER TABLE "events" ALTER COLUMN "created_at" TYPE timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "event_likes" ALTER COLUMN "created_at" TYPE timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "event_saves" ALTER COLUMN "saved_at" TYPE timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "event_participants" ALTER COLUMN "joined_at" TYPE timestamp(3) with time zone;
--> statement-breakpoint
CREATE TABLE "event_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_id" uuid NOT NULL,
  "author_keycloak_sub" text NOT NULL,
  "parent_id" uuid,
  "body" text NOT NULL,
  "edited_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_comments_body_length" CHECK ("deleted_at" IS NOT NULL OR char_length(btrim("body")) BETWEEN 1 AND 500),
  CONSTRAINT "event_comments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE,
  CONSTRAINT "event_comments_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "event_comments"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "event_comments_event_created_idx" ON "event_comments" ("event_id", "created_at" DESC, "id" DESC) WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "event_comments_author_created_idx" ON "event_comments" ("author_keycloak_sub", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX "event_comments_parent_idx" ON "event_comments" ("parent_id");
--> statement-breakpoint
DROP INDEX IF EXISTS "events_organizer_created_idx";
--> statement-breakpoint
CREATE INDEX "events_organizer_created_idx" ON "events" ("organizer_keycloak_sub", "created_at" DESC, "id" DESC) WHERE "archived_at" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "event_likes_user_created_idx";
--> statement-breakpoint
CREATE INDEX "event_likes_user_created_idx" ON "event_likes" ("keycloak_sub", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX "event_likes_event_created_idx" ON "event_likes" ("event_id", "created_at" DESC, "id" DESC);
--> statement-breakpoint
DROP INDEX IF EXISTS "event_saves_user_saved_idx";
--> statement-breakpoint
CREATE INDEX "event_saves_user_saved_idx" ON "event_saves" ("keycloak_sub", "saved_at" DESC, "id" DESC);
--> statement-breakpoint
DROP INDEX IF EXISTS "event_participants_user_joined_idx";
--> statement-breakpoint
CREATE INDEX "event_participants_user_joined_idx" ON "event_participants" ("keycloak_sub", "joined_at" DESC, "id" DESC);
--> statement-breakpoint
DROP INDEX IF EXISTS "event_participants_event_status_idx";
--> statement-breakpoint
CREATE INDEX "event_participants_event_status_idx" ON "event_participants" ("event_id", "status", "joined_at" DESC, "id" DESC);
