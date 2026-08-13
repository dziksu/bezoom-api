import { randomUUID } from 'crypto';
import { ConflictException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { EventRepository } from '../../../domain/event.repository';
import { RequestPhotoUploadsCommand } from './request-photo-uploads.command';
import type { PhotoUploadTargetDto } from '../../dto/request-photo-uploads.dto';
import { EventPublicationPolicy } from '../../policies/event-publication.policy';

const UPLOAD_TTL_SECONDS = 900;

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

@CommandHandler(RequestPhotoUploadsCommand)
export class RequestPhotoUploadsHandler implements ICommandHandler<RequestPhotoUploadsCommand, PhotoUploadTargetDto[]> {
  constructor(
    private readonly eventRepository: EventRepository,
    private readonly objectStorage: ObjectStorageService,
    private readonly organizerPolicy: EventPublicationPolicy
  ) {}

  async execute(command: RequestPhotoUploadsCommand): Promise<PhotoUploadTargetDto[]> {
    const { ownerKeycloakSub, files } = command;
    const eligibilityError = await this.organizerPolicy.getEligibilityError(ownerKeycloakSub);
    if (eligibilityError) throw new ConflictException(eligibilityError);

    const pending = files.map((file) => {
      const ext = MIME_EXTENSIONS[file.mimeType] ?? 'bin';
      const id = randomUUID();
      return {
        id,
        ownerKeycloakSub,
        rawKey: `events/pending/${ownerKeycloakSub}/${id}.${ext}`,
        mimeType: file.mimeType
      };
    });

    await this.eventRepository.createPendingPhotos(pending);

    return Promise.all(
      pending.map(async (p) => ({
        photoId: p.id,
        uploadUrl: await this.objectStorage.getPresignedPutUrl(
          this.objectStorage.rawBucket,
          p.rawKey,
          UPLOAD_TTL_SECONDS
        ),
        expiresInSeconds: UPLOAD_TTL_SECONDS
      }))
    );
  }
}
