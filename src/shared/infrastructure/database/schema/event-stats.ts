import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';

/** Rebuildable, eventually-consistent counters used by the event read model. */
export const eventStats = pgTable(
  'event_stats',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => events.id, { onDelete: 'cascade' }),
    likesCount: integer('likes_count').default(0).notNull(),
    savesCount: integer('saves_count').default(0).notNull(),
    attendingCount: integer('attending_count').default(0).notNull(),
    commentsCount: integer('comments_count').default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check('event_stats_likes_non_negative', sql`${table.likesCount} >= 0`),
    check('event_stats_saves_non_negative', sql`${table.savesCount} >= 0`),
    check('event_stats_attending_non_negative', sql`${table.attendingCount} >= 0`),
    check('event_stats_comments_non_negative', sql`${table.commentsCount} >= 0`)
  ]
);
