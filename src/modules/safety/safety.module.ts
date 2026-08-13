import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { EventReportRepository } from './domain/event-report.repository';
import { UserBlockRepository } from './domain/user-block.repository';
import { ReportEventHandler } from './application/commands/report-event/report-event.handler';
import { BlockUserHandler } from './application/commands/block-user/block-user.handler';
import { UnblockUserHandler } from './application/commands/unblock-user/unblock-user.handler';
import { ListBlockedUsersHandler } from './application/queries/list-blocked-users/list-blocked-users.handler';
import { DrizzleEventReportRepository } from './infrastructure/persistence/drizzle-event-report.repository';
import { DrizzleUserBlockRepository } from './infrastructure/persistence/drizzle-user-block.repository';
import { EventReportsController } from './presentation/event-reports.controller';
import { UserBlocksController } from './presentation/user-blocks.controller';

@Module({
  imports: [CqrsModule],
  controllers: [EventReportsController, UserBlocksController],
  providers: [
    ReportEventHandler,
    BlockUserHandler,
    UnblockUserHandler,
    ListBlockedUsersHandler,
    { provide: EventReportRepository, useClass: DrizzleEventReportRepository },
    { provide: UserBlockRepository, useClass: DrizzleUserBlockRepository }
  ],
  exports: [UserBlockRepository]
})
export class SafetyModule {}
