-- New events start in the NEARBY tier (< 5 km). Existing events retain their
-- current reach level, so this change affects only rows created after deploy.
ALTER TABLE "events" ALTER COLUMN "radius_km" SET DEFAULT 1;--> statement-breakpoint
