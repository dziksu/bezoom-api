import { isEventAvailableForEngagement, type EventVisibilitySnapshot } from './event-engagement.repository';

describe('isEventAvailableForEngagement', () => {
  const available: EventVisibilitySnapshot = {
    id: 'event-id',
    status: 'PUBLISHED',
    visibility: 'PUBLIC',
    verificationStatus: 'VERIFIED',
    mediaPipelineStatus: 'READY'
  };

  it('accepts only a fully published public event', () => {
    expect(isEventAvailableForEngagement(available)).toBe(true);
  });

  it.each([
    { status: 'UPLOADED' },
    { status: 'READY' },
    { status: 'REJECTED' },
    { visibility: 'PRIVATE' },
    { verificationStatus: 'UNVERIFIED' },
    { verificationStatus: 'REJECTED' },
    { mediaPipelineStatus: 'UPLOADED' },
    { mediaPipelineStatus: 'NEEDS_REVIEW' }
  ])('rejects an unavailable event snapshot: %o', (override) => {
    expect(isEventAvailableForEngagement({ ...available, ...override })).toBe(false);
  });
});
