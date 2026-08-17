import { randomUUID } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Event } from '../../domain/event.aggregate';
import type { EventRepository } from '../../domain/event.repository';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import type { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import { EventPipelineService } from './event-pipeline.service';

describe('EventPipelineService', () => {
  const createEvent = () =>
    Event.create(
      {
        title: 'Summer Jazz Night',
        description: 'This description is definitely at least fifty characters long for validation purposes.',
        category: 'MUSIC_AND_NIGHTLIFE',
        startDate: new Date(Date.now() + 86_400_000),
        organizerKeycloakSub: 'organizer-sub',
        location: { latitude: 50.0647, longitude: 19.945 },
        price: { priceType: 'FREE' },
        photos: [{ id: randomUUID(), rawKey: 'raw/photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 }]
      },
      randomUUID()
    );

  const build = (event: Event, nodeEnv = 'development') => {
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => {
        if (key === 'eventPipeline') return { mode: 'development_passthrough', dispatchIntervalMs: 500 };
        if (key === 'NODE_ENV') return nodeEnv;
        return fallback;
      })
    };
    const repository = {
      findById: jest.fn().mockResolvedValue(event),
      updateLifecycle: jest.fn().mockResolvedValue(undefined)
    };
    const storage = {
      rawBucket: 'raw-uploads',
      mediaBucket: 'media',
      statObject: jest
        .fn()
        .mockImplementation((bucket: string) =>
          Promise.resolve(bucket === 'raw-uploads' ? { size: 1000, mimeType: 'image/jpeg' } : null)
        ),
      copyObject: jest.fn().mockResolvedValue(undefined)
    };
    const cache = {
      delete: jest.fn().mockResolvedValue(undefined),
      incrementVersion: jest.fn().mockResolvedValue(undefined)
    };

    const service = new EventPipelineService(
      config as unknown as ConfigService,
      repository as unknown as EventRepository,
      storage as unknown as ObjectStorageService,
      cache as unknown as RedisCacheService
    );
    return { service, repository, storage };
  };

  it('copies raw photos and moves the event to READY without publishing it', async () => {
    const event = createEvent();
    const { service, repository, storage } = build(event);

    await service.process(event.id);

    expect(event.status).toBe('READY');
    expect(event.verificationStatus).toBe('VERIFIED');
    expect(event.photos[0].status).toBe('READY');
    expect(storage.copyObject).toHaveBeenCalledTimes(1);
    expect(repository.updateLifecycle).toHaveBeenCalledWith(event);
  });

  it('is idempotent once the event is ready', async () => {
    const event = createEvent();
    const { service, repository, storage } = build(event);
    await service.process(event.id);

    await service.process(event.id);

    expect(storage.copyObject).toHaveBeenCalledTimes(1);
    expect(repository.updateLifecycle).toHaveBeenCalledTimes(1);
  });

  it('fails closed in production even when passthrough is configured', async () => {
    const event = createEvent();
    const { service } = build(event, 'production');

    await expect(service.process(event.id)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
