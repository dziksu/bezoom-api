CREATE TYPE "public"."event_category" AS ENUM('ARTS_AND_CULTURE', 'ENTERTAINMENT', 'SPORT_AND_RECREATION', 'EDUCATION_AND_DEVELOPMENT', 'SOCIAL_MEETUPS', 'FESTIVALS_AND_FAIRS', 'TRADE_AND_MARKETS', 'FAMILY_AND_KIDS', 'BUSINESS_AND_CAREER', 'COMMUNITY_AND_ACTIVISM', 'MUSIC_AND_NIGHTLIFE', 'HEALTH_AND_WELLNESS', 'FOOD_AND_CULINARY');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'PUBLISHED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."media_pipeline_status" AS ENUM('UPLOADED', 'REJECTED', 'NEEDS_REVIEW', 'APPROVED', 'READY');--> statement-breakpoint
CREATE TYPE "public"."price_type" AS ENUM('FREE', 'FIXED', 'RANGE', 'DONATION');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('PUBLIC', 'PRIVATE', 'FRIENDS_ONLY');--> statement-breakpoint
CREATE TABLE "businesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_sub" text NOT NULL,
	"name" text NOT NULL,
	"nip" text,
	"krs" text,
	"regon" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"logo_url" text,
	"website" text,
	"verified_at" timestamp with time zone,
	"verified_by" uuid,
	"verification_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "businesses_keycloak_sub_unique" UNIQUE("keycloak_sub"),
	CONSTRAINT "businesses_nip_unique" UNIQUE("nip")
);
--> statement-breakpoint
CREATE TABLE "event_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"keycloak_sub" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"keycloak_sub" text NOT NULL,
	"status" text DEFAULT 'MAYBE' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_saves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"keycloak_sub" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" "event_category" NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone,
	"organizer_keycloak_sub" text NOT NULL,
	"image_url" text,
	"price_type" "price_type",
	"price_min" numeric(10, 2),
	"price_max" numeric(10, 2),
	"currency" text DEFAULT 'PLN',
	"ticket_url" text,
	"price_notes" text,
	"amenities" text[],
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"media_pipeline_status" "media_pipeline_status",
	"moderation_score_max" numeric(5, 4),
	"moderated_at" timestamp with time zone,
	"visibility" "visibility" DEFAULT 'PUBLIC' NOT NULL,
	"radius_km" integer DEFAULT 5,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_sub_1" text NOT NULL,
	"keycloak_sub_2" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"address" text,
	"city" text,
	"country" text DEFAULT 'PL',
	"event_id" uuid NOT NULL,
	CONSTRAINT "locations_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "moderation_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reported_by" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"resolution" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_sub" text NOT NULL,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"related_entity_id" uuid,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keycloak_sub" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"bio" text,
	"avatar_url" text,
	"cover_photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_keycloak_sub_unique" UNIQUE("keycloak_sub")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "event_likes_event_keycloak_sub_idx" ON "event_likes" USING btree ("event_id","keycloak_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "event_participants_event_keycloak_sub_idx" ON "event_participants" USING btree ("event_id","keycloak_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "event_saves_event_keycloak_sub_idx" ON "event_saves" USING btree ("event_id","keycloak_sub");--> statement-breakpoint
CREATE UNIQUE INDEX "friendships_keycloak_subs_idx" ON "friendships" USING btree ("keycloak_sub_1","keycloak_sub_2");