CREATE INDEX "events_public_discovery_reach_idx"
ON "events" ("radius_km", "start_date", "id")
WHERE "status" = 'PUBLISHED'
  AND "visibility" = 'PUBLIC'
  AND "verification_status" = 'VERIFIED'
  AND "media_pipeline_status" = 'READY'
  AND "archived_at" IS NULL;
