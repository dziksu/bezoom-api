import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const accountDeletions = pgTable(
  'account_deletions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id),
    keycloakUserId: text('keycloak_user_id'),
    subjectHash: text('subject_hash').notNull(),
    status: text('status', {
      enum: ['REQUESTED', 'ANONYMIZING', 'ANONYMIZED', 'COMPLETED', 'CANCELLED']
    })
      .notNull()
      .default('REQUESTED'),
    requestedAt: timestamp('requested_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true, precision: 3 }).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, precision: 3 }).notNull(),
    anonymizedAt: timestamp('anonymized_at', { withTimezone: true, precision: 3 }),
    completedAt: timestamp('completed_at', { withTimezone: true, precision: 3 }),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, precision: 3 })
  },
  (table) => [
    check(
      'account_deletions_status_check',
      sql`${table.status} IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED', 'COMPLETED', 'CANCELLED')`
    ),
    uniqueIndex('account_deletions_active_profile_uidx')
      .on(table.profileId)
      .where(sql`${table.status} IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED')`),
    uniqueIndex('account_deletions_subject_hash_uidx')
      .on(table.subjectHash)
      .where(sql`${table.status} <> 'CANCELLED'`),
    index('account_deletions_due_idx')
      .on(table.nextAttemptAt, table.id)
      .where(sql`${table.status} IN ('REQUESTED', 'ANONYMIZING', 'ANONYMIZED')`)
  ]
);
