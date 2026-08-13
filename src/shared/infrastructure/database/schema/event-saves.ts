import { index, pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { events } from './events';

export const eventSaves = pgTable(
  'event_saves',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    keycloakSub: text('keycloak_sub').notNull(),
    savedAt: timestamp('saved_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [
    uniqueIndex('event_saves_event_keycloak_sub_idx').on(t.eventId, t.keycloakSub),
    index('event_saves_user_saved_idx').on(t.keycloakSub, t.savedAt)
  ]
);
