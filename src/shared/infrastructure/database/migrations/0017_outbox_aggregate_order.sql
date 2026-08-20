CREATE INDEX "event_outbox_pending_aggregate_order_idx"
ON "event_outbox" ("aggregate_id", "event_type", "occurred_at", "id")
WHERE "processed_at" IS NULL;
