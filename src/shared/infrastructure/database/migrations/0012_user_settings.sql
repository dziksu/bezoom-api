CREATE TABLE "user_settings" (
  "profile_id" uuid PRIMARY KEY NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "theme" varchar(10) DEFAULT 'DARK' NOT NULL,
  "event_reminders_enabled" boolean DEFAULT true NOT NULL,
  "nearby_events_enabled" boolean DEFAULT true NOT NULL,
  "social_activity_enabled" boolean DEFAULT false NOT NULL,
  "language" varchar(10) DEFAULT 'pl' NOT NULL,
  "country" varchar(2) DEFAULT 'PL' NOT NULL,
  "currency" varchar(3) DEFAULT 'PLN' NOT NULL,
  "time_zone" varchar(64) DEFAULT 'Europe/Warsaw' NOT NULL,
  "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "user_settings_theme_check" CHECK ("theme" IN ('LIGHT', 'DARK')),
  CONSTRAINT "user_settings_language_check" CHECK ("language" ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  CONSTRAINT "user_settings_country_check" CHECK ("country" ~ '^[A-Z]{2}$'),
  CONSTRAINT "user_settings_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
INSERT INTO "user_settings" ("profile_id")
SELECT "id" FROM "profiles" WHERE "account_status" <> 'ANONYMIZED'
ON CONFLICT ("profile_id") DO NOTHING;
