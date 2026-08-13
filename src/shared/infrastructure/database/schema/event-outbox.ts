import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Durable integration events. Producers append in the same transaction as the source write. */
export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    attempts: integer('attempts').default(0).notNull()
  },
  (table) => [
    index('event_outbox_pending_idx')
      .on(table.occurredAt)
      .where(sql`${table.processedAt} IS NULL`)
  ]
);
