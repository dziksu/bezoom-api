ALTER TABLE "profiles"
ADD COLUMN "favorite_categories" "event_category"[];
--> statement-breakpoint
ALTER TABLE "profiles"
DROP COLUMN "interests";
