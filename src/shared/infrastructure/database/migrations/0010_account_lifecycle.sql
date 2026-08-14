ALTER TABLE "profiles"
  ADD COLUMN "account_status" text DEFAULT 'ACTIVE' NOT NULL;
--> statement-breakpoint
ALTER TABLE "profiles"
  ADD COLUMN "identity_synced_at" timestamp(3) with time zone;
--> statement-breakpoint
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_account_status_check"
  CHECK ("account_status" IN ('ACTIVE', 'DEACTIVATED', 'PENDING_DELETION', 'ANONYMIZED'));
--> statement-breakpoint
UPDATE "profiles"
SET "account_status" = 'DEACTIVATED'
WHERE "is_deactivated" = true;
--> statement-breakpoint
CREATE TABLE "account_deletions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL REFERENCES "profiles"("id"),
  "keycloak_user_id" text,
  "subject_hash" text NOT NULL,
  "status" text DEFAULT 'REQUESTED' NOT NULL,
  "requested_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "scheduled_at" timestamp(3) with time zone NOT NULL,
  "next_attempt_at" timestamp(3) with time zone NOT NULL,
  "anonymized_at" timestamp(3) with time zone,
  "completed_at" timestamp(3) with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp(3) with time zone,
  CONSTRAINT "account_deletions_status_check"
    CHECK ("status" IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED', 'COMPLETED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_active_profile_uidx"
  ON "account_deletions" ("profile_id")
  WHERE "status" IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED');
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_subject_hash_uidx"
  ON "account_deletions" ("subject_hash")
  WHERE "status" <> 'CANCELLED';
--> statement-breakpoint
CREATE INDEX "account_deletions_due_idx"
  ON "account_deletions" ("next_attempt_at", "id")
  WHERE "status" IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED');
--> statement-breakpoint
CREATE TABLE "account_deletion_objects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "deletion_id" uuid NOT NULL REFERENCES "account_deletions"("id") ON DELETE CASCADE,
  "bucket" text NOT NULL,
  "object_key" text NOT NULL,
  "processed_at" timestamp(3) with time zone,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp(3) with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletion_objects_path_uidx"
  ON "account_deletion_objects" ("deletion_id", "bucket", "object_key");
--> statement-breakpoint
CREATE INDEX "account_deletion_objects_pending_idx"
  ON "account_deletion_objects" ("deletion_id", "processed_at");
--> statement-breakpoint
CREATE INDEX "event_photos_owner_event_idx"
  ON "event_photos" ("owner_keycloak_sub", "event_id");
--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx"
  ON "notifications" ("keycloak_sub", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX "friendships_second_user_idx"
  ON "friendships" ("keycloak_sub_2", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX "events_organizer_all_created_idx"
  ON "events" ("organizer_keycloak_sub", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE INDEX "event_outbox_aggregate_type_idx"
  ON "event_outbox" ("aggregate_id", "event_type");
