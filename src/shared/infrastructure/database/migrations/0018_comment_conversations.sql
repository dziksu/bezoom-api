ALTER TABLE "event_comments"
ADD COLUMN "likes_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "event_comments"
ADD CONSTRAINT "event_comments_likes_non_negative" CHECK ("likes_count" >= 0);
--> statement-breakpoint
CREATE INDEX "event_comments_event_author_created_idx"
ON "event_comments" ("event_id", "author_keycloak_sub", "created_at" DESC)
WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "event_comment_likes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "keycloak_sub" text NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "event_comment_likes_comment_id_event_comments_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "event_comments"("id") ON DELETE CASCADE,
  CONSTRAINT "event_comment_likes_keycloak_sub_profiles_keycloak_sub_fk"
    FOREIGN KEY ("keycloak_sub") REFERENCES "profiles"("keycloak_sub") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "event_comment_likes_comment_user_uidx"
ON "event_comment_likes" ("comment_id", "keycloak_sub");
--> statement-breakpoint
CREATE INDEX "event_comment_likes_user_created_idx"
ON "event_comment_likes" ("keycloak_sub", "created_at" DESC, "id" DESC);
--> statement-breakpoint
CREATE TABLE "event_comment_mentions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "comment_id" uuid NOT NULL,
  "mentioned_keycloak_sub" text NOT NULL,
  CONSTRAINT "event_comment_mentions_comment_id_event_comments_id_fk"
    FOREIGN KEY ("comment_id") REFERENCES "event_comments"("id") ON DELETE CASCADE,
  CONSTRAINT "event_comment_mentions_keycloak_sub_profiles_keycloak_sub_fk"
    FOREIGN KEY ("mentioned_keycloak_sub") REFERENCES "profiles"("keycloak_sub") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE UNIQUE INDEX "event_comment_mentions_comment_user_uidx"
ON "event_comment_mentions" ("comment_id", "mentioned_keycloak_sub");
--> statement-breakpoint
CREATE INDEX "event_comment_mentions_user_idx"
ON "event_comment_mentions" ("mentioned_keycloak_sub", "comment_id");
