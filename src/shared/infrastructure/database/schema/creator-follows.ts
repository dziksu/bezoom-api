import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

/** One-way relationship: a user follows an account that has created events. */
export const creatorFollows = pgTable(
  'creator_follows',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    followerKeycloakSub: text('follower_keycloak_sub')
      .notNull()
      .references(() => profiles.keycloakSub, { onDelete: 'cascade' }),
    followeeKeycloakSub: text('followee_keycloak_sub')
      .notNull()
      .references(() => profiles.keycloakSub, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('creator_follows_pair_uidx').on(table.followerKeycloakSub, table.followeeKeycloakSub),
    check('creator_follows_not_self_check', sql`${table.followerKeycloakSub} <> ${table.followeeKeycloakSub}`),
    index('creator_follows_follower_created_idx').on(
      table.followerKeycloakSub,
      table.createdAt.desc(),
      table.id.desc()
    ),
    index('creator_follows_followee_created_idx').on(table.followeeKeycloakSub, table.createdAt.desc(), table.id.desc())
  ]
);
