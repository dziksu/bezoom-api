import { index, pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { events } from './events';

export const eventParticipants = pgTable(
  'event_participants',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    keycloakSub: text('keycloak_sub').notNull(),
    status: text('status', {
      enum: ['MAYBE', 'CONFIRMED', 'DECLINED']
    })
      .notNull()
      .default('MAYBE'),
    joinedAt: timestamp('joined_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex('event_participants_event_keycloak_sub_idx').on(t.eventId, t.keycloakSub),
    index('event_participants_user_joined_idx').on(t.keycloakSub, t.joinedAt.desc(), t.id.desc()),
    index('event_participants_event_status_idx').on(t.eventId, t.status, t.joinedAt.desc(), t.id.desc())
  ]
);
