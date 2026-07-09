import { pgTable, uuid, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const friendships = pgTable(
  'friendships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId1: uuid('user_id_1').notNull(),
    userId2: uuid('user_id_2').notNull(),
    status: text('status', {
      enum: ['PENDING', 'ACCEPTED', 'BLOCKED']
    })
      .notNull()
      .default('PENDING'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  (t) => [uniqueIndex('friendships_users_idx').on(t.userId1, t.userId2)]
);
