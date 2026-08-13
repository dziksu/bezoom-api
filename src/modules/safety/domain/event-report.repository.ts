import type {
  ModerationReportReason,
  ModerationReportStatus
} from '@api/shared/infrastructure/database/schema/moderation-reports';

export interface EventReportRecord {
  id: string;
  eventId: string;
  reason: ModerationReportReason;
  description: string | null;
  status: ModerationReportStatus;
  createdAt: Date;
}

export abstract class EventReportRepository {
  /** Returns null when the event is not currently public/reportable. */
  abstract createPending(
    eventId: string,
    reporterKeycloakSub: string,
    reason: ModerationReportReason,
    description?: string
  ): Promise<EventReportRecord | null>;
}
