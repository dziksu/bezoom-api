import { randomUUID } from 'crypto';
import { Event, type CreateEventInput } from './event.aggregate';
import { DomainValidationError } from './events.errors';
import { EventCreatedDomainEvent } from './events/event-created.domain-event';

describe('Event aggregate', () => {
  const future = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
  const longDescription = 'This description is definitely at least fifty characters long for validation purposes.';

  const onePhoto = () => [
    { id: randomUUID(), rawKey: 'raw/1.jpg', mediaKey: 'media/1.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 }
  ];

  const baseInput = (): CreateEventInput => ({
    title: 'Summer Jazz Night',
    description: longDescription,
    category: 'MUSIC_AND_NIGHTLIFE',
    startDate: future(1),
    organizerKeycloakSub: 'organizer-sub',
    location: { latitude: 50.0647, longitude: 19.945 },
    price: { priceType: 'FREE' },
    photos: onePhoto()
  });

  it('creates an uploaded event awaiting moderation with system reach', () => {
    const event = Event.create(baseInput(), randomUUID());

    expect(event.status).toBe('UPLOADED');
    expect(event.mediaPipelineStatus).toBe('UPLOADED');
    expect(event.verificationStatus).toBe('UNVERIFIED');
    expect(event.verifiedAt).toBeUndefined();
    expect(event.radiusKm).toBe(5);
  });

  it('raises exactly one EventCreatedDomainEvent', () => {
    const event = Event.create(baseInput(), randomUUID());
    const domainEvents = event.clearEvents();

    expect(domainEvents).toHaveLength(1);
    expect(domainEvents[0]).toBeInstanceOf(EventCreatedDomainEvent);
    expect((domainEvents[0] as EventCreatedDomainEvent).eventId).toBe(event.id);
  });

  it('rejects a description shorter than 50 characters', () => {
    const input = { ...baseInput(), description: 'too short' };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('rejects a title shorter than 3 characters', () => {
    const input = { ...baseInput(), title: 'ab' };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('rejects a startDate in the past', () => {
    const input = { ...baseInput(), startDate: future(-1) };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('rejects zero photos', () => {
    const input = { ...baseInput(), photos: [] };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('rejects more than 5 photos', () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({
      id: randomUUID(),
      rawKey: `raw/${i}.jpg`,
      mediaKey: `media/${i}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 1000
    }));
    const input = { ...baseInput(), photos };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('rejects an out-of-range latitude', () => {
    const input = { ...baseInput(), location: { latitude: 91, longitude: 19.945 } };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('rejects an invalid FIXED price', () => {
    const input = { ...baseInput(), price: { priceType: 'FIXED' as const, priceMin: 0 } };
    expect(() => Event.create(input, randomUUID())).toThrow(DomainValidationError);
  });

  it('reject() sets REJECTED status with a reason and clears verifiedAt', () => {
    const event = Event.create(baseInput(), randomUUID());

    event.reject('Contains prohibited content');

    expect(event.verificationStatus).toBe('REJECTED');
    expect(event.verificationRejectionReason).toBe('Contains prohibited content');
    expect(event.verifiedAt).toBeUndefined();
  });

  it('reject() requires a non-empty reason', () => {
    const event = Event.create(baseInput(), randomUUID());
    expect(() => event.reject('')).toThrow(DomainValidationError);
  });

  it('verify() re-verifies a previously rejected event and clears the reason', () => {
    const event = Event.create(baseInput(), randomUUID());
    event.reject('some reason');

    event.verify();

    expect(event.verificationStatus).toBe('VERIFIED');
    expect(event.verificationRejectionReason).toBeUndefined();
    expect(event.verifiedAt).toBeInstanceOf(Date);
  });

  it('cannot become ready before moderation approval', () => {
    const event = Event.create(baseInput(), randomUUID());

    expect(() => event.markReady()).toThrow('EVENT_NOT_READY');
  });

  it('publishes only after verification and the ready transition', () => {
    const event = Event.create(baseInput(), randomUUID());

    event.verify();
    event.markPhotoReady(event.photos[0].id, `events/${event.id}/cover.jpg`);
    event.markReady();
    event.publish();

    expect(event.status).toBe('PUBLISHED');
    expect(event.mediaPipelineStatus).toBe('READY');
  });

  it('cannot publish directly from uploaded', () => {
    const event = Event.create(baseInput(), randomUUID());

    expect(() => event.publish()).toThrow('EVENT_NOT_READY');
  });

  it('cannot become ready until every photo completed media processing', () => {
    const event = Event.create(baseInput(), randomUUID());
    event.verify();

    expect(() => event.markReady()).toThrow('EVENT_MEDIA_NOT_READY');
  });

  it('assigns photo positions in the given array order', () => {
    const photos = [
      { id: randomUUID(), rawKey: 'raw/a.jpg', mediaKey: 'media/a.jpg', mimeType: 'image/jpeg', sizeBytes: 100 },
      { id: randomUUID(), rawKey: 'raw/b.jpg', mediaKey: 'media/b.jpg', mimeType: 'image/jpeg', sizeBytes: 100 }
    ];
    const event = Event.create({ ...baseInput(), photos }, randomUUID());

    expect(event.photos.map((p) => p.position)).toEqual([0, 1]);
    expect(event.photos.map((p) => p.id)).toEqual(photos.map((p) => p.id));
  });
});
