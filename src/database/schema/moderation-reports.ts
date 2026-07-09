import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const moderationReports = pgTable('moderation_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reportedBy: uuid('reported_by').notNull(),
  eventId: uuid('event_id').notNull(),
  reason: text('reason').notNull(),
  description: text('description'),
  status: text('status', {
    enum: ['PENDING', 'REVIEWED', 'RESOLVED']
  })
    .notNull()
    .default('PENDING'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true })
});
