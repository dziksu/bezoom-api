import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

export const userBlocks = pgTable(
  'user_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blockerKeycloakSub: text('blocker_keycloak_sub').notNull(),
    blockedKeycloakSub: text('blocked_keycloak_sub').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('user_blocks_pair_uidx').on(table.blockerKeycloakSub, table.blockedKeycloakSub),
    check('user_blocks_not_self_check', sql`${table.blockerKeycloakSub} <> ${table.blockedKeycloakSub}`),
    index('user_blocks_blocker_created_idx').on(table.blockerKeycloakSub, table.createdAt.desc(), table.id.desc()),
    index('user_blocks_blocked_idx').on(table.blockedKeycloakSub, table.blockerKeycloakSub)
  ]
);
