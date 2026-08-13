import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';

export const moderationReportReasons = ['SPAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER'] as const;
export type ModerationReportReason = (typeof moderationReportReasons)[number];

export const moderationReportStatuses = ['PENDING', 'IGNORED', 'ESCALATED', 'RESOLVED'] as const;
export type ModerationReportStatus = (typeof moderationReportStatuses)[number];

export const moderationReports = pgTable(
  'moderation_reports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    reportedByKeycloakSub: text('reported_by_keycloak_sub').notNull(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    reason: text('reason', { enum: moderationReportReasons }).notNull(),
    description: text('description'),
    status: text('status', { enum: moderationReportStatuses }).notNull().default('PENDING'),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true })
  },
  (table) => [
    check(
      'moderation_reports_reason_check',
      sql`${table.reason} IN ('SPAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER')`
    ),
    check('moderation_reports_status_check', sql`${table.status} IN ('PENDING', 'IGNORED', 'ESCALATED', 'RESOLVED')`),
    check(
      'moderation_reports_description_length',
      sql`${table.description} IS NULL OR char_length(${table.description}) <= 1000`
    ),
    uniqueIndex('moderation_reports_pending_reporter_event_uidx')
      .on(table.reportedByKeycloakSub, table.eventId)
      .where(sql`${table.status} = 'PENDING'`),
    index('moderation_reports_pending_queue_idx')
      .on(table.createdAt, table.id)
      .where(sql`${table.status} = 'PENDING'`),
    index('moderation_reports_reporter_created_idx').on(
      table.reportedByKeycloakSub,
      table.createdAt.desc(),
      table.id.desc()
    )
  ]
);
