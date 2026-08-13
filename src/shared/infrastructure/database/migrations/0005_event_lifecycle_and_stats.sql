ALTER TYPE "public"."event_status" ADD VALUE IF NOT EXISTS 'UPLOADED';--> statement-breakpoint
ALTER TYPE "public"."event_status" ADD VALUE IF NOT EXISTS 'READY';--> statement-breakpoint
ALTER TYPE "public"."event_status" ADD VALUE IF NOT EXISTS 'REJECTED';--> statement-breakpoint

ALTER TYPE "public"."visibility" RENAME TO "visibility_legacy";--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "visibility" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "visibility" TYPE "public"."visibility"
USING (CASE WHEN "visibility"::text = 'FRIENDS_ONLY' THEN 'PRIVATE' ELSE "visibility"::text END)::"public"."visibility";--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "visibility" SET DEFAULT 'PUBLIC';--> statement-breakpoint
DROP TYPE "public"."visibility_legacy";--> statement-breakpoint

ALTER TYPE "public"."event_photo_status" RENAME TO "event_photo_status_legacy";--> statement-breakpoint
CREATE TYPE "public"."event_photo_status" AS ENUM('PENDING_UPLOAD', 'UPLOADED', 'READY', 'REJECTED');--> statement-breakpoint
ALTER TABLE "event_photos" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "event_photos" ALTER COLUMN "status" TYPE "public"."event_photo_status"
USING (CASE WHEN "status"::text = 'CONFIRMED' THEN 'READY' ELSE "status"::text END)::"public"."event_photo_status";--> statement-breakpoint
ALTER TABLE "event_photos" ALTER COLUMN "status" SET DEFAULT 'PENDING_UPLOAD';--> statement-breakpoint
DROP TYPE "public"."event_photo_status_legacy";--> statement-breakpoint

UPDATE "events" SET "radius_km" = 5 WHERE "radius_km" IS NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "radius_km" SET NOT NULL;--> statement-breakpoint

CREATE TABLE "event_stats" (
  "event_id" uuid PRIMARY KEY NOT NULL,
  "likes_count" integer DEFAULT 0 NOT NULL,
  "saves_count" integer DEFAULT 0 NOT NULL,
  "attending_count" integer DEFAULT 0 NOT NULL,
  "comments_count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_stats_likes_non_negative" CHECK ("likes_count" >= 0),
  CONSTRAINT "event_stats_saves_non_negative" CHECK ("saves_count" >= 0),
  CONSTRAINT "event_stats_attending_non_negative" CHECK ("attending_count" >= 0),
  CONSTRAINT "event_stats_comments_non_negative" CHECK ("comments_count" >= 0)
);--> statement-breakpoint
ALTER TABLE "event_stats" ADD CONSTRAINT "event_stats_event_id_events_id_fk"
FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "event_stats" ("event_id", "likes_count", "saves_count", "attending_count")
SELECT
  e.id,
  (SELECT count(*)::integer FROM event_likes l WHERE l.event_id = e.id),
  (SELECT count(*)::integer FROM event_saves s WHERE s.event_id = e.id),
  (SELECT count(*)::integer FROM event_participants p WHERE p.event_id = e.id AND p.status = 'CONFIRMED')
FROM events e
ON CONFLICT (event_id) DO NOTHING;--> statement-breakpoint

CREATE TABLE "event_outbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "aggregate_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "attempts" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE INDEX "event_outbox_pending_idx" ON "event_outbox" USING btree ("occurred_at") WHERE "processed_at" IS NULL;--> statement-breakpoint

DELETE FROM "event_likes" WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_likes.event_id);--> statement-breakpoint
DELETE FROM "event_saves" WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_saves.event_id);--> statement-breakpoint
DELETE FROM "event_participants" WHERE NOT EXISTS (SELECT 1 FROM events WHERE events.id = event_participants.event_id);--> statement-breakpoint
ALTER TABLE "event_likes" ADD CONSTRAINT "event_likes_event_id_events_id_fk"
FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_saves" ADD CONSTRAINT "event_saves_event_id_events_id_fk"
FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_events_id_fk"
FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_likes_user_created_idx" ON "event_likes" USING btree ("keycloak_sub", "created_at");--> statement-breakpoint
CREATE INDEX "event_saves_user_saved_idx" ON "event_saves" USING btree ("keycloak_sub", "saved_at");--> statement-breakpoint
CREATE INDEX "event_participants_user_joined_idx" ON "event_participants" USING btree ("keycloak_sub", "joined_at");--> statement-breakpoint
CREATE INDEX "event_participants_event_status_idx" ON "event_participants" USING btree ("event_id", "status");--> statement-breakpoint
CREATE INDEX "events_organizer_created_idx" ON "events" USING btree ("organizer_keycloak_sub", "created_at");--> statement-breakpoint
CREATE INDEX "events_public_discovery_start_idx" ON "events" USING btree ("start_date", "id")
WHERE "status" = 'PUBLISHED' AND "visibility" = 'PUBLIC' AND "verification_status" = 'VERIFIED' AND "media_pipeline_status" = 'READY';--> statement-breakpoint
CREATE INDEX "event_photos_ready_position_idx" ON "event_photos" USING btree ("event_id", "status", "position");--> statement-breakpoint
