import { randomUUID } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { CreateEventHandler } from './create-event.handler';
import { CreateEventCommand } from './create-event.command';
import type { EventRepository, PendingPhoto } from '../../../domain/event.repository';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';

describe('CreateEventHandler', () => {
  const future = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();
  const longDescription = 'This description is definitely at least fifty characters long for validation purposes.';

  const pendingPhoto = (id: string): PendingPhoto => ({
    id,
    ownerKeycloakSub: 'organizer-sub',
    rawKey: `events/pending/organizer-sub/${id}.jpg`,
    mimeType: 'image/jpeg'
  });

  const buildHandler = (pendingPhotos: PendingPhoto[]) => {
    const eventRepository = {
      findPendingPhotosByIds: jest.fn().mockResolvedValue(pendingPhotos),
      save: jest.fn().mockResolvedValue(undefined)
    };

    const objectStorage = {
      rawBucket: 'raw-uploads',
      mediaBucket: 'media',
      statObject: jest.fn().mockResolvedValue({ size: 1000 }),
      copyObject: jest.fn().mockResolvedValue(undefined),
      getPublicUrl: jest.fn().mockReturnValue('https://media.local/photo.jpg')
    };

    return {
      handler: new CreateEventHandler(
        eventRepository as unknown as EventRepository,
        objectStorage as unknown as ObjectStorageService
      ),
      eventRepository,
      objectStorage
    };
  };

  const buildCommand = (photoIds: string[]) =>
    new CreateEventCommand(
      'organizer-sub',
      'Summer Jazz Night',
      longDescription,
      'MUSIC_AND_NIGHTLIFE',
      future(1),
      { latitude: 50.0647, longitude: 19.945 },
      'FREE',
      photoIds
    );

  it('creates an uploaded event without exposing raw media', async () => {
    const photoId = randomUUID();
    const { handler, eventRepository, objectStorage } = buildHandler([pendingPhoto(photoId)]);

    const result = await handler.execute(buildCommand([photoId]));

    expect(result.status).toBe('UPLOADED');
    expect(result.verificationStatus).toBe('UNVERIFIED');
    expect(result.photos).toEqual([]);
    expect(eventRepository.save).toHaveBeenCalledTimes(1);
    expect(objectStorage.copyObject).not.toHaveBeenCalled();
  });

  it('rejects when a photoId is missing/foreign/already linked', async () => {
    const { handler } = buildHandler([]); // repository finds nothing

    await expect(handler.execute(buildCommand([randomUUID()]))).rejects.toThrow(BadRequestException);
  });

  it('rejects when the photo was never uploaded to the raw bucket', async () => {
    const photoId = randomUUID();
    const { handler, objectStorage } = buildHandler([pendingPhoto(photoId)]);
    objectStorage.statObject.mockResolvedValue(null);

    await expect(handler.execute(buildCommand([photoId]))).rejects.toThrow(BadRequestException);
  });

  it('rejects a photo exceeding the 5MB size limit', async () => {
    const photoId = randomUUID();
    const { handler, objectStorage } = buildHandler([pendingPhoto(photoId)]);
    objectStorage.statObject.mockResolvedValue({ size: 6 * 1024 * 1024 });

    await expect(handler.execute(buildCommand([photoId]))).rejects.toThrow(BadRequestException);
  });

  it('maps a domain validation key to a 400 response', async () => {
    const photoId = randomUUID();
    const { handler } = buildHandler([pendingPhoto(photoId)]);
    const command = buildCommand([photoId]);
    const invalid = new CreateEventCommand(
      command.organizerKeycloakSub,
      'x',
      command.description,
      command.category,
      command.startDate,
      command.location,
      command.priceType,
      command.photoIds
    );

    await expect(handler.execute(invalid)).rejects.toMatchObject({
      status: 400,
      response: { message: 'EVENT_TITLE_INVALID' }
    });
  });
});
