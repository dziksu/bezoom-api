import { NotFoundException } from '@nestjs/common';
import { ReportEventCommand } from './report-event.command';
import { ReportEventHandler } from './report-event.handler';

describe('ReportEventHandler', () => {
  const report = {
    id: 'd45f5bb8-bf19-4a6f-bbab-61e338e12262',
    eventId: 'a0cf776e-5e07-497f-a32e-cd5eb1243312',
    reason: 'SPAM' as const,
    description: 'Repeated misleading links',
    status: 'PENDING' as const,
    createdAt: new Date('2026-08-13T12:00:00.000Z')
  };

  it('returns a pending report without exposing the reporter', async () => {
    const repository = { createPending: jest.fn().mockResolvedValue(report) };
    const handler = new ReportEventHandler(repository);

    const result = await handler.execute(
      new ReportEventCommand(report.eventId, 'reporter-sub', 'SPAM', report.description)
    );

    expect(repository.createPending).toHaveBeenCalledWith(report.eventId, 'reporter-sub', 'SPAM', report.description);
    expect(result).toEqual(report);
    expect(result).not.toHaveProperty('reportedByKeycloakSub');
  });

  it('masks drafts, archived and unknown events with EVENT_NOT_FOUND', async () => {
    const repository = { createPending: jest.fn().mockResolvedValue(null) };
    const handler = new ReportEventHandler(repository);

    await expect(handler.execute(new ReportEventCommand(report.eventId, 'reporter-sub', 'FRAUD'))).rejects.toEqual(
      new NotFoundException('EVENT_NOT_FOUND')
    );
  });
});
