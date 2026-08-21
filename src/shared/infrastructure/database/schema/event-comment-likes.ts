import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { eventComments } from './event-comments';
import { profiles } from './profiles';

export const eventCommentLikes = pgTable(
  'event_comment_likes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => eventComments.id, { onDelete: 'cascade' }),
    keycloakSub: text('keycloak_sub')
      .notNull()
      .references(() => profiles.keycloakSub, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex('event_comment_likes_comment_user_uidx').on(table.commentId, table.keycloakSub),
    index('event_comment_likes_user_created_idx').on(table.keycloakSub, table.createdAt.desc(), table.id.desc())
  ]
);
