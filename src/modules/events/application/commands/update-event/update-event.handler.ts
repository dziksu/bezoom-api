import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { EventPhoto } from '../../../domain/event-photo.entity';
import { EventRepository, type RevisablePhoto } from '../../../domain/event.repository';
import { DomainValidationError } from '../../../domain/events.errors';
import { ObjectStorageService } from '@api/shared/infrastructure/storage/object-storage.service';
import { RedisCacheService } from '@api/shared/infrastructure/cache/redis-cache.service';
import type { EventLifecycleResponseDto } from '../../dto/event-response.dto';
import { UpdateEventCommand } from './update-event.command';

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;

@CommandHandler(UpdateEventCommand)
export class UpdateEventHandler implements ICommandHandler<UpdateEventCommand, EventLifecycleResponseDto> {
  constructor(
    private readonly repository: EventRepository,
    private readonly storage: ObjectStorageService,
    private readonly cache: RedisCacheService
  ) {}

  async execute(command: UpdateEventCommand): Promise<EventLifecycleResponseDto> {
    if (Object.values(command.changes).every((value) => value === undefined)) {
      throw new BadRequestException('EVENT_UPDATE_EMPTY');
    }

    const event = await this.repository.findById(command.eventId);
    if (!event || event.archivedAt || event.organizerKeycloakSub !== command.organizerKeycloakSub) {
      throw new NotFoundException('EVENT_NOT_FOUND');
    }

    const photos = command.changes.photoIds
      ? await this.resolvePhotos(command.changes.photoIds, event.id, command.organizerKeycloakSub)
      : event.photos;
    const retainedPhotoIds = new Set(photos.map((photo) => photo.id));
    const removedPhotoIds = event.photos.filter((photo) => !retainedPhotoIds.has(photo.id)).map((photo) => photo.id);
    const priceType = command.changes.priceType ?? event.price.priceType;
    const priceTypeChanged =
      command.changes.priceType !== undefined && command.changes.priceType !== event.price.priceType;

    try {
      event.revise({
        title: command.changes.title ?? event.title,
        description: command.changes.description ?? event.description,
        category: command.changes.category ?? event.category,
        startDate: command.changes.startDate ? new Date(command.changes.startDate) : event.period.startDate,
        endDate:
          command.changes.endDate === null
            ? undefined
            : command.changes.endDate
              ? new Date(command.changes.endDate)
              : event.period.endDate,
        location: command.changes.location ?? {
          latitude: event.location.coordinates.latitude,
          longitude: event.location.coordinates.longitude,
          address: event.location.address,
          city: event.location.city,
          country: event.location.country
        },
        price: {
          priceType,
          priceMin:
            command.changes.priceMin === null
              ? undefined
              : (command.changes.priceMin ?? (priceTypeChanged ? undefined : event.price.priceMin)),
          priceMax:
            command.changes.priceMax === null
              ? undefined
              : (command.changes.priceMax ?? (priceTypeChanged ? undefined : event.price.priceMax)),
          currency: command.changes.currency ?? event.price.currency,
          ticketUrl:
            command.changes.ticketUrl === null ? undefined : (command.changes.ticketUrl ?? event.price.ticketUrl),
          priceNotes:
            command.changes.priceNotes === null ? undefined : (command.changes.priceNotes ?? event.price.priceNotes)
        },
        amenities: command.changes.amenities ?? event.amenities,
        photos
      });
    } catch (error) {
      if (error instanceof DomainValidationError) {
        if (error.code === 'EVENT_ARCHIVED' || error.code === 'EVENT_NOT_EDITABLE') {
          throw new ConflictException(error.code);
        }
        throw new BadRequestException(error.code);
      }
      throw error;
    }

    await this.repository.update(event, { removedPhotoIds });
    await Promise.all([this.cache.delete('event_detail', event.id), this.cache.incrementVersion('event_map')]);
    return this.lifecycle(event);
  }

  private async resolvePhotos(ids: string[], eventId: string, ownerSub: string): Promise<EventPhoto[]> {
    const rows = await this.repository.findPhotosForRevision(ids, ownerSub, eventId);
    if (rows.length !== ids.length || rows.some((row) => row.status === 'REJECTED')) {
      throw new BadRequestException('EVENT_PHOTO_IDS_INVALID');
    }
    const byId = new Map(rows.map((row) => [row.id, row]));

    return Promise.all(
      ids.map(async (id, position) => {
        const row = byId.get(id)!;
        if (row.status === 'READY' && row.mediaKey) return this.reconstitutePhoto(row, position);

        const stat = await this.storage.statObject(this.storage.rawBucket, row.rawKey);
        if (!stat) throw new BadRequestException('EVENT_PHOTO_NOT_UPLOADED');
        if (stat.size > MAX_PHOTO_SIZE_BYTES) throw new BadRequestException('EVENT_PHOTO_TOO_LARGE');
        if (stat.mimeType && stat.mimeType !== row.mimeType) {
          throw new BadRequestException('EVENT_PHOTO_MIME_MISMATCH');
        }
        return EventPhoto.uploaded({
          id: row.id,
          rawKey: row.rawKey,
          position,
          mimeType: row.mimeType,
          sizeBytes: stat.size
        });
      })
    );
  }

  private reconstitutePhoto(row: RevisablePhoto, position: number): EventPhoto {
    return EventPhoto.reconstitute({
      id: row.id,
      rawKey: row.rawKey,
      mediaKey: row.mediaKey ?? undefined,
      position,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes ?? undefined,
      status: row.status
    });
  }

  private lifecycle(event: {
    id: string;
    status: string;
    mediaPipelineStatus: string;
    verificationStatus: string;
    archivedAt?: Date;
    updatedAt: Date;
  }): EventLifecycleResponseDto {
    return {
      id: event.id,
      status: event.status,
      mediaPipelineStatus: event.mediaPipelineStatus,
      verificationStatus: event.verificationStatus,
      archivedAt: event.archivedAt,
      updatedAt: event.updatedAt
    };
  }
}
