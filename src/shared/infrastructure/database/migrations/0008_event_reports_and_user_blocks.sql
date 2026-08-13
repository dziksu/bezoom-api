ALTER TABLE "moderation_reports" ADD COLUMN "reported_by_keycloak_sub" text;
--> statement-breakpoint
UPDATE "moderation_reports" AS report
SET "reported_by_keycloak_sub" = profile."keycloak_sub"
FROM "profiles" AS profile
WHERE profile."id" = report."reported_by";
--> statement-breakpoint
DELETE FROM "moderation_reports" WHERE "reported_by_keycloak_sub" IS NULL;
--> statement-breakpoint
DELETE FROM "moderation_reports" AS report
WHERE NOT EXISTS (SELECT 1 FROM "events" AS event WHERE event."id" = report."event_id");
--> statement-breakpoint
UPDATE "moderation_reports" SET "status" = 'ESCALATED' WHERE "status" = 'REVIEWED';
--> statement-breakpoint
UPDATE "moderation_reports"
SET "reason" = CASE upper("reason")
  WHEN 'SPAM' THEN 'SPAM'
  WHEN 'INAPPROPRIATE_CONTENT' THEN 'INAPPROPRIATE_CONTENT'
  WHEN 'INAPPROPRIATE CONTENT' THEN 'INAPPROPRIATE_CONTENT'
  WHEN 'FRAUD' THEN 'FRAUD'
  ELSE 'OTHER'
END;
--> statement-breakpoint
UPDATE "moderation_reports" SET "status" = 'RESOLVED'
WHERE "status" NOT IN ('PENDING', 'IGNORED', 'ESCALATED', 'RESOLVED');
--> statement-breakpoint
ALTER TABLE "moderation_reports" ALTER COLUMN "reported_by_keycloak_sub" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "moderation_reports" DROP COLUMN "reported_by";
--> statement-breakpoint
ALTER TABLE "moderation_reports" ALTER COLUMN "created_at" TYPE timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "moderation_reports"
  ADD CONSTRAINT "moderation_reports_event_id_events_id_fk"
  FOREIGN KEY ("event_id") REFERENCES "events"("id");
--> statement-breakpoint
ALTER TABLE "moderation_reports"
  ADD CONSTRAINT "moderation_reports_reason_check"
  CHECK ("reason" IN ('SPAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER'));
--> statement-breakpoint
ALTER TABLE "moderation_reports"
  ADD CONSTRAINT "moderation_reports_status_check"
  CHECK ("status" IN ('PENDING', 'IGNORED', 'ESCALATED', 'RESOLVED'));
--> statement-breakpoint
ALTER TABLE "moderation_reports"
  ADD CONSTRAINT "moderation_reports_description_length"
  CHECK ("description" IS NULL OR char_length("description") <= 1000);
--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_reports_pending_reporter_event_uidx"
  ON "moderation_reports" ("reported_by_keycloak_sub", "event_id")
  WHERE "status" = 'PENDING';
--> statement-breakpoint
CREATE INDEX "moderation_reports_pending_queue_idx"
  ON "moderation_reports" ("created_at", "id")
  WHERE "status" = 'PENDING';
--> statement-breakpoint
CREATE INDEX "moderation_reports_reporter_created_idx"
  ON "moderation_reports" ("reported_by_keycloak_sub", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE TABLE "user_blocks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "blocker_keycloak_sub" text NOT NULL,
  "blocked_keycloak_sub" text NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_blocks_not_self_check" CHECK ("blocker_keycloak_sub" <> "blocked_keycloak_sub")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_blocks_pair_uidx" ON "user_blocks" ("blocker_keycloak_sub", "blocked_keycloak_sub");
--> statement-breakpoint
CREATE INDEX "user_blocks_blocker_created_idx"
  ON "user_blocks" ("blocker_keycloak_sub", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX "user_blocks_blocked_idx" ON "user_blocks" ("blocked_keycloak_sub", "blocker_keycloak_sub");
