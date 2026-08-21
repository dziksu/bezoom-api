import { index, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { eventComments } from './event-comments';
import { profiles } from './profiles';

export const eventCommentMentions = pgTable(
  'event_comment_mentions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    commentId: uuid('comment_id')
      .notNull()
      .references(() => eventComments.id, { onDelete: 'cascade' }),
    mentionedKeycloakSub: text('mentioned_keycloak_sub')
      .notNull()
      .references(() => profiles.keycloakSub, { onDelete: 'cascade' })
  },
  (table) => [
    uniqueIndex('event_comment_mentions_comment_user_uidx').on(table.commentId, table.mentionedKeycloakSub),
    index('event_comment_mentions_user_idx').on(table.mentionedKeycloakSub, table.commentId)
  ]
);
