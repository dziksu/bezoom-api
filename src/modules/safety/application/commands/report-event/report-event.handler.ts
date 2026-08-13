import { NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EventReportRepository } from '../../../domain/event-report.repository';
import type { EventReportResponseDto } from '../../dto/safety.dto';
import { ReportEventCommand } from './report-event.command';

@CommandHandler(ReportEventCommand)
export class ReportEventHandler implements ICommandHandler<ReportEventCommand, EventReportResponseDto> {
  constructor(private readonly reports: EventReportRepository) {}

  async execute(command: ReportEventCommand): Promise<EventReportResponseDto> {
    const report = await this.reports.createPending(
      command.eventId,
      command.reporterKeycloakSub,
      command.reason,
      command.description
    );
    if (!report) throw new NotFoundException('EVENT_NOT_FOUND');

    return {
      id: report.id,
      eventId: report.eventId,
      reason: report.reason,
      description: report.description ?? undefined,
      status: report.status,
      createdAt: report.createdAt
    };
  }
}
