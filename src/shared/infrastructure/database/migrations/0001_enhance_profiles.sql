-- Migration: 0001_enhance_profiles_schema
-- Description: Add new fields to profiles table for comprehensive profile management
-- - Add account type support (personal/business)
-- - Add business profile fields (business name, NIP, description, website)
-- - Add verification fields (phone verification, business verification)
-- - Add social metrics (followers, following counts)
-- - Add account settings (private profile, deactivation)

ALTER TABLE "profiles" ADD COLUMN "account_type" varchar(20) NOT NULL DEFAULT 'personal';
ALTER TABLE "profiles" ADD COLUMN "username" text UNIQUE;
ALTER TABLE "profiles" ADD COLUMN "email" text;
ALTER TABLE "profiles" ADD COLUMN "phone_number" text;
ALTER TABLE "profiles" ADD COLUMN "avatar_storage_path" text;
ALTER TABLE "profiles" ADD COLUMN "interests" text[];
ALTER TABLE "profiles" ADD COLUMN "business_name" text;
ALTER TABLE "profiles" ADD COLUMN "nip" varchar(10) UNIQUE;
ALTER TABLE "profiles" ADD COLUMN "business_description" text;
ALTER TABLE "profiles" ADD COLUMN "website_url" text;
ALTER TABLE "profiles" ADD COLUMN "is_phone_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "phone_verification_token" text;
ALTER TABLE "profiles" ADD COLUMN "business_verification_status" varchar(20) DEFAULT 'unverified';
ALTER TABLE "profiles" ADD COLUMN "business_verification_date" timestamp with time zone;
ALTER TABLE "profiles" ADD COLUMN "followers_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "profiles" ADD COLUMN "following_count" integer NOT NULL DEFAULT 0;
ALTER TABLE "profiles" ADD COLUMN "is_private" boolean NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "is_deactivated" boolean NOT NULL DEFAULT false;

-- Create index on business-related fields for faster lookups
CREATE INDEX "idx_profiles_account_type" ON "profiles" ("account_type");
CREATE INDEX "idx_profiles_nip" ON "profiles" ("nip");
CREATE INDEX "idx_profiles_business_verification_status" ON "profiles" ("business_verification_status");
CREATE INDEX "idx_profiles_is_phone_verified" ON "profiles" ("is_phone_verified");
