import { randomUUID } from 'crypto';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Event, type CreateEventInput } from '../../../domain/event.aggregate';
import type { EventRepository } from '../../../domain/event.repository';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { PublishEventCommand } from './publish-event.command';
import { PublishEventHandler } from './publish-event.handler';

describe('PublishEventHandler', () => {
  const eventInput = (): CreateEventInput => ({
    title: 'Summer Jazz Night',
    description: 'This description is definitely at least fifty characters long for validation purposes.',
    category: 'MUSIC_AND_NIGHTLIFE',
    startDate: new Date(Date.now() + 86_400_000),
    organizerKeycloakSub: 'organizer-sub',
    location: { latitude: 50.0647, longitude: 19.945 },
    price: { priceType: 'FREE' },
    photos: [{ id: randomUUID(), rawKey: 'raw/photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 }]
  });

  const readyEvent = () => {
    const event = Event.create(eventInput(), randomUUID());
    event.verify();
    event.markPhotoReady(event.photos[0].id, `events/${event.id}/photo.jpg`);
    event.markReady();
    return event;
  };

  const build = (event: Event | null, eligibilityError: string | null = null) => {
    const repository = {
      findById: jest.fn().mockResolvedValue(event),
      updateLifecycle: jest.fn().mockResolvedValue(undefined)
    };
    const policy = { getEligibilityError: jest.fn().mockResolvedValue(eligibilityError) };
    const cache = { delete: jest.fn().mockResolvedValue(undefined) };
    const handler = new PublishEventHandler(
      repository as unknown as EventRepository,
      policy,
      cache as unknown as RedisCacheService
    );
    return { handler, repository, cache };
  };

  it('publishes a ready event for a phone-verified organizer', async () => {
    const event = readyEvent();
    const { handler, repository, cache } = build(event);

    const result = await handler.execute(new PublishEventCommand(event.id, 'organizer-sub'));

    expect(result.status).toBe('PUBLISHED');
    expect(repository.updateLifecycle).toHaveBeenCalledWith(event);
    expect(cache.delete).toHaveBeenCalledWith('event_detail', event.id);
  });

  it('masks a foreign event as not found', async () => {
    const event = readyEvent();
    const { handler } = build(event);

    await expect(handler.execute(new PublishEventCommand(event.id, 'different-user'))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('requires a verified phone', async () => {
    const event = readyEvent();
    const { handler } = build(event, 'PHONE_VERIFICATION_REQUIRED');

    await expect(handler.execute(new PublishEventCommand(event.id, 'organizer-sub'))).rejects.toMatchObject({
      response: { message: 'PHONE_VERIFICATION_REQUIRED' }
    });
  });

  it('does not publish before the media pipeline is ready', async () => {
    const event = Event.create(eventInput(), randomUUID());
    const { handler } = build(event);

    await expect(handler.execute(new PublishEventCommand(event.id, 'organizer-sub'))).rejects.toBeInstanceOf(
      ConflictException
    );
  });
});
