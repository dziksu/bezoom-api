ALTER TABLE "profiles" ADD COLUMN "account_type" varchar(20) NOT NULL DEFAULT 'personal';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar_storage_path" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "interests" text[];--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "business_name" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "nip" varchar(10);--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "business_description" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "website_url" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_phone_verified" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone_verification_token" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "business_verification_status" varchar(20) DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "business_verification_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "followers_count" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "following_count" integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_private" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "is_deactivated" boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE "profiles" DROP COLUMN "cover_photo_url";--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_username_unique" UNIQUE("username");
