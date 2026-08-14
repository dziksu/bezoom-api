import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { accountDeletions } from './account-deletions';

export const accountDeletionObjects = pgTable(
  'account_deletion_objects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    deletionId: uuid('deletion_id')
      .notNull()
      .references(() => accountDeletions.id, { onDelete: 'cascade' }),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, precision: 3 }),
    attempts: integer('attempts').notNull().default(0),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, precision: 3 })
  },
  (table) => [
    uniqueIndex('account_deletion_objects_path_uidx').on(table.deletionId, table.bucket, table.objectKey),
    index('account_deletion_objects_pending_idx').on(table.deletionId, table.processedAt)
  ]
);
