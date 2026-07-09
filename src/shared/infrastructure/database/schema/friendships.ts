import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    keycloakSub1: text('keycloak_sub_1').notNull(),
    keycloakSub2: text('keycloak_sub_2').notNull(),
    status: text('status', {
      enum: ['PENDING', 'ACCEPTED', 'BLOCKED']
    })
      .notNull()
      .default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('friendships_keycloak_subs_idx').on(t.keycloakSub1, t.keycloakSub2)]
);
