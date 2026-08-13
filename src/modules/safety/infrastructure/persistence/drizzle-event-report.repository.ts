import { Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DrizzleWriteService } from '@api/shared/infrastructure/drizzle-write.service';
import { events, moderationReports } from '@api/shared/infrastructure/database/schema';
import type { ModerationReportReason } from '@api/shared/infrastructure/database/schema/moderation-reports';
import { EventReportRepository, type EventReportRecord } from '../../domain/event-report.repository';

@Injectable()
export class DrizzleEventReportRepository extends EventReportRepository {
  constructor(private readonly drizzle: DrizzleWriteService) {
    super();
  }

  async createPending(
    eventId: string,
    reporterKeycloakSub: string,
    reason: ModerationReportReason,
    description?: string
  ): Promise<EventReportRecord | null> {
    return this.drizzle.db.transaction(async (tx) => {
      const [reportable] = await tx
        .select({ id: events.id })
        .from(events)
        .where(
          and(
            eq(events.id, eventId),
            eq(events.status, 'PUBLISHED'),
            eq(events.mediaPipelineStatus, 'READY'),
            eq(events.verificationStatus, 'VERIFIED'),
            eq(events.visibility, 'PUBLIC'),
            isNull(events.archivedAt)
          )
        )
        .limit(1);
      if (!reportable) return null;

      const [created] = await tx
        .insert(moderationReports)
        .values({
          eventId,
          reportedByKeycloakSub: reporterKeycloakSub,
          reason,
          description
        })
        .onConflictDoNothing()
        .returning();
      if (created) return created;

      const [existing] = await tx
        .select()
        .from(moderationReports)
        .where(
          and(
            eq(moderationReports.eventId, eventId),
            eq(moderationReports.reportedByKeycloakSub, reporterKeycloakSub),
            eq(moderationReports.status, 'PENDING')
          )
        )
        .limit(1);
      return existing ?? null;
    });
  }
}
