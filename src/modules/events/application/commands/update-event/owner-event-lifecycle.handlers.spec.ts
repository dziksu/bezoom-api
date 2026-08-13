import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@nestjs/common';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { Event, type CreateEventInput } from '../../../domain/event.aggregate';
import type { EventRepository } from '../../../domain/event.repository';
import { ArchiveEventCommand } from '../archive-event/archive-event.command';
import { ArchiveEventHandler } from '../archive-event/archive-event.handler';
import { CancelEventCommand } from '../cancel-event/cancel-event.command';
import { CancelEventHandler } from '../cancel-event/cancel-event.handler';
import { ResubmitEventCommand } from '../resubmit-event/resubmit-event.command';
import { ResubmitEventHandler } from '../resubmit-event/resubmit-event.handler';
import { UpdateEventCommand } from './update-event.command';
import { UpdateEventHandler } from './update-event.handler';

describe('owner event lifecycle handlers', () => {
  const ownerSub = 'organizer-sub';
  const input = (): CreateEventInput => ({
    title: 'Summer Jazz Night',
    description: 'This description is definitely at least fifty characters long for validation purposes.',
    category: 'MUSIC_AND_NIGHTLIFE',
    startDate: new Date(Date.now() + 86_400_000),
    organizerKeycloakSub: ownerSub,
    location: { latitude: 50.0647, longitude: 19.945 },
    price: { priceType: 'FREE' },
    photos: [{ id: randomUUID(), rawKey: 'raw/photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 }]
  });

  const build = (event: Event | null) => {
    const repository = {
      findById: jest.fn().mockResolvedValue(event),
      update: jest.fn().mockResolvedValue(undefined),
      findPhotosForRevision: jest.fn()
    };
    const cache = { delete: jest.fn().mockResolvedValue(undefined) };
    const storage = { rawBucket: 'raw-uploads', statObject: jest.fn() };
    return {
      repository,
      cache,
      update: new UpdateEventHandler(
        repository as unknown as EventRepository,
        storage as unknown as ObjectStorageService,
        cache as unknown as RedisCacheService
      ),
      resubmit: new ResubmitEventHandler(
        repository as unknown as EventRepository,
        cache as unknown as RedisCacheService
      ),
      cancel: new CancelEventHandler(repository as unknown as EventRepository, cache as unknown as RedisCacheService),
      archive: new ArchiveEventHandler(repository as unknown as EventRepository, cache as unknown as RedisCacheService)
    };
  };

  it('saves an edited published event as a draft and invalidates its public detail', async () => {
    const event = Event.create(input(), randomUUID());
    event.verify();
    event.markPhotoReady(event.photos[0].id, `events/${event.id}/photo.jpg`);
    event.markReady();
    event.publish();
    const { update, repository, cache } = build(event);

    const result = await update.execute(new UpdateEventCommand(event.id, ownerSub, { title: 'Revised Jazz Night' }));

    expect(result.status).toBe('DRAFT');
    expect(result.verificationStatus).toBe('UNVERIFIED');
    expect(repository.update).toHaveBeenCalledWith(event, { removedPhotoIds: [] });
    expect(cache.delete).toHaveBeenCalledWith('event_detail', event.id);
  });

  it('queues a revised rejected event for a fresh review', async () => {
    const event = Event.create(input(), randomUUID());
    event.reject('EVENT_MODERATION_REJECTED');
    event.revise({
      title: 'Revised Jazz Night',
      description: event.description,
      category: event.category,
      startDate: new Date(Date.now() + 172_800_000),
      location: { latitude: 50.0647, longitude: 19.945 },
      price: { priceType: 'FREE' },
      amenities: [],
      photos: event.photos
    });
    const { resubmit, repository } = build(event);

    const result = await resubmit.execute(new ResubmitEventCommand(event.id, ownerSub));

    expect(result.status).toBe('UPLOADED');
    expect(repository.update).toHaveBeenCalledWith(event, { enqueueReview: true });
  });

  it('keeps a cancelled event in owner history', async () => {
    const event = Event.create(input(), randomUUID());
    const { cancel, repository } = build(event);

    const result = await cancel.execute(new CancelEventCommand(event.id, ownerSub));

    expect(result.status).toBe('CANCELLED');
    expect(event.archivedAt).toBeUndefined();
    expect(repository.update).toHaveBeenCalledWith(event);
  });

  it('soft-archives an owned event', async () => {
    const event = Event.create(input(), randomUUID());
    const { archive, repository } = build(event);

    await archive.execute(new ArchiveEventCommand(event.id, ownerSub));

    expect(event.archivedAt).toBeInstanceOf(Date);
    expect(repository.update).toHaveBeenCalledWith(event);
  });

  it('masks foreign events on every owner mutation', async () => {
    const event = Event.create(input(), randomUUID());
    const { update, resubmit, cancel, archive } = build(event);

    await expect(
      update.execute(new UpdateEventCommand(event.id, 'foreign-user', { title: 'Foreign edit' }))
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(resubmit.execute(new ResubmitEventCommand(event.id, 'foreign-user'))).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(cancel.execute(new CancelEventCommand(event.id, 'foreign-user'))).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(archive.execute(new ArchiveEventCommand(event.id, 'foreign-user'))).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
