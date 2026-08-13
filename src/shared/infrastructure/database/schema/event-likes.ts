import { index, pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { events } from './events';

export const eventLikes = pgTable(
  'event_likes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    keycloakSub: text('keycloak_sub').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex('event_likes_event_keycloak_sub_idx').on(t.eventId, t.keycloakSub),
    index('event_likes_user_created_idx').on(t.keycloakSub, t.createdAt.desc(), t.id.desc()),
    index('event_likes_event_created_idx').on(t.eventId, t.createdAt.desc(), t.id.desc())
  ]
);
