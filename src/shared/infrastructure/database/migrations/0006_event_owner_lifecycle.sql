ALTER TABLE "events" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "events_organizer_created_idx";
--> statement-breakpoint
CREATE INDEX "events_organizer_created_idx" ON "events" USING btree ("organizer_keycloak_sub", "created_at") WHERE "events"."archived_at" IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "events_public_discovery_start_idx";
--> statement-breakpoint
CREATE INDEX "events_public_discovery_start_idx" ON "events" USING btree ("start_date", "id") WHERE "events"."status" = 'PUBLISHED' AND "events"."visibility" = 'PUBLIC' AND "events"."verification_status" = 'VERIFIED' AND "events"."media_pipeline_status" = 'READY' AND "events"."archived_at" IS NULL;
