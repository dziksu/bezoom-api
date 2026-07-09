import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const eventSaves = pgTable(
  'event_saves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    userId: uuid('user_id').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('event_saves_event_user_idx').on(t.eventId, t.userId)]
);
