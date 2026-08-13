import { RequestPhotoUploadsHandler } from './request-photo-uploads.handler';
import { RequestPhotoUploadsCommand } from './request-photo-uploads.command';
import type { EventRepository } from '../../../domain/event.repository';
import type { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';

describe('RequestPhotoUploadsHandler', () => {
  const buildHandler = () => {
    const createPendingPhotos = jest.fn<Promise<void>, [unknown[]]>().mockResolvedValue(undefined);
    const getPresignedPutUrl = jest
      .fn<Promise<string>, [string, string, number?]>()
      .mockResolvedValue('https://minio.local/presigned-url');
    const eventRepository = {
      createPendingPhotos
    } as unknown as EventRepository;

    const objectStorage = {
      rawBucket: 'raw-uploads',
      getPresignedPutUrl
    } as unknown as ObjectStorageService;

    return {
      handler: new RequestPhotoUploadsHandler(eventRepository, objectStorage),
      createPendingPhotos,
      getPresignedPutUrl
    };
  };

  it('creates one pending photo row and one presigned URL per requested file', async () => {
    const { handler, createPendingPhotos, getPresignedPutUrl } = buildHandler();

    const result = await handler.execute(
      new RequestPhotoUploadsCommand('organizer-sub', [{ mimeType: 'image/jpeg' }, { mimeType: 'image/png' }])
    );

    expect(result).toHaveLength(2);
    expect(result[0].uploadUrl).toBe('https://minio.local/presigned-url');
    expect(result[0].expiresInSeconds).toBe(900);
    expect(createPendingPhotos).toHaveBeenCalledTimes(1);
    expect(getPresignedPutUrl).toHaveBeenCalledTimes(2);

    const insertedPhotos = createPendingPhotos.mock.calls[0][0] as Array<{ rawKey: string }>;
    expect(insertedPhotos).toHaveLength(2);
    expect(insertedPhotos[0].rawKey).toMatch(/^events\/pending\/organizer-sub\/.+\.jpg$/);
    expect(insertedPhotos[1].rawKey).toMatch(/^events\/pending\/organizer-sub\/.+\.png$/);
  });
});
