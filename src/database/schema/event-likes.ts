import { pgTable, uuid, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const eventLikes = pgTable(
  'event_likes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    userId: uuid('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('event_likes_event_user_idx').on(t.eventId, t.userId)]
);
