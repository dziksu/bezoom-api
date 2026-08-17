import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/** Private, per-account application and notification preferences. */
export const userSettings = pgTable(
  'user_settings',
  {
    profileId: uuid('profile_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    theme: varchar('theme', { length: 10 }).notNull().default('DARK'),
    eventRemindersEnabled: boolean('event_reminders_enabled').notNull().default(true),
    nearbyEventsEnabled: boolean('nearby_events_enabled').notNull().default(true),
    socialActivityEnabled: boolean('social_activity_enabled').notNull().default(false),
    language: varchar('language', { length: 10 }).notNull().default('pl'),
    country: varchar('country', { length: 2 }).notNull().default('PL'),
    currency: varchar('currency', { length: 3 }).notNull().default('PLN'),
    timeZone: varchar('time_zone', { length: 64 }).notNull().default('Europe/Warsaw'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    check('user_settings_theme_check', sql`${table.theme} IN ('LIGHT', 'DARK')`),
    check('user_settings_language_check', sql`${table.language} ~ '^[a-z]{2,3}(-[A-Z]{2})?$'`),
    check('user_settings_country_check', sql`${table.country} ~ '^[A-Z]{2}$'`),
    check('user_settings_currency_check', sql`${table.currency} ~ '^[A-Z]{3}$'`)
  ]
);
