import type { ModerationReportReason } from '@api/shared/infrastructure/database/schema/moderation-reports';

export class ReportEventCommand {
  constructor(
    public readonly eventId: string,
    public readonly reporterKeycloakSub: string,
    public readonly reason: ModerationReportReason,
    public readonly description?: string
  ) {}
}
