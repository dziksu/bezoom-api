ALTER TABLE "locations"
ADD COLUMN "geom" geometry(Point, 4326)
GENERATED ALWAYS AS (
  ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)
) STORED;
--> statement-breakpoint
CREATE INDEX "locations_geom_gist_idx" ON "locations" USING gist ("geom");
--> statement-breakpoint
CREATE INDEX "event_outbox_pending_type_order_idx"
ON "event_outbox" ("event_type", "occurred_at", "id")
WHERE "processed_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "event_outbox_processed_order_idx"
ON "event_outbox" ("processed_at", "id")
WHERE "processed_at" IS NOT NULL;
