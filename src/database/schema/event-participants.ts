import { pgTable, uuid, timestamp, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const eventParticipants = pgTable(
  'event_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    userId: uuid('user_id').notNull(),
    status: text('status', {
      enum: ['MAYBE', 'CONFIRMED', 'DECLINED']
    })
      .notNull()
      .default('MAYBE'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('event_participants_event_user_idx').on(t.eventId, t.userId)]
);
