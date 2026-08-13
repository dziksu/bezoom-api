ALTER TABLE "profiles" ADD COLUMN "phone_verification_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone_verification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "phone_verification_attempts" integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_verified_phone_unique" ON "profiles" ("phone_number") WHERE "is_phone_verified" = true AND "phone_number" IS NOT NULL;
