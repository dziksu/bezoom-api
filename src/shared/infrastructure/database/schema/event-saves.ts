import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const eventSaves = pgTable(
  'event_saves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id').notNull(),
    keycloakSub: text('keycloak_sub').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('event_saves_event_keycloak_sub_idx').on(t.eventId, t.keycloakSub)]
);
