import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const eventParticipants = pgTable(
  'event_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    keycloakSub: text('keycloak_sub').notNull(),
    status: text('status', {
      enum: ['MAYBE', 'CONFIRMED', 'DECLINED']
    })
      .notNull()
      .default('MAYBE'),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('event_participants_event_keycloak_sub_idx').on(t.eventId, t.keycloakSub)]
);
