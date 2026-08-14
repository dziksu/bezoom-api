import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@api/shared/infrastructure/auth';
import type { ICurrentUser } from '@api/shared/infrastructure/auth';
import { RedisRateLimit } from '@api/shared/infrastructure/rate-limit';
import { ReportEventCommand } from '../application/commands/report-event/report-event.command';
import { EventReportResponseDto, ReportEventDto } from '../application/dto/safety.dto';

@ApiTags('Safety')
@ApiBearerAuth('JWT-auth')
@Controller('events')
export class EventReportsController {
  constructor(private readonly commandBus: CommandBus) {}

  @ApiOperation({ summary: 'Report a public event for automated moderation review' })
  @ApiResponse({ status: 201, type: EventReportResponseDto })
  @ApiResponse({ status: 404, description: 'Event is not publicly reportable' })
  @HttpCode(HttpStatus.CREATED)
  @Post(':eventId/reports')
  @RedisRateLimit(
    { name: 'event_report_user', limit: 10, windowSeconds: 3600, scopes: ['user'] },
    { name: 'event_report_ip', limit: 50, windowSeconds: 3600, scopes: ['ip'] }
  )
  report(
    @CurrentUser() user: ICurrentUser,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: ReportEventDto
  ): Promise<EventReportResponseDto> {
    return this.commandBus.execute(new ReportEventCommand(eventId, user.id, dto.reason, dto.description));
  }
}
