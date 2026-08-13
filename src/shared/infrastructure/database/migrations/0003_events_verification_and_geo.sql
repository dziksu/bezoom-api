CREATE TYPE "public"."event_photo_status" AS ENUM('PENDING_UPLOAD', 'CONFIRMED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('UNVERIFIED', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "event_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"owner_keycloak_sub" text NOT NULL,
	"raw_key" text NOT NULL,
	"media_key" text,
	"status" "event_photo_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"position" integer,
	"mime_type" text NOT NULL,
	"size_bytes" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "verification_status" "verification_status" DEFAULT 'UNVERIFIED' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "verification_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "geog" geography(Point,4326) GENERATED ALWAYS AS ((ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography)) STORED;--> statement-breakpoint
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_photos_event_id_idx" ON "event_photos" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "locations_geog_gist_idx" ON "locations" USING gist ("geog");