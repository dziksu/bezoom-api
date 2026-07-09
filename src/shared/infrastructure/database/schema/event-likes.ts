import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const eventLikes = pgTable(
  'event_likes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    keycloakSub: text('keycloak_sub').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('event_likes_event_keycloak_sub_idx').on(t.eventId, t.keycloakSub)]
);
