import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';

export const eventComments = pgTable(
  'event_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    authorKeycloakSub: text('author_keycloak_sub').notNull(),
    parentId: uuid('parent_id'),
    body: text('body').notNull(),
    likesCount: integer('likes_count').default(0).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    check(
      'event_comments_body_length',
      sql`${table.deletedAt} IS NOT NULL OR char_length(btrim(${table.body})) BETWEEN 1 AND 500`
    ),
    check('event_comments_likes_non_negative', sql`${table.likesCount} >= 0`),
    foreignKey({
      name: 'event_comments_parent_id_fk',
      columns: [table.parentId],
      foreignColumns: [table.id]
    }).onDelete('set null'),
    index('event_comments_event_created_idx')
      .on(table.eventId, table.createdAt.desc(), table.id.desc())
      .where(sql`${table.deletedAt} IS NULL`),
    index('event_comments_author_created_idx').on(table.authorKeycloakSub, table.createdAt.desc()),
    index('event_comments_parent_idx').on(table.parentId),
    index('event_comments_event_author_created_idx')
      .on(table.eventId, table.authorKeycloakSub, table.createdAt.desc())
      .where(sql`${table.deletedAt} IS NULL`)
  ]
);
