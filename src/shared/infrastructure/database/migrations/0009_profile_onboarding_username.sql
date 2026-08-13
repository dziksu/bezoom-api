UPDATE "profiles"
SET "username" = lower(btrim("username"))
WHERE "username" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_username_format_check"
  CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_-]{3,20}$');
--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_username_lower_unique"
  ON "profiles" (lower("username"))
  WHERE "username" IS NOT NULL;
