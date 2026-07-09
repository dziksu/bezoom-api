import { pgTable, uuid, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull(),
  type: text('type', {
    enum: [
      'EVENT_INVITATION',
      'FRIEND_REQUEST',
      'EVENT_LIKE',
      'EVENT_COMMENT',
      'EVENT_UPDATE',
      'EVENT_REMINDER',
      'NEW_EVENT_FROM_FOLLOWED',
      'MENTION',
      'QNA_ANSWER',
      'REVIEW_RESPONSE'
    ]
  }).notNull(),
  content: text('content').notNull(),
  relatedEntityId: uuid('related_entity_id'),
  isRead: boolean('is_read').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
});
